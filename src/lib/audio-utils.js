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
// Accumulates PCM chunks and schedules gapless playback
// Uses AudioContext.currentTime for seamless audio without cracks/gaps
export class StreamingAudioPlayer {
  constructor() {
    this._rawChunks = [];     // Accumulated raw ArrayBuffers
    this._rawBytes = 0;       // Total bytes accumulated
    this._nextStartTime = 0;  // When to schedule next buffer
    this._sources = [];       // Active AudioBufferSourceNodes
    this._analyser = null;
    this._stopped = false;
    this._playing = false;
    this._onEnd = null;
    this._flushTimer = null;  // Timer to flush remaining chunks
    this._endTimer = null;    // Timer to detect playback end
  }

  enqueue(arrayBuffer) {
    if (this._stopped || arrayBuffer.byteLength < 100) return;
    this._rawChunks.push(new Uint8Array(arrayBuffer));
    this._rawBytes += arrayBuffer.byteLength;
    // Flush every ~200ms of audio (9600 bytes at 24kHz 16-bit mono)
    if (this._rawBytes >= 9600) this._flush();
    // Also set a timer to flush smaller remaining chunks
    clearTimeout(this._flushTimer);
    this._flushTimer = setTimeout(() => this._flush(), 80);
  }

  _flush() {
    if (this._stopped || this._rawChunks.length === 0) return;
    // Combine all accumulated chunks
    const total = this._rawBytes;
    const combined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of this._rawChunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    this._rawChunks = [];
    this._rawBytes = 0;
    // Decode PCM16 to Float32
    const int16 = new Int16Array(combined.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;
    // Create AudioBuffer
    const ctx = getAudioContext();
    const audioBuf = ctx.createBuffer(1, float32.length, 24000);
    audioBuf.copyToChannel(float32, 0);
    // Ensure analyser exists
    if (!this._analyser) {
      this._analyser = ctx.createAnalyser();
      this._analyser.fftSize = 256;
      this._analyser.smoothingTimeConstant = 0.75;
      this._analyser.connect(ctx.destination);
    }
    // Schedule gapless playback
    const source = ctx.createBufferSource();
    source.buffer = audioBuf;
    source.connect(this._analyser);
    const now = ctx.currentTime;
    const startAt = Math.max(now, this._nextStartTime);
    this._nextStartTime = startAt + audioBuf.duration;
    source.start(startAt);
    this._sources.push(source);
    this._playing = true;
    // Cleanup finished sources
    source.onended = () => {
      this._sources = this._sources.filter(s => s !== source);
      // Check if all playback is done
      clearTimeout(this._endTimer);
      this._endTimer = setTimeout(() => {
        if (this._sources.length === 0 && this._rawChunks.length === 0) {
          this._playing = false;
          if (this._onEnd) this._onEnd();
        }
      }, 100);
    };
  }

  stop() {
    this._stopped = true;
    this._rawChunks = [];
    this._rawBytes = 0;
    clearTimeout(this._flushTimer);
    clearTimeout(this._endTimer);
    for (const s of this._sources) { try { s.stop(); } catch {} }
    this._sources = [];
    this._playing = false;
    this._nextStartTime = 0;
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
