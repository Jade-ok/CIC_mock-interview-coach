"""
FastAPI WebSocket server for the Voice Agent.

Acts as a thin relay between the browser (via AgentCore Runtime) and Nova Sonic.
- Receives Nova Sonic protocol events from the client WebSocket
- Forwards them to Nova Sonic via S2sSessionManager
- Relays Nova Sonic responses back to the client
- Splits large events (>10KB) at base64 boundaries before forwarding
"""

import asyncio
import json
import logging
import math

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from s2s_session_manager import S2sSessionManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Mock Interview Voice Agent")

# Maximum event size before splitting (bytes)
MAX_EVENT_SIZE = 10 * 1024  # 10KB


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

    # Only split audioOutput events
    if "audioOutput" not in event:
        return [event_json]

    audio_output = event["audioOutput"]
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
):
    """
    Background task: read responses from Nova Sonic and forward to the client.

    Splits large events before sending.
    """
    try:
        async for response in session_manager.process_responses():
            response_json = json.dumps(response)
            chunks = split_large_event(response_json)

            for chunk in chunks:
                await websocket.send_text(chunk)
    except WebSocketDisconnect:
        logger.info("Client disconnected during response forwarding")
    except Exception as e:
        logger.error("Error forwarding responses: %s", e)
    finally:
        session_manager.is_active = False


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

    try:
        # Open stream to Nova Sonic
        await session_manager.start_session()

        # Start background tasks
        response_task = asyncio.create_task(
            forward_responses(session_manager, websocket)
        )
        audio_drain_task = asyncio.create_task(
            session_manager.drain_audio_queue()
        )

        # Main loop: receive events from client, forward to Nova Sonic
        while session_manager.is_active:
            try:
                message = await websocket.receive_text()
            except WebSocketDisconnect:
                logger.info("Client disconnected")
                break

            # Determine if this is an audio input event (use queue for backpressure)
            try:
                event_data = json.loads(message)
                is_audio_input = "audioInput" in event_data.get("event", {})
            except (json.JSONDecodeError, AttributeError):
                is_audio_input = False

            if is_audio_input:
                await session_manager.send_event(message)
            else:
                await session_manager.send_event(message)
                logger.info("Sent non-audio event to Nova Sonic")

                # Check if client sent sessionEnd
                try:
                    event_data = json.loads(message)
                    if "sessionEnd" in event_data.get("event", {}):
                        logger.info("Client sent sessionEnd")
                        break
                except (json.JSONDecodeError, AttributeError):
                    pass

    except Exception as e:
        logger.error("WebSocket session error: %s", e)
        try:
            await websocket.close(code=1011, reason=str(e))
        except Exception:
            pass
    finally:
        # Clean up
        await session_manager.close()

        # Cancel background tasks
        for task in [response_task, audio_drain_task]:
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

        logger.info("WebSocket session cleaned up")


@app.get("/health")
async def health_check():
    """Health check endpoint for AgentCore Runtime."""
    return {"status": "healthy"}
