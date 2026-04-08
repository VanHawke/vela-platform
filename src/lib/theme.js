// src/lib/theme.js — shared design tokens reading from CSS variables.
// All components import from here. Single source of truth for the amber-minimal theme.
// Switch theme by toggling .dark on <html> — no component edits needed.

export const T = {
  // Surfaces
  bg: 'var(--bg)',
  surface: 'var(--surface)',
  surfaceHover: 'var(--surface-hover)',
  surfaceElev: 'var(--surface-elev)',

  // Borders
  border: 'var(--border)',
  borderHover: 'var(--border-hover)',
  borderStrong: 'var(--border-strong)',

  // Text
  text: 'var(--text)',
  textSec: 'var(--text-secondary)',
  textTer: 'var(--text-tertiary)',
  textMut: 'var(--text-muted)',

  // Accents
  accent: 'var(--accent)',
  accentSoft: 'var(--accent-soft)',
  accentHover: 'var(--accent-hover)',
  teal: 'var(--accent-teal)',
  pink: 'var(--accent-pink)',
  blue: 'var(--accent-blue)',
  amber: 'var(--accent-amber)',
  green: 'var(--accent-green)',
  red: 'var(--accent-red)',

  // Typography
  font: 'var(--font)',
  fontMono: 'var(--font-mono)',
  fontSerif: 'var(--font-serif)',

  // Geometry
  r: 'var(--radius)',
  rSm: 'var(--radius-sm)',
  rXl: 'var(--radius-xl)',
  rPill: 'var(--radius-pill)',

  // Shadows
  shadowSm: 'var(--shadow-sm)',
  shadowMd: 'var(--shadow-md)',
  shadowLg: 'var(--shadow-lg)',
  shadowKiko: 'var(--shadow-kiko)',
};

// Legacy C alias — components written before theme.js used these short names.
// Maps every old field to the new T tokens so nothing breaks.
export const C = {
  bg: T.bg,
  card: T.surface,
  cardHover: T.surfaceHover,
  border: T.border,
  borderHover: T.borderHover,
  text: T.text,
  textSec: T.textSec,
  textTer: T.textTer,
  textMut: T.textMut,
  purple: T.accent,         // legacy "purple" now maps to amber accent
  teal: T.teal,
  green: T.green,
  red: T.red,
  amber: T.amber,
  blue: T.blue,
  linkedin: '#0077B5',      // brand-locked, not theme
  font: T.font,
  r: 8,
};

// Theme switcher — writes to localStorage and toggles .dark on <html>
export function setTheme(mode) {
  // mode: 'light' | 'dark' | 'system'
  const root = document.documentElement;
  let effective = mode;
  if (mode === 'system') {
    effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  root.classList.toggle('dark', effective === 'dark');
  localStorage.setItem('kiko_theme', mode);
}

export function getTheme() {
  return localStorage.getItem('kiko_theme') || 'light';
}

export function initTheme() {
  setTheme(getTheme());
  // Re-apply on system preference change if user is on system mode
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getTheme() === 'system') setTheme('system');
  });
}

// Default export = T tokens (for files that use `import T from '@/lib/theme'`)
export default T;
