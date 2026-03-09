// AudioWorklet processor for OpenAI Realtime API voice (PCM16)
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.port.onmessage = (event) => {
      if (event.data.type === 'audio') {
        this._audioQueue.push(event.data.audio);
      }
    };
    this._audioQueue = [];
  }

  process(inputs, outputs) {
    const input = inputs[0];
    if (input && input[0]) {
      // Convert Float32 to Int16 PCM and send to main thread
      const float32 = input[0];
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.port.postMessage({ type: 'audio', audio: int16.buffer }, [int16.buffer]);
    }

    // Play queued audio to output
    const output = outputs[0];
    if (output && output[0] && this._audioQueue.length > 0) {
      const chunk = this._audioQueue.shift();
      const int16 = new Int16Array(chunk);
      const float32 = output[0];
      for (let i = 0; i < Math.min(int16.length, float32.length); i++) {
        float32[i] = int16[i] / 0x8000;
      }
    }

    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
