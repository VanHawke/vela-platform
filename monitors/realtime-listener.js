// monitors/realtime-listener.js — Supabase Realtime for instant CRM change detection
// Watches: deals (stage changes), contacts (new/updated), companies (new)
// Creates kiko_alerts for meaningful changes
import 'dotenv/config';

const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

async function sbFetch(path, opts = {}) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...opts.headers },
  });
  if (!res.ok) return [];
  return res.json().catch(() => []);
}

async function createAlert(alert) {
  const existing = await sbFetch(`kiko_alerts?type=eq.${alert.type}&entity_id=eq.${encodeURIComponent(alert.entity_id)}&dismissed=eq.false&select=id&limit=1`);
  if (Array.isArray(existing) && existing.length > 0) return;
  await sbFetch('kiko_alerts', {
    method: 'POST',
    body: JSON.stringify({ id: crypto.randomUUID(), ...alert, created_at: new Date().toISOString(), dismissed: false }),
  });
  console.log(`[realtime] Alert: ${alert.title}`);
}

// Track previous deal stages to detect stage CHANGES (not just any update)
const dealStageCache = new Map();

function handleDealChange(payload) {
  const { eventType, new: newRow, old: oldRow } = payload;
  const d = newRow?.data || {};
  const dealName = d.name || d.company || d.title || 'Unknown deal';
  const dealId = newRow?.id || 'unknown';

  if (eventType === 'INSERT') {
    createAlert({
      type: 'deal_created', severity: 'low',
      title: `New deal created: ${dealName}`,
      detail: `Stage: ${d.stage || 'New'}. Value: $${((d.value || 0)/1000000).toFixed(1)}M.`,
      entity_type: 'deal', entity_id: dealId, entity_name: dealName,
      metadata: { stage: d.stage, value: d.value },
      user_id: null, expires_at: new Date(Date.now() + 3 * 86400000).toISOString(),
    });
  }

  if (eventType === 'UPDATE') {
    const oldStage = dealStageCache.get(dealId);
    const newStage = d.stage;
    if (oldStage && newStage && oldStage !== newStage) {
      createAlert({
        type: 'deal_stage_change', severity: 'medium',
        title: `${dealName} moved: ${oldStage} → ${newStage}`,
        detail: `Deal value: $${((d.value || 0)/1000000).toFixed(1)}M.`,
        entity_type: 'deal', entity_id: dealId, entity_name: dealName,
        metadata: { old_stage: oldStage, new_stage: newStage, value: d.value },
        user_id: null, expires_at: new Date(Date.now() + 3 * 86400000).toISOString(),
      });
    }
    dealStageCache.set(dealId, newStage);
  }
}

function handleContactChange(payload) {
  const { eventType, new: newRow } = payload;
  const c = newRow?.data || {};
  const name = `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown';
  const contactId = newRow?.id || 'unknown';

  if (eventType === 'INSERT') {
    createAlert({
      type: 'contact_created', severity: 'low',
      title: `New contact added: ${name}${c.company ? ` (${c.company})` : ''}`,
      detail: `Email: ${c.email || 'none'}. Title: ${c.title || 'none'}.`,
      entity_type: 'contact', entity_id: contactId, entity_name: name,
      metadata: { company: c.company, email: c.email, title: c.title },
      user_id: null, expires_at: new Date(Date.now() + 3 * 86400000).toISOString(),
    });
  }
}

export async function startRealtimeListener() {
  // Use Supabase JS client for Realtime
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(SB_URL, SB_KEY);

  // Pre-populate deal stage cache
  try {
    const deals = await sbFetch('deals?select=id,data');
    if (Array.isArray(deals)) {
      for (const d of deals) {
        if (d.data?.stage) dealStageCache.set(d.id, d.data.stage);
      }
      console.log(`[realtime] Cached ${dealStageCache.size} deal stages`);
    }
  } catch (e) { console.error('[realtime] Cache init failed:', e.message); }

  // Single consolidated channel for all realtime subscriptions
  const channel = supabase.channel('kiko-monitor')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, (payload) => {
      try { handleDealChange(payload); } catch (e) { console.error('[realtime] Deal handler error:', e.message); }
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'contacts' }, (payload) => {
      try { handleContactChange(payload); } catch (e) { console.error('[realtime] Contact handler error:', e.message); }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'campaign_targets' }, (payload) => {
      try {
        const newStatus = payload.new?.status;
        const oldStatus = payload.old?.status;
        if (newStatus === 'replied' && oldStatus !== 'replied') {
          const name = payload.new?.contact_name || 'Unknown';
          createAlert({
            type: 'campaign_reply', severity: 'high',
            title: `Campaign prospect replied: ${name}`,
            detail: `Status changed to replied. Check inbox for their response.`,
            entity_type: 'campaign_target', entity_id: payload.new?.id || 'unknown', entity_name: name,
            metadata: { old_status: oldStatus, new_status: newStatus, sequence_id: payload.new?.sequence_id },
            user_id: '9f486437-4bf5-4111-abfe-fe19bfa76063',
            expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
          });
        }
      } catch (e) { console.error('[realtime] Campaign handler error:', e.message); }
    })
    .subscribe((status) => {
      console.log(`[realtime] Consolidated channel: ${status}`);
    });

  // Reconnection monitoring — check every 60s
  setInterval(() => {
    if (channel.state !== 'joined') {
      console.warn(`[realtime] Channel state: ${channel.state} — attempting reconnect`);
      if (channel.state === 'errored' || channel.state === 'closed') channel.subscribe();
    }
  }, 60000);

  console.log('[realtime] Supabase Realtime listener started — 1 channel, 3 tables (deals, contacts, campaign_targets)');
  return { channel };
}
