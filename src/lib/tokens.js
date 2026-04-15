// src/lib/tokens.js — THE single source of truth for all colors and design.
// Every component imports from here. Zero hardcoded colors anywhere in the codebase.
// To change theme: edit src/index.css :root variables. This file never changes.

export const t = {
  // Surfaces
  bg: 'var(--background)',
  card: 'var(--card)',
  popover: 'var(--popover)',
  sidebar: 'var(--sidebar)',
  muted: 'var(--muted)',
  accent: 'var(--accent)',
  secondary: 'var(--secondary)',

  // Text (foreground)
  fg: 'var(--foreground)',
  cardFg: 'var(--card-foreground)',
  popoverFg: 'var(--popover-foreground)',
  mutedFg: 'var(--muted-foreground)',
  accentFg: 'var(--accent-foreground)',
  sidebarFg: 'var(--sidebar-foreground)',
  secondaryFg: 'var(--secondary-foreground)',

  // Brand / actions
  primary: 'var(--primary)',
  primaryFg: 'var(--primary-foreground)',
  ring: 'var(--ring)',
  destructive: 'var(--destructive)',
  destructiveFg: 'var(--destructive-foreground)',

  // Borders & inputs
  border: 'var(--border)',
  input: 'var(--input)',

  // Sidebar specific
  sidebarPrimary: 'var(--sidebar-primary)',
  sidebarPrimaryFg: 'var(--sidebar-primary-foreground)',
  sidebarAccent: 'var(--sidebar-accent)',
  sidebarAccentFg: 'var(--sidebar-accent-foreground)',
  sidebarBorder: 'var(--sidebar-border)',
  sidebarRing: 'var(--sidebar-ring)',

  // Charts
  chart1: 'var(--chart-1)',
  chart2: 'var(--chart-2)',
  chart3: 'var(--chart-3)',
  chart4: 'var(--chart-4)',
  chart5: 'var(--chart-5)',

  // Typography
  fontSans: 'var(--font-sans)',
  fontMono: 'var(--font-mono)',
  fontSerif: 'var(--font-serif)',

  // Geometry
  radius: 'var(--radius)',
  radiusSm: 'calc(var(--radius) - 2px)',
  radiusLg: 'calc(var(--radius) + 4px)',
  radiusXl: 'calc(var(--radius) + 8px)',

  // Shadow (composed from CSS vars)
  shadow: '0 4px 8px -1px hsl(0 0% 0% / 0.1)',
  shadowSm: '0 1px 2px hsl(0 0% 0% / 0.06)',
  shadowMd: '0 4px 12px hsl(0 0% 0% / 0.08)',
  shadowLg: '0 12px 32px hsl(0 0% 0% / 0.12)',
};

// Theme switcher
const STORAGE_KEY = 'kiko_theme_v3'; // bumped to invalidate stale 'light' values

export function setTheme(mode) {
  // mode: 'light' | 'dark' | 'system'
  const root = document.documentElement;
  let effective = mode;
  if (mode === 'system') {
    effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  root.classList.toggle('dark', effective === 'dark');
  localStorage.setItem(STORAGE_KEY, mode);
}

export function getTheme() {
  return localStorage.getItem(STORAGE_KEY) || 'light';
}

export function initTheme() {
  setTheme(getTheme());
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getTheme() === 'system') setTheme('system');
  });
}

// Default + named exports for backwards compat with any old `import T from`/`import { T } from`
export default t;
export const T = t;
export const C = t;
