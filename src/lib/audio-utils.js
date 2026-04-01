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
// Dead simple: collect chunks per sentence, combine, play via Web Audio.
// This exact pattern was manually tested and confirmed working.
export class StreamingAudioPlayer {
  constructor() {
    this._chunks = [];
    this._bytes = 0;
    this._ctx = null;
    this._playing = false;
    this._analyser = null;
    this._sources = [];
    this._nextTime = 0;
    this._stopped = false;
    this._onEnd = null;
  }

  addChunk(arrayBuffer) {
    if (this._stopped) return;
    this._chunks.push(new Uint8Array(arrayBuffer));
    this._bytes += arrayBuffer.byteLength;
  }

  flushAndPlay() {
    if (this._stopped || this._chunks.length === 0) return;
    // Combine all chunks into one buffer
    const combined = new Uint8Array(this._bytes);
    let off = 0;
    for (const c of this._chunks) { combined.set(c, off); off += c.length; }
    this._chunks = [];
    this._bytes = 0;
    // Decode PCM16 to Float32
    const int16 = new Int16Array(combined.buffer);
    const f32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 32768;
    // Play
    if (!this._ctx) this._ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    if (this._ctx.state === 'suspended') this._ctx.resume();
    if (!this._analyser) {
      this._analyser = this._ctx.createAnalyser();
      this._analyser.fftSize = 256;
      this._analyser.smoothingTimeConstant = 0.75;
      this._analyser.connect(this._ctx.destination);
    }
    const buf = this._ctx.createBuffer(1, f32.length, 24000);
    buf.copyToChannel(f32, 0);
    const src = this._ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this._analyser);
    const now = this._ctx.currentTime;
    const start = Math.max(now + 0.02, this._nextTime);
    this._nextTime = start + buf.duration;
    this._playing = true;
    this._sources.push(src);
    src.onended = () => {
      this._sources = this._sources.filter(s => s !== src);
      if (this._sources.length === 0) {
        this._playing = false;
        if (this._onEnd) this._onEnd();
      }
    };
    src.start(start);
  }

  stop() {
    this._stopped = true;
    this._chunks = [];
    this._bytes = 0;
    this._nextTime = 0;
    for (const s of this._sources) { try { s.stop(); } catch {} }
    this._sources = [];
    this._playing = false;
  }

  reset() {
    this.stop();
    this._stopped = false;
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
