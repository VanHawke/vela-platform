// src/lib/audio-utils.js — Audio utilities for Kiko Voice
// Minimal: AudioContext, AnalyserNode, RMS calculation

let audioCtx = null;

export function getAudioContext() {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

export function calculateRMS(analyser) {
  if (!analyser) return 0;
  const d = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(d);
  let s = 0;
  for (let i = 0; i < d.length; i++) s += d[i] * d[i];
  return Math.sqrt(s / d.length) / 255;
}

export function createAnalyser(source, fftSize = 256) {
  const ctx = getAudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = fftSize;
  analyser.smoothingTimeConstant = 0.75;
  source.connect(analyser);
  return { analyser, cleanup: () => { try { source.disconnect(analyser); } catch {} } };
}
