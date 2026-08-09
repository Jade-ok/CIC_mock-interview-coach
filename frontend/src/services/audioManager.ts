/**
 * AudioManager service — handles microphone capture and audio playback.
 * Input: 16kHz, 16-bit PCM, mono (512 samples per frame)
 * Output: 24kHz, 16-bit PCM, mono (AudioBufferSourceNode chain)
 */

import captureProcessorUrl from '../worklets/captureProcessor.ts?worker&url';

export interface AudioManagerConfig {
  inputSampleRate: 16000;
  outputSampleRate: 24000;
  channelCount: 1;
  sampleSizeBits: 16;
  frameSize: 512;
}

export interface AudioManager {
  initialize(): Promise<{ granted: boolean }>;
  destroy(): void;
  startCapture(): void;
  pauseCapture(): void;
  resumeCapture(): void;
  enqueueAudio(pcmBase64: string): void;
  stopPlayback(): void;
  isPlaying(): boolean;
  waitForPlaybackEnd(): Promise<void>;
  /** Returns cumulative seconds of audio that have actually been played so far. */
  getPlayedDuration(): number;
  /** Returns total cumulative seconds of audio enqueued since last reset. */
  getTotalEnqueuedDuration(): number;
  onAudioChunk: (chunk: ArrayBuffer) => void;
  onPlaybackEnd: () => void;
}

const DEFAULT_CONFIG: AudioManagerConfig = {
  inputSampleRate: 16000,
  outputSampleRate: 24000,
  channelCount: 1,
  sampleSizeBits: 16,
  frameSize: 512,
};

interface ScheduledSource {
  node: AudioBufferSourceNode;
  startTime: number;
  duration: number;
}

export function createAudioManager(config: AudioManagerConfig = DEFAULT_CONFIG): AudioManager {
  let audioContext: AudioContext | null = null;
  let mediaStream: MediaStream | null = null;
  let workletNode: AudioWorkletNode | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;

  // Playback state
  const playbackQueue: ScheduledSource[] = [];
  let nextPlaybackTime = 0;
  let playbackEndResolvers: Array<() => void> = [];
  let destroyed = false;

  // Playback duration tracking for subtitle sync
  let totalEnqueuedDuration = 0;
  let playbackStartedAt = 0; // audioContext.currentTime when first chunk was scheduled

  // Callbacks
  let onAudioChunk: (chunk: ArrayBuffer) => void = () => {};
  let onPlaybackEnd: () => void = () => {};

  function getPlaybackContext(): AudioContext {
    if (!audioContext) {
      throw new Error('AudioManager not initialized');
    }
    return audioContext;
  }

  async function initialize(): Promise<{ granted: boolean }> {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: config.inputSampleRate,
          channelCount: config.channelCount,
        },
      });

      audioContext = new AudioContext({ sampleRate: config.inputSampleRate });

      // Load worklet module
      await audioContext.audioWorklet.addModule(captureProcessorUrl);

      return { granted: true };
    } catch (err: unknown) {
      // Permission denied or not supported
      if (
        err instanceof DOMException &&
        (err.name === 'NotAllowedError' || err.name === 'NotFoundError')
      ) {
        return { granted: false };
      }
      return { granted: false };
    }
  }

  function startCapture(): void {
    if (!audioContext || !mediaStream) return;

    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    workletNode = new AudioWorkletNode(audioContext, 'capture-processor');

    workletNode.port.onmessage = (event: MessageEvent) => {
      const chunk = event.data as ArrayBuffer;
      manager.onAudioChunk(chunk);
    };

    sourceNode.connect(workletNode);
    workletNode.connect(audioContext.destination);
  }

  function pauseCapture(): void {
    if (workletNode) {
      workletNode.port.postMessage({ command: 'pause' });
    }
  }

  function resumeCapture(): void {
    if (workletNode) {
      workletNode.port.postMessage({ command: 'resume' });
    }
  }

  function base64ToInt16Array(base64: string): Int16Array {
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return new Int16Array(bytes.buffer);
  }

  function int16ToFloat32(int16: Int16Array): Float32Array {
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff);
    }
    return float32;
  }

  function enqueueAudio(pcmBase64: string): void {
    const ctx = getPlaybackContext();
    if (destroyed) return;

    const int16Data = base64ToInt16Array(pcmBase64);
    const float32Data = int16ToFloat32(int16Data);

    // Create AudioBuffer at output sample rate (24kHz)
    const audioBuffer = ctx.createBuffer(
      config.channelCount,
      float32Data.length,
      config.outputSampleRate
    );
    audioBuffer.getChannelData(0).set(float32Data);

    // Create source node
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    // Schedule for gap-free playback
    const currentTime = ctx.currentTime;
    const startTime = Math.max(currentTime, nextPlaybackTime);
    const duration = audioBuffer.duration;

    source.start(startTime);
    nextPlaybackTime = startTime + duration;

    // Track cumulative enqueued duration for subtitle sync
    if (totalEnqueuedDuration === 0) {
      playbackStartedAt = startTime;
    }
    totalEnqueuedDuration += duration;

    const scheduled: ScheduledSource = { node: source, startTime, duration };
    playbackQueue.push(scheduled);

    source.onended = () => {
      const idx = playbackQueue.indexOf(scheduled);
      if (idx !== -1) {
        playbackQueue.splice(idx, 1);
      }
      if (playbackQueue.length === 0) {
        totalEnqueuedDuration = 0;
        playbackStartedAt = 0;
        manager.onPlaybackEnd();
        // Resolve any waiters
        const resolvers = [...playbackEndResolvers];
        playbackEndResolvers = [];
        resolvers.forEach((r) => r());
      }
    };
  }

  function stopPlayback(): void {
    // Barge-in: immediately stop all playback and clear queue
    for (const scheduled of playbackQueue) {
      try {
        scheduled.node.stop();
      } catch {
        // Already stopped, ignore
      }
    }
    playbackQueue.length = 0;
    nextPlaybackTime = 0;
    totalEnqueuedDuration = 0;
    playbackStartedAt = 0;

    // Resolve any waiters immediately (playback was stopped)
    const resolvers = [...playbackEndResolvers];
    playbackEndResolvers = [];
    resolvers.forEach((r) => r());
  }

  function isPlayingFn(): boolean {
    return playbackQueue.length > 0;
  }

  function waitForPlaybackEnd(): Promise<void> {
    if (playbackQueue.length === 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      playbackEndResolvers.push(resolve);
    });
  }

  function destroy(): void {
    destroyed = true;
    stopPlayback();

    if (workletNode) {
      workletNode.disconnect();
      workletNode = null;
    }

    if (sourceNode) {
      sourceNode.disconnect();
      sourceNode = null;
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }

    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
  }

  function getPlayedDuration(): number {
    if (!audioContext || totalEnqueuedDuration === 0) return 0;
    const elapsed = audioContext.currentTime - playbackStartedAt;
    return Math.max(0, Math.min(elapsed, totalEnqueuedDuration));
  }

  function getTotalEnqueuedDuration(): number {
    return totalEnqueuedDuration;
  }

  const manager: AudioManager = {
    initialize,
    destroy,
    startCapture,
    pauseCapture,
    resumeCapture,
    enqueueAudio,
    stopPlayback,
    isPlaying: isPlayingFn,
    waitForPlaybackEnd,
    getPlayedDuration,
    getTotalEnqueuedDuration,
    onAudioChunk,
    onPlaybackEnd,
  };

  return manager;
}
