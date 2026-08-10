"""Unit tests for the browser-to-Nova voice protocol adapter."""

import asyncio
import json
import sys
from pathlib import Path

import pytest
from fastapi import WebSocketDisconnect

VOICE_AGENT_DIR = Path(__file__).resolve().parents[2] / "backend" / "voice_agent"
sys.path.insert(0, str(VOICE_AGENT_DIR))

from protocol import BrowserProtocolError, BrowserSessionProtocol  # noqa: E402
from s2s_session_manager import Boto3CredentialsResolver  # noqa: E402
import server as voice_server  # noqa: E402


def test_voice_session_duration_is_unlimited_locally(monkeypatch):
    monkeypatch.delenv("HOSTED_GUARDRAILS_ENABLED", raising=False)
    assert voice_server._max_session_duration_seconds() is None


def test_voice_session_duration_is_bounded_when_hosted(monkeypatch):
    monkeypatch.setenv("HOSTED_GUARDRAILS_ENABLED", "true")
    assert voice_server._max_session_duration_seconds() == 8 * 60


def event_name(event_json: str) -> str:
    return next(iter(json.loads(event_json)["event"]))


def start_protocol(protocol: BrowserSessionProtocol) -> None:
    protocol.handle_client_message(json.dumps({
        "type": "session_start",
        "payload": {"novaSonicContext": "Context", "inferenceConfig": {}},
    }))


def test_session_start_builds_complete_nova_setup_and_ack():
    protocol = BrowserSessionProtocol()

    result = protocol.handle_client_message(json.dumps({
        "type": "session_start",
        "payload": {
            "novaSonicContext": "You are a supportive interviewer.",
            "inferenceConfig": {
                "maxTokens": 512,
                "temperature": 0.4,
                "topP": 0.8,
                "endpointingSensitivity": "MEDIUM",
                "voiceId": "tiffany",
            },
        },
    }))

    assert [event_name(item) for item in result.nova_events] == [
        "sessionStart", "promptStart", "contentStart", "textInput",
        "contentEnd", "contentStart", "textInput", "contentEnd", "contentStart",
    ]
    assert result.browser_events == [{
        "type": "session_start_ack",
        "payload": {"sessionId": protocol.browser_session_id},
    }]

    events = [json.loads(item)["event"] for item in result.nova_events]
    assert events[0]["sessionStart"]["inferenceConfiguration"] == {
        "maxTokens": 512,
        "topP": 0.8,
        "temperature": 0.4,
    }
    assert events[1]["promptStart"]["promptName"] == protocol.prompt_name
    assert events[1]["promptStart"]["audioOutputConfiguration"]["voiceId"] == "tiffany"
    tool_spec = events[1]["promptStart"]["toolConfiguration"]["tools"][0]["toolSpec"]
    assert tool_spec["name"] == "end_interview"
    tool_schema = json.loads(tool_spec["inputSchema"]["json"])
    assert tool_schema["required"] == []
    assert "additionalProperties" not in tool_schema
    assert events[2]["contentStart"]["interactive"] is False
    assert events[3]["textInput"]["content"] == "You are a supportive interviewer."
    assert events[5]["contentStart"]["role"] == "USER"
    assert events[6]["textInput"]["content"].startswith("Begin the interview")
    assert events[8]["contentStart"]["contentName"] == protocol.audio_content_name


def test_audio_chunk_uses_server_owned_identifiers():
    protocol = BrowserSessionProtocol()
    start_protocol(protocol)

    result = protocol.handle_client_message(json.dumps({
        "type": "audio_chunk",
        "payload": {
            "content": "AQIDBA==",
            "promptName": "browser-prompt",
            "contentName": "browser-content",
        },
    }))

    audio_input = json.loads(result.audio_events[0])["event"]["audioInput"]
    assert audio_input == {
        "promptName": protocol.prompt_name,
        "contentName": protocol.audio_content_name,
        "content": "AQIDBA==",
    }


def test_text_input_is_cross_modal_user_content():
    protocol = BrowserSessionProtocol()
    start_protocol(protocol)

    result = protocol.handle_client_message(json.dumps({
        "type": "text_input",
        "payload": {"content": "My typed answer"},
    }))

    events = [json.loads(item)["event"] for item in result.nova_events]
    assert events[0]["contentStart"]["role"] == "USER"
    assert events[0]["contentStart"]["interactive"] is True
    assert events[1]["textInput"]["content"] == "My typed answer"
    assert "contentEnd" in events[2]


def test_session_end_closes_audio_prompt_and_session():
    protocol = BrowserSessionProtocol()
    start_protocol(protocol)

    result = protocol.handle_client_message(json.dumps({
        "type": "session_end",
        "payload": {},
    }))

    assert [event_name(item) for item in result.nova_events] == [
        "contentEnd", "promptEnd", "sessionEnd",
    ]
    assert result.should_close is True


def test_messages_before_session_start_are_rejected():
    protocol = BrowserSessionProtocol()

    with pytest.raises(BrowserProtocolError, match="Session is not active"):
        protocol.handle_client_message(json.dumps({
            "type": "audio_chunk",
            "payload": {"content": "AQIDBA=="},
        }))


def test_final_user_transcript_is_translated():
    protocol = BrowserSessionProtocol()
    content_id = "content-1"

    assert protocol.translate_nova_event({
        "event": {"contentStart": {
            "contentId": content_id,
            "type": "TEXT",
            "role": "USER",
            "additionalModelFields": json.dumps({"generationStage": "FINAL"}),
        }}
    }) is None

    assert protocol.translate_nova_event({
        "event": {"textOutput": {
            "contentId": content_id,
            "content": "I built the API.",
        }}
    }) == {
        "type": "text_output",
        "payload": {
            "content": "I built the API.",
            "role": "user",
            "generationStage": "FINAL",
        },
    }


def test_speculative_assistant_text_is_partial():
    protocol = BrowserSessionProtocol()
    content_id = "content-2"
    protocol.translate_nova_event({
        "event": {"contentStart": {
            "contentId": content_id,
            "type": "TEXT",
            "role": "ASSISTANT",
            "additionalModelFields": json.dumps({"generationStage": "SPECULATIVE"}),
        }}
    })

    translated = protocol.translate_nova_event({
        "event": {"textOutput": {
            "contentId": content_id,
            "content": "Draft response",
        }}
    })

    assert translated["payload"]["role"] == "interviewer"
    assert translated["payload"]["generationStage"] == "PARTIAL"


def test_audio_and_interruption_are_translated():
    protocol = BrowserSessionProtocol()

    assert protocol.translate_nova_event({
        "event": {"audioOutput": {
            "contentId": "audio-1",
            "content": "AQIDBA==",
        }}
    }) == {
        "type": "audio_output",
        "payload": {"content": "AQIDBA==", "contentId": "audio-1"},
    }

    assert protocol.translate_nova_event({
        "event": {"contentEnd": {
            "contentId": "audio-1",
            "stopReason": "INTERRUPTED",
        }}
    }) == {
        "type": "interrupted",
        "payload": {"contentId": "audio-1"},
    }


def test_end_interview_tool_is_acknowledged_then_released_after_completion():
    protocol = BrowserSessionProtocol()
    start_protocol(protocol)
    tool_use = {
        "event": {"toolUse": {
            "contentId": "tool-content-1",
            "toolUseId": "tool-use-1",
            "toolName": "end_interview",
            "content": "{}",
        }}
    }

    assert protocol.translate_nova_event(tool_use) is None
    assert protocol.end_interview_signaled is True
    result = json.loads(protocol.build_tool_result(tool_use))
    assert result["event"]["toolResult"]["promptName"] == protocol.prompt_name
    assert result["event"]["toolResult"]["contentName"] == "tool-content-1"
    assert json.loads(result["event"]["toolResult"]["content"])["success"] is True

    assert protocol.take_pending_end_tool() == {
        "type": "tool_use",
        "payload": {
            "toolName": "end_interview",
            "toolUseId": "tool-use-1",
            "content": "{}",
        },
    }
    assert protocol.take_pending_end_tool() is None


def test_response_forwarder_acknowledges_tool_before_browser_auto_end():
    protocol = BrowserSessionProtocol()
    start_protocol(protocol)

    class FakeSessionManager:
        def __init__(self):
            self.is_active = True
            self.sent = []

        async def process_responses(self):
            yield {"event": {"toolUse": {
                "contentId": "tool-content-1",
                "toolUseId": "tool-use-1",
                "toolName": "end_interview",
                "content": "{}",
            }}}
            yield {"event": {"completionEnd": {
                "completionId": "completion-1",
                "stopReason": "END_TURN",
            }}}

        async def send_event(self, event_json):
            self.sent.append(json.loads(event_json))

    class FakeWebSocket:
        def __init__(self):
            self.sent = []
            self.json_events = []
            self.close_args = None

        async def send_text(self, event_json):
            self.sent.append(json.loads(event_json))

        async def send_json(self, event):
            self.json_events.append(event)

        async def close(self, **kwargs):
            self.close_args = kwargs

    manager = FakeSessionManager()
    websocket = FakeWebSocket()
    asyncio.run(voice_server.forward_responses(manager, websocket, protocol))

    assert "toolResult" in manager.sent[0]["event"]
    assert [item["type"] for item in websocket.sent] == [
        "completion_end",
        "tool_use",
    ]
    assert websocket.json_events == []
    assert websocket.close_args is None


def test_response_forwarder_reports_unexpected_nova_stream_end():
    protocol = BrowserSessionProtocol()
    start_protocol(protocol)

    class FakeSessionManager:
        def __init__(self):
            self.is_active = True

        async def process_responses(self):
            if False:
                yield {}

    class FakeWebSocket:
        def __init__(self):
            self.sent = []
            self.close_args = None

        async def send_json(self, event):
            self.sent.append(event)

        async def close(self, **kwargs):
            self.close_args = kwargs

    manager = FakeSessionManager()
    websocket = FakeWebSocket()
    asyncio.run(voice_server.forward_responses(manager, websocket, protocol))

    assert websocket.sent == [
        {
            "type": "session_invalid",
            "payload": {
                "reason": (
                    "The voice interview could not start with this interview "
                    "context. Please go back and try again."
                )
            },
        }
    ]
    assert websocket.close_args == {
        "code": 1011,
        "reason": "Voice response stream ended",
    }
    assert manager.is_active is False


def test_boto3_resolver_bridges_refreshable_credentials():
    class FakeCredentials:
        def get_frozen_credentials(self):
            return type("Frozen", (), {
                "access_key": "temporary-access-key",
                "secret_key": "temporary-secret-key",
                "token": "temporary-session-token",
            })()

    class FakeSession:
        def get_credentials(self):
            return FakeCredentials()

    identity = asyncio.run(
        Boto3CredentialsResolver(FakeSession()).get_identity(properties={})
    )

    assert identity.access_key_id == "temporary-access-key"
    assert identity.secret_access_key == "temporary-secret-key"
    assert identity.session_token == "temporary-session-token"


def test_websocket_endpoint_adapts_browser_session_without_aws(monkeypatch):
    class FakeSessionManager:
        def __init__(self):
            self.is_active = False
            self.events = []
            self.audio_events = []

        async def start_session(self):
            self.is_active = True

        async def send_event(self, event_json):
            self.events.append(event_json)

        async def send_audio_chunk(self, event_json):
            self.audio_events.append(event_json)

        async def process_responses(self):
            while self.is_active:
                await asyncio.sleep(0.01)
            if False:
                yield {}

        async def drain_audio_queue(self):
            while self.is_active:
                await asyncio.sleep(0.01)

        async def close(self):
            self.is_active = False

    fake_manager = FakeSessionManager()
    monkeypatch.setattr(voice_server, "S2sSessionManager", lambda: fake_manager)

    class FakeWebSocket:
        def __init__(self):
            self.messages = [
                json.dumps({
                    "type": "session_start",
                    "payload": {"novaSonicContext": "Context", "inferenceConfig": {}},
                }),
                json.dumps({
                    "type": "audio_chunk",
                    "payload": {"content": "AQIDBA=="},
                }),
                json.dumps({"type": "session_end", "payload": {}}),
            ]
            self.sent = []

        async def accept(self):
            return None

        async def receive_text(self):
            if not self.messages:
                raise WebSocketDisconnect()
            return self.messages.pop(0)

        async def send_json(self, event):
            self.sent.append(event)

        async def send_text(self, event):
            self.sent.append(json.loads(event))

        async def close(self, **_kwargs):
            return None

    websocket = FakeWebSocket()
    asyncio.run(voice_server.websocket_endpoint(websocket))

    assert websocket.sent[0]["type"] == "session_start_ack"
    assert [event_name(item) for item in fake_manager.events] == [
        "sessionStart", "promptStart", "contentStart", "textInput",
        "contentEnd", "contentStart", "textInput", "contentEnd", "contentStart",
        "contentEnd", "promptEnd", "sessionEnd",
    ]
    assert [event_name(item) for item in fake_manager.audio_events] == ["audioInput"]


def test_hosted_websocket_duration_limit_notifies_closes_and_cleans_up(monkeypatch):
    class FakeSessionManager:
        def __init__(self):
            self.closed = False

        async def close(self):
            self.closed = True

    fake_manager = FakeSessionManager()
    monkeypatch.setattr(voice_server, "S2sSessionManager", lambda: fake_manager)
    monkeypatch.setattr(voice_server, "_max_session_duration_seconds", lambda: 0)

    class FakeWebSocket:
        def __init__(self):
            self.sent = []
            self.close_args = None

        async def accept(self):
            return None

        async def receive_text(self):
            raise AssertionError("An expired hosted session must not wait for input")

        async def send_json(self, event):
            self.sent.append(event)

        async def close(self, **kwargs):
            self.close_args = kwargs

    websocket = FakeWebSocket()
    asyncio.run(voice_server.websocket_endpoint(websocket))

    assert websocket.sent == [{
        "type": "session_invalid",
        "payload": {"reason": "Voice session reached the 8-minute limit"},
    }]
    assert websocket.close_args == {
        "code": 1000,
        "reason": "Session duration limit reached",
    }
    assert fake_manager.closed is True
