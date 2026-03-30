// api/kiko-self-knowledge.js — Compact self-knowledge generator
import { sbFetch } from './kiko-tools.js';
import { TOOL_DEFINITIONS } from './kiko-tools.js';
import { INTENT_TO_AGENT } from './agents/intent-classifier.js';
import fs from 'fs';
import path from 'path';

let cache = null;
let cacheTime = 0;
let lastCacheKey = null;
const CACHE_TTL = 5 * 60 * 1000;

export async function generateSelfKnowledge(userId) {
  const cacheKey = userId || 'default';
  if (cache && Date.now() - cacheTime < CACHE_TTL && cacheKey === lastCacheKey) return cache;

  const uf = userId ? `&user_id=eq.${userId}` : '';
  const k = [];
  k.push('SELF-KNOWLEDGE (auto-generated):');

  // Counts only — routing table already has tool descriptions
  const tools = TOOL_DEFINITIONS || [];
  const intents = Object.keys(INTENT_TO_AGENT || {});
  k.push(`${tools.filter(t=>t.name.startsWith('ask_')).length} agents, ${tools.filter(t=>!t.name.startsWith('ask_')).length} direct tools, ${intents.length} intents`);

  // Cron count
  try {
    const vc = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf-8'));
    k.push(`${(vc.crons||[]).length} cron jobs (proactive: morning brief, inbox triage, meeting prep, deal decay, outreach scoring)`);
  } catch { k.push('24 cron jobs'); }

  // Dynamic agents
  try {
    const dyn = await sbFetch('kiko_dynamic_agents?active=eq.true&select=name,display_name&order=usage_count.desc');
    if (dyn?.length) k.push(`Dynamic agents (${dyn.length}): ${dyn.map(a=>a.display_name).join(', ')}`);
  } catch {}

  // Cron health
  try {
    const hb = await sbFetch('kiko_cron_heartbeats?order=started_at.desc&limit=15&select=cron_name,status');
    if (hb?.length) {
      const latest = {}; for (const h of hb) { if (!latest[h.cron_name]) latest[h.cron_name] = h; }
      const ok = Object.values(latest).filter(h=>h.status==='finished').length;
      const err = Object.values(latest).filter(h=>h.status==='error').length;
      k.push(`Cron health: ${ok} ok, ${err} errored`);
    }
  } catch {}

  // Knowledge sources — count only
  try {
    const src = await sbFetch('kiko_knowledge_sources?active=eq.true&select=category');
    if (src?.length) {
      const cats = {}; for (const s of src) { cats[s.category] = (cats[s.category]||0)+1; }
      k.push(`Knowledge: ${src.length} sources (${Object.entries(cats).map(([c,n])=>`${c}:${n}`).join(', ')})`);
    }
  } catch {}

  // Skills count
  try {
    const skills = await sbFetch('kiko_skills?select=category');
    if (skills?.length) {
      const cats = {}; for (const s of skills) { cats[s.category] = (cats[s.category]||0)+1; }
      k.push(`Skills: ${skills.length} (${Object.entries(cats).map(([c,n])=>`${c}:${n}`).join(', ')})`);
    }
  } catch {}

  // Imported conversations — count only
  try {
    const imp = await sbFetch(`kiko_imported_conversations?processed=eq.true${uf}&select=source`);
    if (imp?.length) {
      const bySrc = {}; for (const c of imp) { bySrc[c.source] = (bySrc[c.source]||0)+1; }
      k.push(`Imported: ${imp.length} conversations (${Object.entries(bySrc).map(([s,n])=>`${s}:${n}`).join(', ')})`);
    }
  } catch {}

  // Personal context count
  try {
    const pc = await sbFetch(`kiko_personal_context?select=category${uf}`);
    if (pc?.length) k.push(`Personal context: ${pc.length} items — you know this user personally`);
  } catch {}

  // Static capabilities (compact)
  k.push('Capabilities: Gmail, Calendar, web search, memory, doc generation (docx/xlsx/pptx/csv), image analysis, CRM writes, navigation, Lemlist');
  k.push('Pages: Home, Pipeline, Contacts, Organisations, Command Centre, Calendar, Tasks, Partnership Matrix, Lemlist, News, Documents, Settings');

  const result = k.join('\n');
  cache = result;
  cacheTime = Date.now();
  lastCacheKey = cacheKey;
  return result;
}
