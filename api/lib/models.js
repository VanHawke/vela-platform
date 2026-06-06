// api/lib/models.js — Centralised model configuration
// Change the model HERE or via env var — every file picks it up automatically.
// Kiko can update this via kiko_self_modify to upgrade herself.

export const BRAIN = process.env.KIKO_BRAIN_MODEL || 'claude-opus-4-8';        // Memory, learning, self-eval, main conversation
export const COGNITIVE = process.env.KIKO_COGNITIVE_MODEL || 'claude-sonnet-4-20250514'; // Classification, deal analysis, email intel
export const UTILITY = process.env.KIKO_UTILITY_MODEL || 'claude-haiku-4-5-20251001';     // Titles, health checks, navigation

// Usage in any file:
// import { BRAIN, COGNITIVE, UTILITY } from './lib/models.js';
// model: BRAIN   — for brain functions (memory, learning, self-evaluation)
// model: COGNITIVE — for reasoning tasks (classification, analysis, intel)
// model: UTILITY  — for cheap utility tasks (titles, pings, nav)
