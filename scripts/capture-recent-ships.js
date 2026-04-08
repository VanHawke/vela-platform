#!/usr/bin/env node
// scripts/capture-recent-ships.js
// Runs at build time. Captures git log into a static JSON file that Vercel can read.
// Replaces runtime execSync('git log') which doesn't work in serverless.
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

try {
  const log = execSync('git log --since="14 days ago" --pretty=format:"%h|%s|%ar" -n 20', {
    encoding: 'utf-8', timeout: 5000
  });
  const commits = log.trim().split('\n').filter(Boolean).map(line => {
    const [hash, subject, when] = line.split('|');
    return { hash, subject: subject?.slice(0, 200), when };
  });
  const out = { generated_at: new Date().toISOString(), commits };
  // Write to multiple locations so Vercel bundles it with serverless functions
  const publicPath = path.join(process.cwd(), 'public', 'recent-ships.json');
  const rootPath = path.join(process.cwd(), 'recent-ships.json');
  const apiPath = path.join(process.cwd(), 'api', 'recent-ships.json');
  fs.mkdirSync(path.dirname(publicPath), { recursive: true });
  fs.writeFileSync(publicPath, JSON.stringify(out, null, 2));
  fs.writeFileSync(rootPath, JSON.stringify(out, null, 2));
  fs.writeFileSync(apiPath, JSON.stringify(out, null, 2));
  console.log(`[capture-ships] Captured ${commits.length} commits → public/, root, api/`);
} catch (e) {
  console.error('[capture-ships] Failed:', e.message);
  // Write empty file so the read doesn't fail
  fs.writeFileSync(path.join(process.cwd(), 'recent-ships.json'), JSON.stringify({ generated_at: new Date().toISOString(), commits: [] }));
}
