// lib/cookieStore.js
// SQLite-backed encrypted cookie store for LinkedIn sessions.
// Each "identity" (label like 'matt', 'sunny') holds a cookie set used
// by the Playwright browser context when executing LinkedIn actions.
//
// Storage: better-sqlite3 at ./data/cookies.db
// Encryption: AES-256-GCM using KIKO_WORKER_COOKIE_KEY from env (32-byte base64)
//
// Public API:
//   save(identity, cookiesJson, meta)  → upserts
//   load(identity)                      → { cookies, updated_at, stale }
//   list()                              → [{identity, updated_at, stale}]
//   markStale(identity)                 → sets stale=1
//   delete(identity)                    → removes row

import Database from 'better-sqlite3';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const DB_PATH = join(DATA_DIR, 'cookies.db');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS cookies (
    identity TEXT PRIMARY KEY,
    ciphertext BLOB NOT NULL,
    iv BLOB NOT NULL,
    auth_tag BLOB NOT NULL,
    meta_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    stale INTEGER NOT NULL DEFAULT 0
  );
`);

function getKey() {
  const envKey = process.env.KIKO_WORKER_COOKIE_KEY;
  if (envKey) {
    const buf = Buffer.from(envKey, 'base64');
    if (buf.length !== 32) {
      throw new Error('KIKO_WORKER_COOKIE_KEY must be 32 bytes base64');
    }
    return buf;
  }
  // Dev fallback: derive from hostname (NOT SECURE FOR PROD)
  console.warn('[cookieStore] KIKO_WORKER_COOKIE_KEY not set, using insecure dev key');
  return crypto.createHash('sha256').update('kiko-dev-key').digest();
}

const KEY = getKey();

function encrypt(plaintextJson) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(plaintextJson, 'utf8')),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, iv, authTag };
}

function decrypt(ciphertext, iv, authTag) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);
  return plaintext.toString('utf8');
}

export function save(identity, cookiesArray, meta = {}) {
  if (!identity || !Array.isArray(cookiesArray)) {
    throw new Error('identity + cookies array required');
  }
  const plaintextJson = JSON.stringify(cookiesArray);
  const { ciphertext, iv, authTag } = encrypt(plaintextJson);
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT identity FROM cookies WHERE identity = ?').get(identity);
  if (existing) {
    db.prepare(`UPDATE cookies SET ciphertext=?, iv=?, auth_tag=?, meta_json=?, updated_at=?, stale=0 WHERE identity=?`)
      .run(ciphertext, iv, authTag, JSON.stringify(meta), now, identity);
  } else {
    db.prepare(`INSERT INTO cookies (identity, ciphertext, iv, auth_tag, meta_json, created_at, updated_at, stale) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`)
      .run(identity, ciphertext, iv, authTag, JSON.stringify(meta), now, now);
  }
  return { identity, updated_at: now, cookie_count: cookiesArray.length };
}

export function load(identity) {
  const row = db.prepare('SELECT * FROM cookies WHERE identity = ?').get(identity);
  if (!row) return null;
  const plaintextJson = decrypt(row.ciphertext, row.iv, row.auth_tag);
  const cookies = JSON.parse(plaintextJson);
  return {
    identity: row.identity,
    cookies,
    meta: row.meta_json ? JSON.parse(row.meta_json) : {},
    updated_at: row.updated_at,
    stale: row.stale === 1
  };
}

export function list() {
  const rows = db.prepare('SELECT identity, updated_at, stale, meta_json FROM cookies ORDER BY identity').all();
  return rows.map(r => ({
    identity: r.identity,
    updated_at: r.updated_at,
    stale: r.stale === 1,
    meta: r.meta_json ? JSON.parse(r.meta_json) : {}
  }));
}

export function markStale(identity) {
  db.prepare('UPDATE cookies SET stale=1 WHERE identity=?').run(identity);
}

export function deleteIdentity(identity) {
  return db.prepare('DELETE FROM cookies WHERE identity=?').run(identity);
}

export function count() {
  return db.prepare('SELECT COUNT(*) as n FROM cookies').get().n;
}
