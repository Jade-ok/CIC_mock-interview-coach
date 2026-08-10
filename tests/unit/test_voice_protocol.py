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
import s2s_session_manager as s2s_module  # noqa: E402
from s2s_session_manager import (  # noqa: E402
    AudioInputStreamError,
    Boto3CredentialsResolver,
    S2sSessionManager,
)
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
    assert protocol.end_interview_completed is False
    assert protocol.build_tool_result_events(tool_use) == []

    tool_end = {
        "event": {"contentEnd": {
            "contentId": "tool-content-1",
            "type": "TOOL",
            "stopReason": "TOOL_USE",
        }}
    }
    results = [json.loads(item) for item in protocol.build_tool_result_events(tool_end)]
    assert [next(iter(item["event"])) for item in results] == [
        "contentStart",
        "toolResult",
        "contentEnd",
    ]
    content_name = results[0]["event"]["contentStart"]["contentName"]
    assert content_name != "tool-content-1"
    assert results[0]["event"]["contentStart"]["toolResultInputConfiguration"][
        "toolUseId"
    ] == "tool-use-1"
    assert results[1]["event"]["toolResult"]["contentName"] == content_name
    assert json.loads(results[1]["event"]["toolResult"]["content"])["success"] is True
    assert results[2]["event"]["contentEnd"]["contentName"] == content_name
    assert protocol.build_tool_result_events(tool_end) == []

    assert protocol.take_pending_end_tool() == {
        "type": "tool_use",
        "payload": {
            "toolName": "end_interview",
            "toolUseId": "tool-use-1",
            "content": "{}",
        },
    }
    assert protocol.end_interview_completed is True
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
            yield {"event": {"contentEnd": {
                "contentId": "tool-content-1",
                "type": "TOOL",
                "stopReason": "TOOL_USE",
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

    assert [next(iter(item["event"])) for item in manager.sent] == [
        "contentStart",
        "toolResult",
        "contentEnd",
    ]
    assert [item["type"] for item in websocket.sent] == [
        "content_end",
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
                    "The voice interview ended unexpectedly. Please go back "
                    "and try again."
                )
            },
        }
    ]
    assert websocket.close_args == {
        "code": 1011,
        "reason": "Voice response stream ended",
    }
    assert manager.is_active is False


def test_response_forwarder_reports_stream_end_before_completion_releases_tool():
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

        async def send_event(self, event_json):
            self.sent.append(json.loads(event_json))

    class FakeWebSocket:
        def __init__(self):
            self.sent = []
            self.close_args = None

        async def send_text(self, event_json):
            self.sent.append(json.loads(event_json))

        async def send_json(self, event):
            self.sent.append(event)

        async def close(self, **kwargs):
            self.close_args = kwargs

    manager = FakeSessionManager()
    websocket = FakeWebSocket()
    asyncio.run(voice_server.forward_responses(manager, websocket, protocol))

    assert manager.sent == []
    assert protocol.end_interview_completed is False
    assert websocket.sent == [
        {
            "type": "session_invalid",
            "payload": {
                "reason": (
                    "The voice interview ended unexpectedly. Please go back "
                    "and try again."
                )
            },
        }
    ]
    assert websocket.close_args == {
        "code": 1011,
        "reason": "Voice response stream ended",
    }


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


def test_stop_audio_input_waits_for_inflight_send_and_discards_pending_audio():
    async def scenario():
        manager = S2sSessionManager()
        manager.is_active = True
        manager.accepting_audio = True
        first_send_started = asyncio.Event()
        release_first_send = asyncio.Event()
        sent = []

        async def fake_send_event(event_json):
            sent.append(event_json)
            first_send_started.set()
            await release_first_send.wait()

        manager.send_event = fake_send_event
        await manager.send_audio_chunk("first-audio")
        await manager.send_audio_chunk("queued-audio")
        drain_task = asyncio.create_task(manager.drain_audio_queue())
        await first_send_started.wait()

        stop_task = asyncio.create_task(manager.stop_audio_input())
        await asyncio.sleep(0)
        assert stop_task.done() is False

        release_first_send.set()
        await stop_task

        # The audio-specific gate must reject late chunks even while the Nova
        # session remains active long enough to send its terminal events.
        await manager.send_audio_chunk("late-audio")
        assert manager.audio_queue.empty()

        manager.is_active = False
        await drain_task

        assert sent == ["first-audio"]

    asyncio.run(scenario())


def test_stalled_audio_send_is_bounded_and_disables_audio(monkeypatch):
    async def scenario():
        manager = S2sSessionManager()
        manager.is_active = True
        manager.accepting_audio = True

        class StalledInputStream:
            async def send(self, _event):
                await asyncio.Event().wait()

        manager.stream = type("Stream", (), {"input_stream": StalledInputStream()})()
        monkeypatch.setattr(s2s_module, "INPUT_SEND_TIMEOUT_SECONDS", 0.01)
        await manager.send_audio_chunk("stalled-audio")

        with pytest.raises(AudioInputStreamError, match="could not be sent"):
            await manager.drain_audio_queue()

        assert manager.is_active is False
        assert manager.accepting_audio is False
        assert manager.audio_queue.empty()

    asyncio.run(scenario())


def test_websocket_endpoint_adapts_browser_session_without_aws(monkeypatch):
    class FakeSessionManager:
        def __init__(self):
            self.is_active = False
            self.events = []
            self.audio_events = []
            self.timeline = []

        async def start_session(self):
            self.is_active = True

        async def send_event(self, event_json):
            self.events.append(event_json)
            self.timeline.append(event_name(event_json))

        async def send_audio_chunk(self, event_json):
            self.audio_events.append(event_json)

        async def stop_audio_input(self):
            self.timeline.append("stopAudioInput")

        async def send_terminal_events(self, event_jsons):
            for event_json in event_jsons:
                await self.send_event(event_json)

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
    assert fake_manager.timeline[-4:] == [
        "stopAudioInput", "contentEnd", "promptEnd", "sessionEnd",
    ]


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


def test_terminal_events_are_atomic_and_reject_late_writers():
    async def scenario():
        manager = S2sSessionManager()
        manager.is_active = True
        manager.accepting_audio = True
        first_send_started = asyncio.Event()
        release_first_send = asyncio.Event()
        sent_event_names = []

        class ControlledInputStream:
            async def send(self, event):
                payload = json.loads(event.value.bytes_.decode("utf-8"))
                name = next(iter(payload["event"]))
                sent_event_names.append(name)
                if name == "toolResult":
                    first_send_started.set()
                    await release_first_send.wait()

        manager.stream = type(
            "Stream", (), {"input_stream": ControlledInputStream()}
        )()
        initial_tool = json.dumps({"event": {"toolResult": {}}})
        late_tool = json.dumps({"event": {"toolResult": {}}})
        terminal = [
            json.dumps({"event": {"contentEnd": {}}}),
            json.dumps({"event": {"promptEnd": {}}}),
            json.dumps({"event": {"sessionEnd": {}}}),
        ]

        initial_task = asyncio.create_task(manager.send_event(initial_tool))
        await first_send_started.wait()
        terminal_task = asyncio.create_task(manager.send_terminal_events(terminal))
        await asyncio.sleep(0)
        late_task = asyncio.create_task(manager.send_event(late_tool))
        release_first_send.set()
        await asyncio.gather(initial_task, terminal_task, late_task)

        assert sent_event_names == [
            "toolResult", "contentEnd", "promptEnd", "sessionEnd",
        ]
        assert manager.closing_input is True

    asyncio.run(scenario())


def test_websocket_endpoint_surfaces_audio_drain_failure(monkeypatch):
    class FakeSessionManager:
        def __init__(self):
            self.is_active = False
            self.closed = False

        async def start_session(self):
            self.is_active = True

        async def send_event(self, _event_json):
            return None

        async def send_audio_chunk(self, _event_json):
            return None

        async def stop_audio_input(self):
            return None

        async def process_responses(self):
            while self.is_active:
                await asyncio.sleep(0.01)
            if False:
                yield {}

        async def drain_audio_queue(self):
            await asyncio.sleep(0)
            self.is_active = False
            raise AudioInputStreamError("simulated audio failure")

        async def close(self):
            self.is_active = False
            self.closed = True

    fake_manager = FakeSessionManager()
    monkeypatch.setattr(voice_server, "S2sSessionManager", lambda: fake_manager)

    class FakeWebSocket:
        def __init__(self):
            self.receive_count = 0
            self.sent = []
            self.close_args = None

        async def accept(self):
            return None

        async def receive_text(self):
            self.receive_count += 1
            if self.receive_count == 1:
                return json.dumps({
                    "type": "session_start",
                    "payload": {"novaSonicContext": "Context", "inferenceConfig": {}},
                })
            await asyncio.Event().wait()

        async def send_json(self, event):
            self.sent.append(event)

        async def close(self, **kwargs):
            self.close_args = kwargs

    websocket = FakeWebSocket()
    asyncio.run(voice_server.websocket_endpoint(websocket))

    assert websocket.sent[0]["type"] == "session_start_ack"
    assert websocket.sent[1] == {
        "type": "session_invalid",
        "payload": {
            "reason": (
                "The voice connection could not continue. Please go back and try again."
            )
        },
    }
    assert websocket.close_args == {
        "code": 1011,
        "reason": "Voice audio input failed",
    }
    assert fake_manager.closed is True


def test_websocket_endpoint_observes_response_forwarder_close_once(monkeypatch):
    class FakeSessionManager:
        def __init__(self):
            self.is_active = False
            self.closed = False

        async def start_session(self):
            self.is_active = True

        async def send_event(self, _event_json):
            return None

        async def send_audio_chunk(self, _event_json):
            return None

        async def stop_audio_input(self):
            return None

        async def process_responses(self):
            if False:
                yield {}

        async def drain_audio_queue(self):
            while self.is_active:
                await asyncio.sleep(0.01)

        async def close(self):
            self.is_active = False
            self.closed = True

    fake_manager = FakeSessionManager()
    monkeypatch.setattr(voice_server, "S2sSessionManager", lambda: fake_manager)

    class FakeWebSocket:
        def __init__(self):
            self.receive_count = 0
            self.sent = []
            self.close_calls = []

        async def accept(self):
            return None

        async def receive_text(self):
            self.receive_count += 1
            if self.receive_count == 1:
                return json.dumps({
                    "type": "session_start",
                    "payload": {"novaSonicContext": "Context", "inferenceConfig": {}},
                })
            await asyncio.Event().wait()

        async def send_json(self, event):
            self.sent.append(event)

        async def close(self, **kwargs):
            self.close_calls.append(kwargs)

    websocket = FakeWebSocket()
    asyncio.run(voice_server.websocket_endpoint(websocket))

    assert websocket.sent[-1]["type"] == "session_invalid"
    assert websocket.close_calls == [{
        "code": 1011,
        "reason": "Voice response stream ended",
    }]
    assert fake_manager.closed is True


def test_terminal_transport_timeout_is_not_reported_as_duration_limit(monkeypatch):
    class FakeSessionManager:
        def __init__(self):
            self.is_active = False

        async def start_session(self):
            self.is_active = True

        async def send_event(self, _event_json):
            return None

        async def send_audio_chunk(self, _event_json):
            return None

        async def stop_audio_input(self):
            return None

        async def send_terminal_events(self, _event_jsons):
            raise asyncio.TimeoutError

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

    monkeypatch.setattr(voice_server, "S2sSessionManager", FakeSessionManager)

    class FakeWebSocket:
        def __init__(self):
            self.messages = [
                json.dumps({
                    "type": "session_start",
                    "payload": {"novaSonicContext": "Context", "inferenceConfig": {}},
                }),
                json.dumps({"type": "session_end", "payload": {}}),
            ]
            self.sent = []
            self.close_args = None

        async def accept(self):
            return None

        async def receive_text(self):
            return self.messages.pop(0)

        async def send_json(self, event):
            self.sent.append(event)

        async def close(self, **kwargs):
            self.close_args = kwargs

    websocket = FakeWebSocket()
    asyncio.run(voice_server.websocket_endpoint(websocket))

    assert websocket.sent[-1]["payload"]["reason"].startswith(
        "The voice connection could not continue"
    )
    assert websocket.close_args == {
        "code": 1011,
        "reason": "Voice input transport timed out",
    }
