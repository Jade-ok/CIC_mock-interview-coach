"""
Quick test script for the Voice Agent Server.
Connects via WebSocket, sends a sessionStart + system prompt, and checks for a response.

Usage: python3 scripts/test_voice_agent.py
"""

import asyncio
import json
import uuid
import websockets


async def test_voice_agent():
    uri = "ws://localhost:8080/"
    prompt_name = str(uuid.uuid4())
    content_name = str(uuid.uuid4())

    print("Connecting to voice agent server...")
    try:
        async with websockets.connect(uri) as ws:
            print("✓ Connected")

            # 1. Send sessionStart
            session_start = json.dumps({
                "event": {
                    "sessionStart": {
                        "inferenceConfiguration": {
                            "maxTokens": 1024,
                            "topP": 0.9,
                            "temperature": 0.7,
                        },
                        "turnDetectionConfiguration": {
                            "endpointingSensitivity": "HIGH",
                        },
                    }
                }
            })
            await ws.send(session_start)
            print("✓ Sent sessionStart")

            # 2. Send promptStart
            prompt_start = json.dumps({
                "event": {
                    "promptStart": {
                        "promptName": prompt_name,
                        "textOutputConfiguration": {"mediaType": "text/plain"},
                        "audioOutputConfiguration": {
                            "mediaType": "audio/lpcm",
                            "sampleRateHertz": 24000,
                            "sampleSizeBits": 16,
                            "channelCount": 1,
                            "voiceId": "matthew",
                            "encoding": "base64",
                            "audioType": "SPEECH",
                        },
                    }
                }
            })
            await ws.send(prompt_start)
            print("✓ Sent promptStart")

            # 3. Send system instruction
            content_start = json.dumps({
                "event": {
                    "contentStart": {
                        "promptName": prompt_name,
                        "contentName": content_name,
                        "type": "TEXT",
                        "interactive": True,
                        "role": "SYSTEM",
                        "textInputConfiguration": {"mediaType": "text/plain"},
                    }
                }
            })
            await ws.send(content_start)

            text_input = json.dumps({
                "event": {
                    "textInput": {
                        "promptName": prompt_name,
                        "contentName": content_name,
                        "content": "You are a friendly interviewer. Say hello and ask the candidate to tell you about themselves. Keep it to one sentence.",
                    }
                }
            })
            await ws.send(text_input)

            content_end = json.dumps({
                "event": {
                    "contentEnd": {
                        "promptName": prompt_name,
                        "contentName": content_name,
                    }
                }
            })
            await ws.send(content_end)
            print("✓ Sent system instruction")

            # 3.5. Start audio input (Nova needs this to begin speaking)
            audio_content_name = str(uuid.uuid4())
            audio_start = json.dumps({
                "event": {
                    "contentStart": {
                        "promptName": prompt_name,
                        "contentName": audio_content_name,
                        "type": "AUDIO",
                        "interactive": True,
                        "role": "USER",
                        "audioInputConfiguration": {
                            "mediaType": "audio/lpcm",
                            "sampleRateHertz": 16000,
                            "sampleSizeBits": 16,
                            "channelCount": 1,
                            "audioType": "SPEECH",
                            "encoding": "base64",
                        },
                    }
                }
            })
            await ws.send(audio_start)
            print("✓ Started audio input (triggers Nova to speak)")

            # 4. Wait for responses
            print("\nWaiting for Nova Sonic response (5s timeout)...")
            received_count = 0
            try:
                while True:
                    response = await asyncio.wait_for(ws.recv(), timeout=5.0)
                    data = json.loads(response)
                    event = data.get("event", {})

                    if "textOutput" in event:
                        text = event["textOutput"].get("content", "")
                        print(f"  📝 Text: {text}")
                        received_count += 1
                    elif "audioOutput" in event:
                        audio_len = len(event["audioOutput"].get("content", ""))
                        print(f"  🔊 Audio chunk: {audio_len} base64 chars")
                        received_count += 1
                    elif "contentStart" in event:
                        role = event["contentStart"].get("role", "?")
                        print(f"  → contentStart (role: {role})")
                    elif "contentEnd" in event:
                        print(f"  → contentEnd")
                    else:
                        print(f"  → {list(event.keys())}")

            except asyncio.TimeoutError:
                pass

            if received_count > 0:
                print(f"\n✓ SUCCESS: Received {received_count} response events from Nova Sonic")
            else:
                print("\n✗ No response events received. Check server logs and AWS credentials.")

            # 5. Clean up
            await ws.send(json.dumps({"event": {"promptEnd": {"promptName": prompt_name}}}))
            await ws.send(json.dumps({"event": {"sessionEnd": {}}}))
            print("✓ Session closed")

    except websockets.exceptions.ConnectionClosedError as e:
        print(f"✗ Connection closed: {e}")
    except ConnectionRefusedError:
        print("✗ Connection refused. Is the voice agent server running on localhost:8080?")
    except Exception as e:
        print(f"✗ Error: {e}")


if __name__ == "__main__":
    asyncio.run(test_voice_agent())
