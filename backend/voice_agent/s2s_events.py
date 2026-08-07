"""
Event factory for the Nova Sonic bidirectional streaming protocol.

Each function returns a JSON string ready to send to the Nova Sonic stream.
"""

import json
import uuid


def generate_id() -> str:
    """Generate a unique ID for prompt/content names."""
    return str(uuid.uuid4())


def session_start_event(
    max_tokens: int = 1024,
    temperature: float = 0.7,
    top_p: float = 0.9,
    endpointing_sensitivity: str = "HIGH",
) -> str:
    """Initialize session with inference config and turn detection."""
    return json.dumps({
        "event": {
            "sessionStart": {
                "inferenceConfiguration": {
                    "maxTokens": max_tokens,
                    "topP": top_p,
                    "temperature": temperature,
                },
                "turnDetectionConfiguration": {
                    "endpointingSensitivity": endpointing_sensitivity,
                },
            }
        }
    })


def prompt_start_event(
    prompt_name: str,
    voice_id: str = "matthew",
    output_sample_rate: int = 24000,
    tools: list[dict] | None = None,
) -> str:
    """Begin a prompt with audio and text output configuration."""
    prompt_start = {
        "promptName": prompt_name,
        "textOutputConfiguration": {
            "mediaType": "text/plain",
        },
        "audioOutputConfiguration": {
            "mediaType": "audio/lpcm",
            "sampleRateHertz": output_sample_rate,
            "sampleSizeBits": 16,
            "channelCount": 1,
            "voiceId": voice_id,
            "encoding": "base64",
            "audioType": "SPEECH",
        },
    }
    if tools:
        prompt_start["toolUseOutputConfiguration"] = {
            "mediaType": "application/json",
        }
        prompt_start["toolConfiguration"] = {
            "tools": tools,
            "toolChoice": {"auto": {}},
        }
    return json.dumps({"event": {"promptStart": prompt_start}})


def content_start_text_event(
    prompt_name: str,
    content_name: str,
    role: str = "SYSTEM",
    interactive: bool = False,
) -> str:
    """Start a text content block (used for system prompt)."""
    return json.dumps({
        "event": {
            "contentStart": {
                "promptName": prompt_name,
                "contentName": content_name,
                "type": "TEXT",
                "interactive": interactive,
                "role": role,
                "textInputConfiguration": {
                    "mediaType": "text/plain",
                },
            }
        }
    })


def text_input_event(
    prompt_name: str,
    content_name: str,
    content: str,
) -> str:
    """Send text content (system prompt text)."""
    return json.dumps({
        "event": {
            "textInput": {
                "promptName": prompt_name,
                "contentName": content_name,
                "content": content,
            }
        }
    })


def content_start_audio_event(
    prompt_name: str,
    content_name: str,
    role: str = "USER",
    sample_rate: int = 16000,
) -> str:
    """Start an audio content block (used for user speech input)."""
    return json.dumps({
        "event": {
            "contentStart": {
                "promptName": prompt_name,
                "contentName": content_name,
                "type": "AUDIO",
                "interactive": True,
                "role": role,
                "audioInputConfiguration": {
                    "mediaType": "audio/lpcm",
                    "sampleRateHertz": sample_rate,
                    "sampleSizeBits": 16,
                    "channelCount": 1,
                    "audioType": "SPEECH",
                    "encoding": "base64",
                },
            }
        }
    })


def audio_input_event(
    prompt_name: str,
    content_name: str,
    base64_audio: str,
) -> str:
    """Send a base64-encoded audio chunk."""
    return json.dumps({
        "event": {
            "audioInput": {
                "promptName": prompt_name,
                "contentName": content_name,
                "content": base64_audio,
            }
        }
    })


def tool_result_event(
    prompt_name: str,
    content_name: str,
    content: str,
) -> str:
    """Return the required result for a Nova tool invocation."""
    return json.dumps({
        "event": {
            "toolResult": {
                "promptName": prompt_name,
                "contentName": content_name,
                "content": content,
            }
        }
    })


def content_end_event(
    prompt_name: str,
    content_name: str,
) -> str:
    """End a content block."""
    return json.dumps({
        "event": {
            "contentEnd": {
                "promptName": prompt_name,
                "contentName": content_name,
            }
        }
    })


def prompt_end_event(prompt_name: str) -> str:
    """End the prompt."""
    return json.dumps({
        "event": {
            "promptEnd": {
                "promptName": prompt_name,
            }
        }
    })


def session_end_event() -> str:
    """Close the session."""
    return json.dumps({
        "event": {
            "sessionEnd": {}
        }
    })
