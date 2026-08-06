/**
 * AudioWorkletProcessor for microphone capture.
 * 16kHz, 16-bit PCM, mono. Frame size: 512 samples (1024 bytes).
 * Supports pause/resume via message port.
 */

class CaptureProcessor extends AudioWorkletProcessor {
  private active = true;
  private buffer: Float32Array;
  private bufferIndex = 0;
  private readonly frameSize = 512;

  constructor() {
    super();
    this.buffer = new Float32Array(this.frameSize);

    this.port.onmessage = (event: MessageEvent) => {
      const { command } = event.data as { command: string };
      if (command === 'pause') {
        this.active = false;
      } else if (command === 'resume') {
        this.active = true;
      }
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channelData = input[0];
    if (!channelData) return true;

    for (let i = 0; i < channelData.length; i++) {
      this.buffer[this.bufferIndex++] = channelData[i];

      if (this.bufferIndex >= this.frameSize) {
        if (this.active) {
          // Convert Float32 to Int16 PCM
          const pcmData = new Int16Array(this.frameSize);
          for (let j = 0; j < this.frameSize; j++) {
            const sample = Math.max(-1, Math.min(1, this.buffer[j]));
            pcmData[j] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
          }
          this.port.postMessage(pcmData.buffer, [pcmData.buffer]);
        }
        this.buffer = new Float32Array(this.frameSize);
        this.bufferIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor('capture-processor', CaptureProcessor);
