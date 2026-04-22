// api/kiko-health.js — Kiko AI health probe
// POST /api/kiko-health
// Calls Sonnet with minimal prompt to verify Kiko's brain is functional.
// Returns { status, latency_ms, response_text, bible_layers_loaded, model }
// Run BEFORE and AFTER every schema/code migration from Sub-Phase B onwards.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from './kiko-tools.js';

export const config = { maxDuration: 30 };

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const start = Date.now();
  try {
    // Check which Bible layers exist in DB
    const [coreRows, orgRows, userRows] = await Promise.all([
      sbFetch('kiko_core_bible?select=id&limit=1').catch(() => []),
      sbFetch('org_bibles?select=id&limit=1').catch(() => []),
      sbFetch('user_bibles?select=id&limit=1').catch(() => []),
    ]);
    const bibleLayers = [];
    if (coreRows?.length) bibleLayers.push('core');
    if (orgRows?.length) bibleLayers.push('org');
    if (userRows?.length) bibleLayers.push('personal');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      system: 'You are Kiko, the AI executive operating partner for Van Hawke Group. Confirm your identity in one sentence.',
      messages: [{ role: 'user', content: 'Who are you?' }],
    });

    const text = response.content?.[0]?.text || '';
    const latency = Date.now() - start;
    const mentionsKiko = /kiko/i.test(text);

    return res.status(200).json({
      status: mentionsKiko ? 'pass' : 'fail',
      latency_ms: latency,
      response_text: text,
      bible_layers_loaded: bibleLayers,
      model: 'claude-sonnet-4-20250514',
    });
  } catch (err) {
    return res.status(200).json({
      status: 'fail',
      latency_ms: Date.now() - start,
      response_text: `Error: ${err.message}`,
      bible_layers_loaded: [],
      model: 'claude-sonnet-4-20250514',
    });
  }
}
