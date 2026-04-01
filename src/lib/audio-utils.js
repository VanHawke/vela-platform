// src/lib/audio-utils.js — Audio utilities for Kiko Voice (streaming architecture)
// AudioContext management, PCM decoding, streaming playback queue

let audioCtx = null;

export function getAudioContext() {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// Decode raw PCM16 little-endian → AudioBuffer
export function decodePCM16(arrayBuffer, sampleRate = 24000) {
  const ctx = getAudioContext();
  const int16 = new Int16Array(arrayBuffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;
  const buf = ctx.createBuffer(1, float32.length, sampleRate);
  buf.copyToChannel(float32, 0);
  return buf;
}

// RMS energy from AnalyserNode → 0.0 to 1.0
export function calculateRMS(analyser) {
  if (!analyser) return 0;
  const d = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(d);
  let s = 0;
  for (let i = 0; i < d.length; i++) s += d[i] * d[i];
  return Math.sqrt(s / d.length) / 255;
}

// Create AnalyserNode from any AudioNode source
export function createAnalyser(source, fftSize = 256) {
  const ctx = getAudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = fftSize;
  analyser.smoothingTimeConstant = 0.75;
  source.connect(analyser);
  return { analyser, cleanup: () => { try { source.disconnect(analyser); } catch {} } };
}

// ── StreamingAudioPlayer ──
// Queues PCM chunks from TTS WebSocket and plays them back-to-back
// Allows interruption at any point
export class StreamingAudioPlayer {
  constructor() {
    this._queue = [];        // AudioBuffer queue
    this._playing = false;
    this._source = null;     // Current AudioBufferSourceNode
    this._analyser = null;
    this._stopped = false;
    this._onEnd = null;      // Called when queue drains
  }

  // Add a PCM chunk to the playback queue
  enqueue(arrayBuffer) {
    if (this._stopped || arrayBuffer.byteLength < 100) return;
    const buf = decodePCM16(arrayBuffer, 24000);
    this._queue.push(buf);
    if (!this._playing) this._playNext();
  }

  _playNext() {
    if (this._stopped || this._queue.length === 0) {
      this._playing = false;
      if (this._onEnd) this._onEnd();
      return;
    }
    this._playing = true;
    const ctx = getAudioContext();
    const buf = this._queue.shift();
    const source = ctx.createBufferSource();
    source.buffer = buf;

    // Analyser for waveform energy
    if (!this._analyser) {
      this._analyser = ctx.createAnalyser();
      this._analyser.fftSize = 256;
      this._analyser.smoothingTimeConstant = 0.75;
      this._analyser.connect(ctx.destination);
    }
    source.connect(this._analyser);
    this._source = source;
    source.onended = () => {
      this._source = null;
      this._playNext();
    };
    source.start(0);
  }

  stop() {
    this._stopped = true;
    this._queue = [];
    if (this._source) { try { this._source.stop(); } catch {} }
    this._source = null;
    this._playing = false;
  }

  reset() {
    this.stop();
    this._stopped = false;
    this._analyser = null;
  }

  isPlaying() { return this._playing; }
  getAnalyser() { return this._analyser; }
  set onEnd(fn) { this._onEnd = fn; }
}

// ── Sentence Chunker ──
// Accumulates LLM tokens and emits complete sentences for TTS
// Triggers on sentence boundaries (. ! ? or double newline)
export class SentenceChunker {
  constructor(onSentence) {
    this._buffer = '';
    this._onSentence = onSentence;
  }

  add(token) {
    this._buffer += token;
    // Check for sentence boundaries
    const match = this._buffer.match(/^(.*?[.!?]\s)/s);
    if (match) {
      const sentence = match[1].trim();
      this._buffer = this._buffer.slice(match[0].length);
      if (sentence.length > 2) this._onSentence(sentence);
    }
    // Also flush on double newline (paragraph breaks)
    const nlMatch = this._buffer.match(/^(.*?\n\n)/s);
    if (nlMatch) {
      const chunk = nlMatch[1].trim();
      this._buffer = this._buffer.slice(nlMatch[0].length);
      if (chunk.length > 2) this._onSentence(chunk);
    }
  }

  // Flush remaining text (call at end of LLM stream)
  flush() {
    const remaining = this._buffer.trim();
    this._buffer = '';
    if (remaining.length > 2) this._onSentence(remaining);
  }

  clear() { this._buffer = ''; }
}
