// kiko-worker/server.js
// Main Express server running on kiko-server (Hetzner VPS)
// Handles LinkedIn automation + heavy background jobs that don't fit Vercel's 300s limit

import express from 'express';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import 'dotenv/config';

import healthRoutes from './routes/health.js';
import linkedinRoutes from './routes/linkedin.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'));

const app = express();
const PORT = process.env.PORT || 3000;
const SHARED_SECRET = process.env.KIKO_WORKER_SECRET || 'dev-secret-change-me';

// Basic middleware
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Request logging (minimal, no secrets)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
  });
  next();
});

// Auth middleware for /linkedin/* routes (skip /health)
app.use((req, res, next) => {
  if (req.path === '/health' || req.path === '/') return next();
  const auth = req.headers['authorization'] || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (token !== SHARED_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

// Root
app.get('/', (req, res) => {
  res.type('text/plain').send(`kiko-worker v${pkg.version} - running\nEndpoints: /health, /linkedin/*\n`);
});

// Routes
app.use('/', healthRoutes);
app.use('/linkedin', linkedinRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ error: err.message || 'internal error' });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[kiko-worker] v${pkg.version} listening on 127.0.0.1:${PORT}`);
  console.log(`[kiko-worker] Nginx proxies public traffic → this port`);
  console.log(`[kiko-worker] Shared secret auth required for /linkedin/*`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[kiko-worker] SIGTERM received, shutting down');
  process.exit(0);
});
