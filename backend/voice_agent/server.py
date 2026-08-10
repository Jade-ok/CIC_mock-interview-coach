"""
FastAPI WebSocket server for the Voice Agent.

Acts as an adapter between the browser (via AgentCore Runtime) and Nova Sonic.
- Receives the application WebSocket protocol from the browser
- Translates browser messages to Nova Sonic protocol events
- Translates Nova Sonic responses back to application events
- Splits large events (>10KB) at base64 boundaries before forwarding
"""

import asyncio
from contextlib import suppress
import json
import logging
import math
import os

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

try:
    from .protocol import BrowserProtocolError, BrowserSessionProtocol
    from .s2s_session_manager import AudioInputStreamError, S2sSessionManager
except ImportError:  # Direct execution from backend/voice_agent.
    from protocol import BrowserProtocolError, BrowserSessionProtocol
    from s2s_session_manager import AudioInputStreamError, S2sSessionManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Mock Interview Voice Agent")

# Maximum event size before splitting (bytes)
MAX_EVENT_SIZE = 10 * 1024  # 10KB


class SessionDurationExceeded(TimeoutError):
    """Raised only when the hosted interview duration deadline expires."""


def _max_session_duration_seconds() -> int | None:
    if os.getenv("HOSTED_GUARDRAILS_ENABLED", "").lower() == "true":
        return 8 * 60
    return None


def split_large_event(event_json: str) -> list[str]:
    """
    Split a large event into smaller chunks for WebSocket transmission.

    Large audioOutput events (>10KB) are split by dividing the content field
    into chunks aligned to 4-character base64 boundaries to avoid decoding
    corruption.

    Args:
        event_json: The JSON string of the event.

    Returns:
        A list of JSON strings. If the event is small enough, returns [event_json].
    """
    if len(event_json) <= MAX_EVENT_SIZE:
        return [event_json]

    try:
        data = json.loads(event_json)
    except json.JSONDecodeError:
        return [event_json]

    event = data.get("event", {})

    # Support both raw Nova events and translated browser audio events.
    if "audioOutput" in event:
        audio_output = event["audioOutput"]
        browser_event = False
    elif data.get("type") == "audio_output" and isinstance(data.get("payload"), dict):
        audio_output = data["payload"]
        browser_event = True
    else:
        return [event_json]
    content = audio_output.get("content", "")

    if not content:
        return [event_json]

    # Calculate chunk size aligned to 4 chars (base64 boundary)
    # Target ~8KB of content per chunk
    target_content_size = 8000
    chunk_size = (target_content_size // 4) * 4  # Align to 4-char boundary

    if len(content) <= chunk_size:
        return [event_json]

    # Split content into chunks
    chunks = []
    num_chunks = math.ceil(len(content) / chunk_size)

    for i in range(num_chunks):
        start = i * chunk_size
        end = min(start + chunk_size, len(content))
        chunk_content = content[start:end]

        # Rebuild the event with the chunked content
        if browser_event:
            chunk_event = {
                "type": "audio_output",
                "payload": {**audio_output, "content": chunk_content},
            }
        else:
            chunk_event = {
                "event": {
                    "audioOutput": {
                        **audio_output,
                        "content": chunk_content,
                    }
                }
            }
        chunks.append(json.dumps(chunk_event))

    logger.debug("Split large event (%d bytes) into %d chunks", len(event_json), len(chunks))
    return chunks


async def forward_responses(
    session_manager: S2sSessionManager,
    websocket: WebSocket,
    protocol: BrowserSessionProtocol,
):
    """
    Background task: read responses from Nova Sonic and forward to the client.

    Splits large events before sending.
    """
    try:
        async for response in session_manager.process_responses():
            tool_result = protocol.build_tool_result(response)
            if tool_result is not None:
                await session_manager.send_event(tool_result)

            browser_event = protocol.translate_nova_event(response)
            browser_events = [] if browser_event is None else [browser_event]
            if "completionEnd" in response.get("event", {}):
                pending_end = protocol.take_pending_end_tool()
                if pending_end is not None:
                    browser_events.append(pending_end)

            for item in browser_events:
                response_json = json.dumps(item)
                for chunk in split_large_event(response_json):
                    await websocket.send_text(chunk)

        # A response stream should remain open until the browser ends the
        # session. If Nova closes it first (including a model safety rejection),
        # stop accepting microphone audio and give the browser a recoverable
        # error instead of leaving the interview silently connected.
        if not protocol.closed and not protocol.end_interview_completed:
            await websocket.send_json(
                {
                    "type": "session_invalid",
                    "payload": {
                        "reason": (
                            "The voice interview ended unexpectedly. Please go back "
                            "and try again."
                        )
                    },
                }
            )
            await websocket.close(code=1011, reason="Voice response stream ended")
    except WebSocketDisconnect:
        logger.info("Client disconnected during response forwarding")
    except Exception as e:
        logger.error("Error forwarding responses: %s", e)
        if not protocol.end_interview_completed:
            try:
                await websocket.send_json(
                    {
                        "type": "session_invalid",
                        "payload": {
                            "reason": (
                                "The voice interview ended unexpectedly. Please go back "
                                "and try again."
                            )
                        },
                    }
                )
                await websocket.close(code=1011, reason="Voice response failure")
            except Exception:
                pass
    finally:
        session_manager.is_active = False


@app.websocket("/ws")
@app.websocket("/")
async def websocket_endpoint(websocket: WebSocket):
    """
    Main WebSocket endpoint.

    Lifecycle:
    1. Client connects
    2. Open bidirectional stream to Nova Sonic
    3. Start background tasks: response forwarding + audio queue draining
    4. Relay client events to Nova Sonic
    5. On disconnect: close Nova Sonic stream and clean up
    """
    await websocket.accept()
    logger.info("Client WebSocket connected")

    session_manager = S2sSessionManager()
    protocol = BrowserSessionProtocol()
    response_task = None
    audio_drain_task = None
    max_duration = _max_session_duration_seconds()
    session_deadline = (
        asyncio.get_running_loop().time() + max_duration
        if max_duration is not None
        else None
    )

    try:
        # Wait for session_start before opening the paid Nova stream.
        while True:
            try:
                if audio_drain_task is None:
                    if session_deadline is None:
                        message = await websocket.receive_text()
                    else:
                        remaining_seconds = (
                            session_deadline - asyncio.get_running_loop().time()
                        )
                        if remaining_seconds <= 0:
                            raise SessionDurationExceeded
                        try:
                            message = await asyncio.wait_for(
                                websocket.receive_text(), timeout=remaining_seconds
                            )
                        except asyncio.TimeoutError as exc:
                            raise SessionDurationExceeded from exc
                else:
                    receive_task = asyncio.create_task(websocket.receive_text())
                    timeout = None
                    if session_deadline is not None:
                        timeout = session_deadline - asyncio.get_running_loop().time()
                        if timeout <= 0:
                            receive_task.cancel()
                            with suppress(asyncio.CancelledError):
                                await receive_task
                            raise SessionDurationExceeded
                    done, _ = await asyncio.wait(
                        {receive_task, audio_drain_task},
                        timeout=timeout,
                        return_when=asyncio.FIRST_COMPLETED,
                    )
                    if not done:
                        receive_task.cancel()
                        with suppress(asyncio.CancelledError):
                            await receive_task
                        raise SessionDurationExceeded
                    if audio_drain_task in done:
                        receive_task.cancel()
                        with suppress(asyncio.CancelledError):
                            await receive_task
                        failure = audio_drain_task.exception()
                        if failure is not None:
                            raise failure
                        raise AudioInputStreamError(
                            "Microphone audio forwarding stopped unexpectedly"
                        )
                    message = receive_task.result()
            except WebSocketDisconnect:
                logger.info("Client disconnected")
                break

            try:
                was_started = protocol.started
                result = protocol.handle_client_message(message)
            except BrowserProtocolError as exc:
                await websocket.send_json(
                    {"type": "session_invalid", "payload": {"reason": str(exc)}}
                )
                continue

            # Nova requires sessionStart to be the first input event. Send the
            # complete initialization sequence before starting response/audio
            # background tasks, matching AWS's documented event lifecycle.
            if result.should_close:
                # Quiesce microphone writes, then hold the common Nova input
                # lock across contentEnd -> promptEnd -> sessionEnd. This keeps
                # a concurrent toolResult from interleaving with shutdown.
                await session_manager.stop_audio_input()
                await session_manager.send_terminal_events(result.nova_events)
            elif protocol.started and not was_started:
                await session_manager.start_session()
                for event_json in result.nova_events:
                    await session_manager.send_event(event_json)
                response_task = asyncio.create_task(
                    forward_responses(session_manager, websocket, protocol)
                )
                audio_drain_task = asyncio.create_task(
                    session_manager.drain_audio_queue()
                )
            else:
                for event_json in result.nova_events:
                    await session_manager.send_event(event_json)
            for event_json in result.audio_events:
                await session_manager.send_audio_chunk(event_json)
            for browser_event in result.browser_events:
                await websocket.send_json(browser_event)

            if result.should_close:
                logger.info("Client ended browser session")
                break

    except SessionDurationExceeded:
        logger.info("Voice session reached the maximum duration")
        try:
            await websocket.send_json(
                {
                    "type": "session_invalid",
                    "payload": {"reason": "Voice session reached the 8-minute limit"},
                }
            )
            await websocket.close(code=1000, reason="Session duration limit reached")
        except Exception:
            pass
    except asyncio.TimeoutError:
        logger.error("Nova input transport timed out")
        try:
            await websocket.send_json(
                {
                    "type": "session_invalid",
                    "payload": {
                        "reason": (
                            "The voice connection could not continue. Please go back "
                            "and try again."
                        )
                    },
                }
            )
            await websocket.close(code=1011, reason="Voice input transport timed out")
        except Exception:
            pass
    except AudioInputStreamError as e:
        logger.error("Voice audio input failed: %s", e)
        if response_task is not None and not response_task.done():
            response_task.cancel()
            with suppress(asyncio.CancelledError):
                await response_task
            response_task = None
        try:
            await websocket.send_json(
                {
                    "type": "session_invalid",
                    "payload": {
                        "reason": (
                            "The voice connection could not continue. Please go back "
                            "and try again."
                        )
                    },
                }
            )
            await websocket.close(code=1011, reason="Voice audio input failed")
        except Exception:
            pass
    except Exception as e:
        logger.error("WebSocket session error: %s", e)
        try:
            await websocket.close(code=1011, reason=str(e))
        except Exception:
            pass
    finally:
        # Stop readers before closing the underlying stream so the AWS CRT does
        # not try to resolve a response future that was cancelled mid-close.
        for task in [response_task, audio_drain_task]:
            if task is None:
                continue
            if task.done():
                if not task.cancelled():
                    with suppress(Exception):
                        task.exception()
                continue
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

        await session_manager.close()
        logger.info("WebSocket session cleaned up")


@app.get("/ping")
@app.get("/health")
async def health_check():
    """Health check endpoint for AgentCore Runtime and local development."""
    return {"status": "healthy"}
