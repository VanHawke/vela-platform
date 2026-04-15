// routes/health.js
// Health and status endpoints. These are unauthenticated.
// Kiko (Vercel) calls /health from cron-kiko-health to verify worker is alive.

import { Router } from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import os from 'os';

const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
const startedAt = new Date();

router.get('/health', (req, res) => {
  const uptimeMs = Date.now() - startedAt.getTime();
  const memMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const loadAvg = os.loadavg().map(n => n.toFixed(2));
  res.json({
    status: 'ok',
    service: 'kiko-worker',
    version: pkg.version,
    phase: 'phase-1-linkedin-engine',
    node: process.version,
    started_at: startedAt.toISOString(),
    now: new Date().toISOString(),
    uptime_ms: uptimeMs,
    uptime_human: `${Math.floor(uptimeMs / 1000 / 60)}m ${Math.floor((uptimeMs / 1000) % 60)}s`,
    memory_mb: memMb,
    load_avg_1_5_15: loadAvg,
    host: os.hostname()
  });
});

export default router;
