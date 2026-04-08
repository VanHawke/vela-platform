// src/lib/theme.js — re-export from tokens.js (single source of truth).
// Kept as a shim so existing `import T from '@/lib/theme'` calls work.
export { t, T, C, setTheme, getTheme, initTheme } from './tokens.js';
export { default } from './tokens.js';
