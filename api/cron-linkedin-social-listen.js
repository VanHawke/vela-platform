// api/cron-linkedin-social-listen.js — LinkedIn activity monitoring
// Monitors priority prospect LinkedIn profiles for new posts/activity.
// Emits signals to kiko_events for the cognitive reasoning chain.
// Runs daily at noon, Monday-Friday. Max 25 profiles per run.

import * as engine from '../lib/linkedinEngine.js';
import * as cookieStore from '../lib/cookieStore.js';
import { cronHeartbeat } from './kiko-tools.js';
import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAX_PROFILES = 25;

async function sbFetch(path, opts = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const r = await fetch(url, { ...opts, headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...opts.headers } });
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error(`Supabase ${r.status}: ${t}`); }
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

function postHash(entityName, postText) {
  return crypto.createHash('md5').update(entityName + ':' + postText.slice(0, 200)).digest('hex');
}

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-linkedin-social-listen', 'started');
  
  try {
    // 1. Check session health — abort if cookies are stale
    const identity = 'matt.smith';
    const stored = cookieStore.load(identity);
    if (!stored || stored.stale || !stored.cookies?.length) {
      await cronHeartbeat('cron-linkedin-social-listen', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.json({ ok: true, skipped: true, reason: `No valid cookies for ${identity}` });
    }

    // 2. Build priority prospect list
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    
    // Priority 1: Contacts from active "To revisit" / "Qualified" deals
    const deals = await sbFetch(`deals?select=data&data->>status=eq.active&or=(data->>stage.eq.To revisit,data->>stage.eq.Qualified)&limit=15`).catch(() => []);
    const dealContacts = (deals || []).map(d => d.data?.contactName).filter(Boolean);
    
    // Priority 2: Contacts who replied recently
    const recentReplies = await sbFetch(`kiko_events?select=entity_name&event_type=eq.email_reply&created_at=gte.${sixtyDaysAgo}&limit=15`).catch(() => []);
    const replyContacts = (recentReplies || []).map(e => e.entity_name).filter(Boolean);
    
    // Merge, dedupe, limit
    const prospectNames = [...new Set([...dealContacts, ...replyContacts])].slice(0, MAX_PROFILES);
    if (!prospectNames.length) {
      await cronHeartbeat('cron-linkedin-social-listen', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.json({ ok: true, prospects: 0, reason: 'No priority prospects to monitor' });
    }

    // 3. Resolve LinkedIn URLs from CRM
    const prospects = [];
    for (const name of prospectNames) {
      const parts = name.split(' ');
      const first = parts[0]; const last = parts.slice(1).join(' ');
      if (!first || !last) continue;
      const contacts = await sbFetch(`contacts?select=data&data->>firstName=ilike.${encodeURIComponent(first)}&data->>lastName=ilike.${encodeURIComponent(last)}&limit=1`).catch(() => []);
      const linkedin = contacts?.[0]?.data?.linkedin || contacts?.[0]?.data?.linkedinUrl;
      if (linkedin) prospects.push({ name, linkedin, company: contacts[0].data?.company || '' });
    }
    
    if (!prospects.length) {
      await cronHeartbeat('cron-linkedin-social-listen', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.json({ ok: true, prospects: 0, reason: 'No prospects have LinkedIn URLs in CRM' });
    }

    // 4. Visit each prospect's activity page
    let emitted = 0, checked = 0, errors = [];
    
    for (const prospect of prospects) {
      try {
        checked++;
        // Extract slug from LinkedIn URL
        const slug = prospect.linkedin.replace(/https?:\/\/(www\.)?linkedin\.com\/in\//i, '').replace(/\/$/, '');
        if (!slug) continue;
        
        // Use dedicated getActivity function — visits activity page and extracts posts
        const result = await engine.getActivity(identity, slug);
        
        // If authwall, abort entire run — session may be compromised
        if (result?.error === 'authwall') {
          console.error('[linkedin-social-listen] Authwall detected — aborting run');
          errors.push({ name: prospect.name, error: 'authwall' });
          break;
        }
        
        if (!result?.ok || !result.posts?.length) {
          console.log(`[linkedin-social-listen] No posts for ${prospect.name}`);
          continue;
        }
        
        for (const post of result.posts.slice(0, 3)) {
          const text = post.text.trim().slice(0, 500);
          if (text.length < 30) continue;
          const hash = postHash(prospect.name, text);
          
          // Dedup check
          const existing = await sbFetch(`kiko_linkedin_activity_log?entity_name=eq.${encodeURIComponent(prospect.name)}&post_hash=eq.${hash}&limit=1`).catch(() => []);
          if (existing?.length) continue; // Already seen
          
          // Emit to kiko_events
          const event = await sbFetch('kiko_events', { method: 'POST', body: JSON.stringify({
            event_type: 'linkedin_activity',
            entity_name: prospect.name,
            entity_type: 'contact',
            detail: `LinkedIn post from ${prospect.name} (${prospect.company}): "${text.slice(0, 300)}"`,
            payload: { platform: 'linkedin', post_text: text, profile_url: prospect.linkedin, detected_at: new Date().toISOString() },
            processed: false,
          }) }).catch(e => { console.warn('[linkedin-social-listen] Event emit failed:', e.message); return null; });
          
          // Log in activity tracker
          await sbFetch('kiko_linkedin_activity_log', { method: 'POST', body: JSON.stringify({
            entity_name: prospect.name, linkedin_url: prospect.linkedin,
            post_hash: hash, post_snippet: text.slice(0, 200),
            emitted_to_events: !!event, event_id: event?.[0]?.id || null,
          }) }).catch(() => {});
          
          emitted++;
        }
        
        // Random delay between profiles (20-40 seconds)
        if (checked < prospects.length) {
          const delay = 20000 + Math.random() * 20000;
          await new Promise(r => setTimeout(r, delay));
        }
        
      } catch (err) {
        console.warn(`[linkedin-social-listen] Error for ${prospect.name}: ${err.message}`);
        errors.push({ name: prospect.name, error: err.message });
        continue; // Skip to next prospect
      }
    }

    const summary = { ok: true, checked, emitted, errors: errors.length, prospects: prospects.length };
    console.log('[linkedin-social-listen] Complete:', JSON.stringify(summary));
    
    await cronHeartbeat('cron-linkedin-social-listen', 'finished', {
      heartbeatId: __hbId, durationMs: Date.now() - __hbStart,
      recordsProcessed: emitted, extra: summary,
    });
    
    return res.json(summary);
    
  } catch (err) {
    console.error('[linkedin-social-listen] Fatal error:', err.message);
    await cronHeartbeat('cron-linkedin-social-listen', 'error', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, error: err.message });
    return res.status(500).json({ ok: false, error: err.message });
  }
}
