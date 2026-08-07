"""
Manages the bidirectional stream to Amazon Nova Sonic via the Bedrock Runtime SDK.

Handles:
- Opening the stream to Nova Sonic
- Sending events (from the client WebSocket)
- Processing responses (from Nova Sonic) and yielding them back
- Backpressure via an asyncio queue for audio input
- Graceful session close
"""

import asyncio
import json
import logging
import os

from aws_sdk_bedrock_runtime.client import (
    BedrockRuntimeClient,
    InvokeModelWithBidirectionalStreamOperationInput,
)
from aws_sdk_bedrock_runtime.models import (
    BidirectionalInputPayloadPart,
    InvokeModelWithBidirectionalStreamInputChunk,
)
from aws_sdk_bedrock_runtime.config import (
    Config,
    HTTPAuthSchemeResolver,
    SigV4AuthScheme,
)
from smithy_aws_core.identity import EnvironmentCredentialsResolver

logger = logging.getLogger(__name__)

DEFAULT_MODEL_ID = "amazon.nova-2-sonic-v1:0"
DEFAULT_REGION = "us-east-1"
MAX_AUDIO_QUEUE_SIZE = 100


class S2sSessionManager:
    """Manages a single bidirectional streaming session with Nova Sonic."""

    def __init__(
        self,
        model_id: str | None = None,
        region: str | None = None,
    ):
        self.model_id = model_id or os.environ.get("MODEL_ID", DEFAULT_MODEL_ID)
        self.region = region or os.environ.get("AWS_REGION", DEFAULT_REGION)
        self.client: BedrockRuntimeClient | None = None
        self.stream = None
        self.is_active = False
        self.audio_queue: asyncio.Queue = asyncio.Queue(maxsize=MAX_AUDIO_QUEUE_SIZE)

    def _initialize_client(self):
        """Initialize the Bedrock Runtime client with SigV4 auth."""
        config = Config(
            endpoint_uri=f"https://bedrock-runtime.{self.region}.amazonaws.com",
            region=self.region,
            aws_credentials_identity_resolver=EnvironmentCredentialsResolver(),
            auth_scheme_resolver=HTTPAuthSchemeResolver(),
            auth_schemes={"aws.auth#sigv4": SigV4AuthScheme(service="bedrock")},
        )
        self.client = BedrockRuntimeClient(config=config)

    async def start_session(self):
        """Open a bidirectional stream to Nova Sonic."""
        if not self.client:
            self._initialize_client()

        self.stream = await self.client.invoke_model_with_bidirectional_stream(
            InvokeModelWithBidirectionalStreamOperationInput(model_id=self.model_id)
        )
        self.is_active = True
        logger.info("Nova Sonic session started (model=%s)", self.model_id)

    async def send_event(self, event_json: str):
        """
        Send a JSON event to the Nova Sonic stream.

        Args:
            event_json: A JSON string conforming to the Nova Sonic protocol.
        """
        if not self.is_active or not self.stream:
            logger.warning("Attempted to send event on inactive session")
            return

        event = InvokeModelWithBidirectionalStreamInputChunk(
            value=BidirectionalInputPayloadPart(bytes_=event_json.encode("utf-8"))
        )
        await self.stream.input_stream.send(event)

    async def send_audio_chunk(self, event_json: str):
        """
        Queue an audio input event with backpressure handling.

        If the queue is full, the oldest chunk is dropped to prevent blocking.
        """
        try:
            self.audio_queue.put_nowait(event_json)
        except asyncio.QueueFull:
            # Drop oldest chunk to handle backpressure
            try:
                self.audio_queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
            self.audio_queue.put_nowait(event_json)
            logger.warning("Audio queue full — dropped oldest chunk")

    async def drain_audio_queue(self):
        """
        Background task that drains the audio queue and sends chunks to Nova Sonic.

        Run this as an asyncio task alongside process_responses.
        """
        while self.is_active:
            try:
                event_json = await asyncio.wait_for(
                    self.audio_queue.get(), timeout=0.1
                )
                await self.send_event(event_json)
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error("Error draining audio queue: %s", e)
                break

    async def process_responses(self):
        """
        Async generator that yields response events from Nova Sonic.

        Yields:
            dict: Parsed JSON response event from Nova Sonic.
        """
        if not self.stream:
            return

        try:
            while self.is_active:
                output = await self.stream.await_output()
                result = await output[1].receive()

                if result.value and result.value.bytes_:
                    response_data = result.value.bytes_.decode("utf-8")
                    try:
                        json_data = json.loads(response_data)
                        yield json_data
                    except json.JSONDecodeError:
                        logger.warning("Non-JSON response from Nova Sonic: %s", response_data[:100])
        except StopAsyncIteration:
            logger.info("Nova Sonic stream ended")
        except Exception as e:
            logger.error("Error processing Nova Sonic responses: %s", e)
        finally:
            self.is_active = False

    async def close(self):
        """Close the Nova Sonic stream gracefully."""
        self.is_active = False

        if self.stream:
            try:
                await self.stream.input_stream.close()
            except Exception as e:
                logger.warning("Error closing stream: %s", e)

        logger.info("Nova Sonic session closed")
