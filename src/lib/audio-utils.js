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
// Accumulates PCM chunks per TTS sentence, plays gaplessly
// Each Deepgram "Flushed" message triggers a combined play
export class StreamingAudioPlayer {
  constructor() {
    this._pendingChunks = [];  // Chunks for current sentence
    this._pendingBytes = 0;
    this._ctx = null;          // Own AudioContext (not shared)
    this._analyser = null;
    this._nextTime = 0;        // Schedule gapless
    this._activeSources = 0;   // Track active source nodes
    this._stopped = false;
    this._onEnd = null;
  }

  _getCtx() {
    if (!this._ctx || this._ctx.state === 'closed') {
      this._ctx = new AudioContext({ sampleRate: 24000 });
    }
    if (this._ctx.state === 'suspended') this._ctx.resume();
    return this._ctx;
  }

  // Call for each binary audio chunk from Deepgram TTS
  addChunk(arrayBuffer) {
    if (this._stopped) return;
    this._pendingChunks.push(new Uint8Array(arrayBuffer));
    this._pendingBytes += arrayBuffer.byteLength;
  }

  // Call when Deepgram sends "Flushed" — plays the accumulated sentence
  flushAndPlay() {
    if (this._stopped || this._pendingChunks.length === 0) return;
    const total = this._pendingBytes;
    const combined = new Uint8Array(total);
    let offset = 0;
    for (const c of this._pendingChunks) { combined.set(c, offset); offset += c.length; }
    this._pendingChunks = [];
    this._pendingBytes = 0;

    // Decode PCM16 → Float32
    const int16 = new Int16Array(combined.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;

    const ctx = this._getCtx();
    const buf = ctx.createBuffer(1, float32.length, 24000);
    buf.copyToChannel(float32, 0);

    if (!this._analyser) {
      this._analyser = ctx.createAnalyser();
      this._analyser.fftSize = 256;
      this._analyser.smoothingTimeConstant = 0.75;
      this._analyser.connect(ctx.destination);
    }

    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.connect(this._analyser);
    const now = ctx.currentTime;
    const startAt = Math.max(now + 0.01, this._nextTime);
    this._nextTime = startAt + buf.duration;
    this._activeSources++;
    source.onended = () => {
      this._activeSources--;
      if (this._activeSources <= 0 && this._pendingChunks.length === 0) {
        this._activeSources = 0;
        if (this._onEnd) this._onEnd();
      }
    };
    source.start(startAt);
    console.log(`[Voice] Playing ${(buf.duration).toFixed(1)}s audio, scheduled at +${(startAt - now).toFixed(2)}s`);
  }

  stop() {
    this._stopped = true;
    this._pendingChunks = [];
    this._pendingBytes = 0;
    this._nextTime = 0;
    this._activeSources = 0;
    if (this._ctx) { try { this._ctx.close(); } catch {} this._ctx = null; }
    this._analyser = null;
  }

  reset() {
    this.stop();
    this._stopped = false;
  }

  isPlaying() { return this._activeSources > 0; }
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
