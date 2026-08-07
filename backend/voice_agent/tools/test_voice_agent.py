"""Quick application-protocol smoke test for the local voice relay.

This test opens a real Nova 2 Sonic stream and therefore incurs Bedrock usage.

Usage: python3 backend/voice_agent/tools/test_voice_agent.py
"""

import asyncio
import base64
import json

import websockets


async def test_voice_agent():
    uri = "ws://localhost:8080/"
    print("Connecting to voice agent relay...")

    try:
        async with websockets.connect(uri) as ws:
            print("✓ Connected")
            await ws.send(json.dumps({
                "type": "session_start",
                "payload": {
                    "novaSonicContext": (
                        "You are a friendly interviewer. Greet the candidate and ask "
                        "them to introduce themselves. Keep it to one sentence."
                    ),
                    "inferenceConfig": {
                        "maxTokens": 1024,
                        "topP": 0.9,
                        "temperature": 0.7,
                        "endpointingSensitivity": "HIGH",
                        "voiceId": "matthew",
                    },
                },
            }))

            response = json.loads(await asyncio.wait_for(ws.recv(), timeout=10.0))
            if response.get("type") != "session_start_ack":
                raise RuntimeError(f"Expected session_start_ack, received: {response}")
            print("✓ Session acknowledged")

            # Send 500 ms of 16 kHz, 16-bit mono silence to exercise audio routing.
            silence = bytes(16000)
            await ws.send(json.dumps({
                "type": "audio_chunk",
                "payload": {"content": base64.b64encode(silence).decode("ascii")},
            }))
            print("✓ Sent audio through the application protocol")

            received_count = 0
            try:
                while True:
                    response = json.loads(await asyncio.wait_for(ws.recv(), timeout=5.0))
                    event_type = response.get("type")
                    if event_type == "text_output":
                        print(f"  📝 Text: {response['payload'].get('content', '')}")
                        received_count += 1
                    elif event_type == "audio_output":
                        audio_len = len(response["payload"].get("content", ""))
                        print(f"  🔊 Audio chunk: {audio_len} base64 chars")
                        received_count += 1
                    else:
                        print(f"  → {event_type}")
            except asyncio.TimeoutError:
                pass

            await ws.send(json.dumps({"type": "session_end", "payload": {}}))
            if received_count:
                print(f"✓ Received {received_count} Nova response events")
            else:
                print("⚠ No Nova response arrived before the timeout")

    except websockets.exceptions.ConnectionClosedError as exc:
        print(f"✗ Connection closed: {exc}")
    except ConnectionRefusedError:
        print("✗ Connection refused. Is the relay running on localhost:8080?")
    except Exception as exc:
        print(f"✗ Error: {exc}")


if __name__ == "__main__":
    asyncio.run(test_voice_agent())
