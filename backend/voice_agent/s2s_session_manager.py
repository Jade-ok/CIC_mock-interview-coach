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

import boto3
from aws_sdk_bedrock_runtime.client import (
    AsyncBedrockRuntimeClient,
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
from smithy_aws_core.identity import AWSCredentialsIdentity
from smithy_core.aio.interfaces.identity import IdentityResolver
from smithy_core.exceptions import SmithyIdentityError

logger = logging.getLogger(__name__)

DEFAULT_MODEL_ID = "amazon.nova-2-sonic-v1:0"
DEFAULT_REGION = "us-east-1"
MAX_AUDIO_QUEUE_SIZE = 500
INPUT_SEND_TIMEOUT_SECONDS = 5


class AudioInputStreamError(RuntimeError):
    """Raised when microphone audio can no longer be sent to Nova."""


class Boto3CredentialsResolver(IdentityResolver):
    """Bridge boto3's full credential chain into the Smithy Bedrock client.

    This supports IAM Identity Center profiles locally and container/task-role
    credentials in AgentCore without permanent access keys.
    """

    def __init__(self, session=None):
        self.session = session or boto3.Session()

    async def get_identity(self, *, properties) -> AWSCredentialsIdentity:
        credentials = self.session.get_credentials()
        if credentials is None:
            raise SmithyIdentityError("No AWS credentials are available")

        frozen = credentials.get_frozen_credentials()
        return AWSCredentialsIdentity(
            access_key_id=frozen.access_key,
            secret_access_key=frozen.secret_key,
            session_token=frozen.token,
        )


class S2sSessionManager:
    """Manages a single bidirectional streaming session with Nova Sonic."""

    def __init__(
        self,
        model_id: str | None = None,
        region: str | None = None,
    ):
        self.model_id = model_id or os.environ.get("MODEL_ID", DEFAULT_MODEL_ID)
        self.region = region or os.environ.get("AWS_REGION", DEFAULT_REGION)
        self.client: AsyncBedrockRuntimeClient | None = None
        self.stream = None
        self.is_active = False
        self.accepting_audio = False
        self.audio_queue: asyncio.Queue = asyncio.Queue(maxsize=MAX_AUDIO_QUEUE_SIZE)
        self._audio_send_lock = asyncio.Lock()
        self._input_send_lock = asyncio.Lock()
        self._dropped_audio_chunks = 0
        self.closing_input = False

    def _initialize_client(self):
        """Initialize the Bedrock Runtime client with SigV4 auth."""
        config = Config(
            endpoint_uri=f"https://bedrock-runtime.{self.region}.amazonaws.com",
            region=self.region,
            aws_credentials_identity_resolver=Boto3CredentialsResolver(),
            auth_scheme_resolver=HTTPAuthSchemeResolver(),
            auth_schemes={"aws.auth#sigv4": SigV4AuthScheme(service="bedrock")},
        )
        self.client = AsyncBedrockRuntimeClient(config=config)

    async def start_session(self):
        """Open a bidirectional stream to Nova Sonic."""
        if not self.client:
            self._initialize_client()

        self.stream = await self.client.invoke_model_with_bidirectional_stream(
            InvokeModelWithBidirectionalStreamOperationInput(model_id=self.model_id)
        )
        self.is_active = True
        self.accepting_audio = True
        self.closing_input = False
        logger.info("Nova Sonic session started (model=%s)", self.model_id)

    async def send_event(self, event_json: str):
        """
        Send a JSON event to the Nova Sonic stream.

        Args:
            event_json: A JSON string conforming to the Nova Sonic protocol.
        """
        if not self.is_active or not self.stream or self.closing_input:
            logger.warning("Attempted to send event on inactive session")
            return

        event = InvokeModelWithBidirectionalStreamInputChunk(
            value=BidirectionalInputPayloadPart(bytes_=event_json.encode("utf-8"))
        )
        # The Smithy input stream is shared by browser events, tool results,
        # and queued microphone audio. Serialize writes and bound each send so
        # a stalled transport cannot block shutdown forever.
        async with self._input_send_lock:
            if self.closing_input:
                return
            await asyncio.wait_for(
                self.stream.input_stream.send(event),
                timeout=INPUT_SEND_TIMEOUT_SECONDS,
            )

    async def send_terminal_events(self, event_jsons: list[str]):
        """Atomically close Nova input without allowing another writer between events."""
        if not self.is_active or not self.stream:
            return

        # Set the gate before waiting for the lock so writers already queued on
        # it re-check and stand down. A write already in flight may finish, then
        # the complete terminal sequence owns the stream until sessionEnd.
        self.closing_input = True
        async with self._input_send_lock:
            for event_json in event_jsons:
                event = InvokeModelWithBidirectionalStreamInputChunk(
                    value=BidirectionalInputPayloadPart(
                        bytes_=event_json.encode("utf-8")
                    )
                )
                await asyncio.wait_for(
                    self.stream.input_stream.send(event),
                    timeout=INPUT_SEND_TIMEOUT_SECONDS,
                )

    async def send_audio_chunk(self, event_json: str):
        """
        Queue an audio input event with backpressure handling.

        If the queue is full, the oldest chunk is dropped to prevent blocking.
        """
        if not self.is_active or not self.accepting_audio:
            return

        try:
            self.audio_queue.put_nowait(event_json)
        except asyncio.QueueFull:
            # Drop oldest chunk to handle backpressure
            try:
                self.audio_queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
            self.audio_queue.put_nowait(event_json)
            self._dropped_audio_chunks += 1
            if self._dropped_audio_chunks == 1 or self._dropped_audio_chunks % 100 == 0:
                logger.warning(
                    "Audio queue full — dropped oldest chunk (total=%d)",
                    self._dropped_audio_chunks,
                )

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
            except asyncio.TimeoutError:
                continue

            try:
                async with self._audio_send_lock:
                    if self.accepting_audio:
                        await self.send_event(event_json)
            except Exception as e:
                logger.error("Error draining audio queue: %s", e)
                self.accepting_audio = False
                self.is_active = False
                while True:
                    try:
                        self.audio_queue.get_nowait()
                    except asyncio.QueueEmpty:
                        break
                raise AudioInputStreamError(
                    "Microphone audio could not be sent to Nova"
                ) from e

    async def stop_audio_input(self):
        """Quiesce microphone input before closing Nova's audio content block.

        Setting the gate first prevents new chunks from entering the queue. The
        lock then waits for any chunk already being written to finish before the
        caller sends contentEnd, after which queued chunks are discarded.
        """
        self.accepting_audio = False
        async with self._audio_send_lock:
            while True:
                try:
                    self.audio_queue.get_nowait()
                except asyncio.QueueEmpty:
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
        await self.stop_audio_input()
        self.is_active = False

        if self.stream:
            try:
                await self.stream.input_stream.close()
            except Exception as e:
                logger.warning("Error closing stream: %s", e)

        logger.info("Nova Sonic session closed")
