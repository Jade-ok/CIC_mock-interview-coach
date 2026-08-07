"""Translate between the browser protocol and Nova 2 Sonic events."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from typing import Any

try:
    from .s2s_events import (
        audio_input_event,
        content_end_event,
        content_start_audio_event,
        content_start_text_event,
        prompt_end_event,
        prompt_start_event,
        session_end_event,
        session_start_event,
        text_input_event,
        tool_result_event,
    )
except ImportError:  # Direct execution from backend/voice_agent.
    from s2s_events import (
        audio_input_event,
        content_end_event,
        content_start_audio_event,
        content_start_text_event,
        prompt_end_event,
        prompt_start_event,
        session_end_event,
        session_start_event,
        text_input_event,
        tool_result_event,
    )


class BrowserProtocolError(ValueError):
    """Raised when a browser message violates the relay contract."""


@dataclass
class ClientMessageResult:
    nova_events: list[str] = field(default_factory=list)
    audio_events: list[str] = field(default_factory=list)
    browser_events: list[dict[str, Any]] = field(default_factory=list)
    should_close: bool = False


class BrowserSessionProtocol:
    """Stateful adapter for one browser WebSocket session."""

    def __init__(self) -> None:
        self.browser_session_id = str(uuid.uuid4())
        self.prompt_name = str(uuid.uuid4())
        self.audio_content_name = str(uuid.uuid4())
        self.started = False
        self.closed = False
        self.output_content: dict[str, dict[str, str]] = {}
        self.pending_end_tool: dict[str, Any] | None = None

    def handle_client_message(self, message: str) -> ClientMessageResult:
        try:
            data = json.loads(message)
        except json.JSONDecodeError as exc:
            raise BrowserProtocolError("Message must be valid JSON") from exc

        if not isinstance(data, dict):
            raise BrowserProtocolError("Message must be a JSON object")

        message_type = data.get("type")
        payload = data.get("payload", {})
        if not isinstance(payload, dict):
            raise BrowserProtocolError("Message payload must be an object")

        if message_type == "session_start":
            return self._start_session(payload)
        if message_type == "audio_chunk":
            return self._audio_chunk(payload)
        if message_type == "text_input":
            return self._text_input(payload)
        if message_type == "session_end":
            return self._end_session()
        raise BrowserProtocolError(f"Unsupported message type: {message_type}")

    def _start_session(self, payload: dict[str, Any]) -> ClientMessageResult:
        if self.started:
            raise BrowserProtocolError("Session has already started")

        context = payload.get("novaSonicContext")
        if not isinstance(context, str) or not context.strip():
            raise BrowserProtocolError("novaSonicContext must be a non-empty string")

        config = payload.get("inferenceConfig", {})
        if not isinstance(config, dict):
            raise BrowserProtocolError("inferenceConfig must be an object")

        max_tokens = self._number(config, "maxTokens", 1024, int)
        temperature = self._number(config, "temperature", 0.7, float)
        top_p = self._number(config, "topP", 0.9, float)
        endpointing = config.get("endpointingSensitivity", "HIGH")
        voice_id = config.get("voiceId", "matthew")
        if endpointing not in {"LOW", "MEDIUM", "HIGH"}:
            raise BrowserProtocolError("endpointingSensitivity must be LOW, MEDIUM, or HIGH")
        if not isinstance(voice_id, str) or not voice_id:
            raise BrowserProtocolError("voiceId must be a non-empty string")

        system_content_name = str(uuid.uuid4())
        kickoff_content_name = str(uuid.uuid4())
        end_interview_tool = {
            "toolSpec": {
                "name": "end_interview",
                "description": (
                    "Signal that the scripted interview is complete. Use this only after "
                    "the candidate answers the third follow-up and you deliver the final closing."
                ),
                "inputSchema": {
                    "json": {
                        "type": "object",
                        "properties": {},
                        "required": [],
                    }
                },
            }
        }
        self.started = True
        return ClientMessageResult(
            nova_events=[
                session_start_event(max_tokens, temperature, top_p, endpointing),
                prompt_start_event(
                    self.prompt_name,
                    voice_id,
                    tools=[end_interview_tool],
                ),
                content_start_text_event(
                    self.prompt_name,
                    system_content_name,
                    role="SYSTEM",
                    interactive=False,
                ),
                text_input_event(self.prompt_name, system_content_name, context),
                content_end_event(self.prompt_name, system_content_name),
                content_start_text_event(
                    self.prompt_name,
                    kickoff_content_name,
                    role="USER",
                    interactive=True,
                ),
                text_input_event(
                    self.prompt_name,
                    kickoff_content_name,
                    "Begin the interview now. Greet me briefly and ask the first question.",
                ),
                content_end_event(self.prompt_name, kickoff_content_name),
                content_start_audio_event(self.prompt_name, self.audio_content_name),
            ],
            browser_events=[
                {
                    "type": "session_start_ack",
                    "payload": {"sessionId": self.browser_session_id},
                }
            ],
        )

    def _audio_chunk(self, payload: dict[str, Any]) -> ClientMessageResult:
        self._require_active_session()
        content = payload.get("content")
        if not isinstance(content, str) or not content:
            raise BrowserProtocolError("Audio content must be a non-empty base64 string")
        return ClientMessageResult(
            audio_events=[
                audio_input_event(self.prompt_name, self.audio_content_name, content)
            ]
        )

    def _text_input(self, payload: dict[str, Any]) -> ClientMessageResult:
        self._require_active_session()
        content = payload.get("content")
        if not isinstance(content, str) or not content.strip():
            raise BrowserProtocolError("Text content must be a non-empty string")
        content_name = str(uuid.uuid4())
        return ClientMessageResult(
            nova_events=[
                content_start_text_event(
                    self.prompt_name,
                    content_name,
                    role="USER",
                    interactive=True,
                ),
                text_input_event(self.prompt_name, content_name, content),
                content_end_event(self.prompt_name, content_name),
            ]
        )

    def _end_session(self) -> ClientMessageResult:
        self._require_active_session()
        self.closed = True
        return ClientMessageResult(
            nova_events=[
                content_end_event(self.prompt_name, self.audio_content_name),
                prompt_end_event(self.prompt_name),
                session_end_event(),
            ],
            should_close=True,
        )

    def translate_nova_event(self, response: dict[str, Any]) -> dict[str, Any] | None:
        event = response.get("event")
        if not isinstance(event, dict):
            return None

        if "contentStart" in event:
            content_start = event["contentStart"]
            if not isinstance(content_start, dict):
                return None
            content_id = str(content_start.get("contentId", ""))
            metadata = self._content_metadata(content_start)
            if content_id:
                self.output_content[content_id] = metadata
            return None

        if "audioOutput" in event:
            output = event["audioOutput"]
            if not isinstance(output, dict) or not isinstance(output.get("content"), str):
                return None
            return {
                "type": "audio_output",
                "payload": {
                    "content": output["content"],
                    "contentId": str(output.get("contentId", "")),
                },
            }

        if "textOutput" in event:
            output = event["textOutput"]
            if not isinstance(output, dict) or not isinstance(output.get("content"), str):
                return None
            content_id = str(output.get("contentId", ""))
            metadata = self.output_content.get(content_id, {})
            role = str(output.get("role") or metadata.get("role") or "ASSISTANT")
            stage = str(metadata.get("generationStage") or "FINAL")
            return {
                "type": "text_output",
                "payload": {
                    "content": output["content"],
                    "role": "user" if role == "USER" else "interviewer",
                    "generationStage": "FINAL" if stage == "FINAL" else "PARTIAL",
                },
            }

        if "toolUse" in event:
            output = event["toolUse"]
            if not isinstance(output, dict):
                return None
            browser_event = {
                "type": "tool_use",
                "payload": {
                    "toolName": str(output.get("toolName", "")),
                    "toolUseId": str(output.get("toolUseId", "")),
                    "content": str(output.get("content", "")),
                },
            }
            if output.get("toolName") == "end_interview":
                self.pending_end_tool = browser_event
                return None
            return browser_event

        if "contentEnd" in event:
            output = event["contentEnd"]
            if not isinstance(output, dict):
                return None
            content_id = str(output.get("contentId", ""))
            stop_reason = str(output.get("stopReason", ""))
            self.output_content.pop(content_id, None)
            if stop_reason == "INTERRUPTED":
                return {"type": "interrupted", "payload": {"contentId": content_id}}
            return {
                "type": "content_end",
                "payload": {"contentId": content_id, "stopReason": stop_reason},
            }

        if "completionEnd" in event:
            output = event["completionEnd"]
            if not isinstance(output, dict):
                return None
            return {
                "type": "completion_end",
                "payload": {
                    "completionId": str(output.get("completionId", "")),
                    "stopReason": str(output.get("stopReason", "")),
                },
            }

        return None

    def build_tool_result(self, response: dict[str, Any]) -> str | None:
        """Build the mandatory result event for a Nova tool invocation."""
        output = response.get("event", {}).get("toolUse")
        if not isinstance(output, dict):
            return None
        if output.get("toolName") != "end_interview":
            return None
        content_name = output.get("contentId")
        if not isinstance(content_name, str) or not content_name:
            return None
        content = json.dumps({
            "success": True,
            "message": "The interview session is ending.",
        })
        return tool_result_event(self.prompt_name, content_name, content)

    def take_pending_end_tool(self) -> dict[str, Any] | None:
        """Release end_interview only after Nova finishes the completion."""
        event = self.pending_end_tool
        self.pending_end_tool = None
        return event

    def _require_active_session(self) -> None:
        if not self.started or self.closed:
            raise BrowserProtocolError("Session is not active")

    @staticmethod
    def _number(
        config: dict[str, Any], key: str, default: int | float, cast: type
    ) -> int | float:
        value = config.get(key, default)
        if isinstance(value, bool):
            raise BrowserProtocolError(f"{key} must be numeric")
        try:
            return cast(value)
        except (TypeError, ValueError) as exc:
            raise BrowserProtocolError(f"{key} must be numeric") from exc

    @staticmethod
    def _content_metadata(content_start: dict[str, Any]) -> dict[str, str]:
        metadata = {
            "role": str(content_start.get("role", "")),
            "type": str(content_start.get("type", "")),
        }
        additional = content_start.get("additionalModelFields")
        if isinstance(additional, str):
            try:
                additional = json.loads(additional)
            except json.JSONDecodeError:
                additional = {}
        if isinstance(additional, dict) and "generationStage" in additional:
            metadata["generationStage"] = str(additional["generationStage"])
        return metadata
