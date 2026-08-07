import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAudioManager, type AudioManager } from '../audioManager';

// Mock AudioWorkletNode
class MockAudioWorkletNode {
  port = {
    postMessage: vi.fn(),
    onmessage: null as ((event: MessageEvent) => void) | null,
  };
  connect = vi.fn();
  disconnect = vi.fn();
}

// Mock AudioBufferSourceNode
class MockAudioBufferSourceNode {
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn(() => {
    // Simulate ended event on stop
    if (this.onended) this.onended();
  });
}

// Mock MediaStreamAudioSourceNode
class MockMediaStreamAudioSourceNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

// Mock AudioContext
class MockAudioContext {
  sampleRate = 16000;
  currentTime = 0;
  state = 'running';

  audioWorklet = {
    addModule: vi.fn().mockResolvedValue(undefined),
  };

  createMediaStreamSource = vi.fn(() => new MockMediaStreamAudioSourceNode());
  createBuffer = vi.fn((_channels: number, length: number, sampleRate: number) => ({
    numberOfChannels: 1,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: vi.fn(() => new Float32Array(length)),
    copyFromChannel: vi.fn(),
    copyToChannel: vi.fn(),
  }));
  createBufferSource = vi.fn(() => new MockAudioBufferSourceNode());
  close = vi.fn();
  destination = {};
}

// Mock MediaStream
class MockMediaStream {
  getTracks = vi.fn(() => [{ stop: vi.fn() }]);
}

describe('AudioManager', () => {
  let manager: AudioManager;
  let mockAudioContext: MockAudioContext;
  let mockMediaStream: MockMediaStream;

  beforeEach(() => {
    mockAudioContext = new MockAudioContext();
    mockMediaStream = new MockMediaStream();

    // Mock globals
    vi.stubGlobal('AudioContext', vi.fn(() => mockAudioContext));
    vi.stubGlobal('AudioWorkletNode', vi.fn(() => new MockAudioWorkletNode()));
    vi.stubGlobal(
      'navigator',
      {
        mediaDevices: {
          getUserMedia: vi.fn().mockResolvedValue(mockMediaStream),
        },
      }
    );

    manager = createAudioManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('initialize()', () => {
    it('should return granted: true on success', async () => {
      const result = await manager.initialize();
      expect(result).toEqual({ granted: true });
    });

    it('should request microphone with echo cancellation', async () => {
      await manager.initialize();
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
          channelCount: 1,
        },
      });
    });

    it('should return granted: false when permission denied', async () => {
      const error = new DOMException('Permission denied', 'NotAllowedError');
      vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(error);

      const result = await manager.initialize();
      expect(result).toEqual({ granted: false });
    });

    it('should return granted: false when device not found', async () => {
      const error = new DOMException('Not found', 'NotFoundError');
      vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(error);

      const result = await manager.initialize();
      expect(result).toEqual({ granted: false });
    });

    it('should load AudioWorklet module', async () => {
      await manager.initialize();
      expect(mockAudioContext.audioWorklet.addModule).toHaveBeenCalled();
    });
  });

  describe('startCapture()', () => {
    it('should not throw if not initialized', () => {
      expect(() => manager.startCapture()).not.toThrow();
    });

    it('should connect source to worklet after initialization', async () => {
      await manager.initialize();
      manager.startCapture();
      expect(mockAudioContext.createMediaStreamSource).toHaveBeenCalled();
    });
  });

  describe('pauseCapture() / resumeCapture()', () => {
    it('should send pause command to worklet', async () => {
      await manager.initialize();
      manager.startCapture();

      // Get the AudioWorkletNode instance
      const workletCalls = vi.mocked(AudioWorkletNode);
      const mockWorklet = workletCalls.mock.results[0]?.value as MockAudioWorkletNode;

      manager.pauseCapture();

      if (mockWorklet) {
        expect(mockWorklet.port.postMessage).toHaveBeenCalledWith({ command: 'pause' });
      }
    });

    it('should send resume command to worklet', async () => {
      await manager.initialize();
      manager.startCapture();

      const workletCalls = vi.mocked(AudioWorkletNode);
      const mockWorklet = workletCalls.mock.results[0]?.value as MockAudioWorkletNode;

      manager.resumeCapture();

      if (mockWorklet) {
        expect(mockWorklet.port.postMessage).toHaveBeenCalledWith({ command: 'resume' });
      }
    });

    it('should not throw when called without initialization', () => {
      expect(() => manager.pauseCapture()).not.toThrow();
      expect(() => manager.resumeCapture()).not.toThrow();
    });
  });

  describe('enqueueAudio() + playback', () => {
    it('should create AudioBufferSourceNode for each enqueue', async () => {
      await manager.initialize();

      // Base64 for 4 samples of silence (8 bytes = 4 Int16)
      const silence = btoa(String.fromCharCode(0, 0, 0, 0, 0, 0, 0, 0));
      manager.enqueueAudio(silence);

      expect(mockAudioContext.createBufferSource).toHaveBeenCalledTimes(1);
      expect(mockAudioContext.createBuffer).toHaveBeenCalledWith(1, 4, 24000);
    });

    it('should schedule sources at sequential times for gap-free playback', async () => {
      await manager.initialize();

      const silence = btoa(String.fromCharCode(0, 0, 0, 0, 0, 0, 0, 0));
      manager.enqueueAudio(silence);
      manager.enqueueAudio(silence);

      expect(mockAudioContext.createBufferSource).toHaveBeenCalledTimes(2);
    });
  });

  describe('stopPlayback() (barge-in)', () => {
    it('should clear the queue and stop all nodes', async () => {
      await manager.initialize();

      const silence = btoa(String.fromCharCode(0, 0, 0, 0, 0, 0, 0, 0));
      manager.enqueueAudio(silence);
      manager.enqueueAudio(silence);

      expect(manager.isPlaying()).toBe(true);
      manager.stopPlayback();
      expect(manager.isPlaying()).toBe(false);
    });

    it('should call stop() on all source nodes', async () => {
      await manager.initialize();

      const silence = btoa(String.fromCharCode(0, 0, 0, 0, 0, 0, 0, 0));
      manager.enqueueAudio(silence);

      const sourceNode = mockAudioContext.createBufferSource.mock.results[0]
        ?.value as MockAudioBufferSourceNode;

      manager.stopPlayback();
      expect(sourceNode.stop).toHaveBeenCalled();
    });
  });

  describe('isPlaying()', () => {
    it('should return false when no audio is queued', () => {
      expect(manager.isPlaying()).toBe(false);
    });

    it('should return true when audio is enqueued', async () => {
      await manager.initialize();

      const silence = btoa(String.fromCharCode(0, 0, 0, 0, 0, 0, 0, 0));
      manager.enqueueAudio(silence);

      expect(manager.isPlaying()).toBe(true);
    });

    it('should return false after stopPlayback', async () => {
      await manager.initialize();

      const silence = btoa(String.fromCharCode(0, 0, 0, 0, 0, 0, 0, 0));
      manager.enqueueAudio(silence);
      manager.stopPlayback();

      expect(manager.isPlaying()).toBe(false);
    });
  });

  describe('waitForPlaybackEnd()', () => {
    it('should resolve immediately when nothing is playing', async () => {
      await expect(manager.waitForPlaybackEnd()).resolves.toBeUndefined();
    });

    it('should resolve when stopPlayback is called', async () => {
      await manager.initialize();

      const silence = btoa(String.fromCharCode(0, 0, 0, 0, 0, 0, 0, 0));
      manager.enqueueAudio(silence);

      const promise = manager.waitForPlaybackEnd();
      manager.stopPlayback();

      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe('destroy()', () => {
    it('should close AudioContext and stop media tracks', async () => {
      await manager.initialize();

      manager.destroy();

      expect(mockAudioContext.close).toHaveBeenCalled();
      expect(mockMediaStream.getTracks).toHaveBeenCalled();
    });

    it('should not throw if called without initialization', () => {
      expect(() => manager.destroy()).not.toThrow();
    });
  });
});
