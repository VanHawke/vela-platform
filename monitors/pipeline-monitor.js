// monitors/pipeline-monitor.js — Real-time pipeline health monitoring
// NOTE: Uses functions for env vars (not module-level consts) to ensure dotenv has loaded

async function sbFetch(path, opts = {}) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('[pipeline-monitor] Missing SUPABASE env vars'); return []; }
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...opts.headers },
  });
  if (!res.ok) { console.error(`[pipeline-monitor] Supabase ${res.status}: ${await res.text().catch(() => '')}`); return []; }
  return res.json().catch(() => []);
}

async function createAlert(alert) {
  const existing = await sbFetch(`kiko_alerts?type=eq.${alert.type}&entity_id=eq.${encodeURIComponent(alert.entity_id)}&dismissed=eq.false&select=id&limit=1`);
  if (Array.isArray(existing) && existing.length > 0) return false;
  await sbFetch('kiko_alerts', {
    method: 'POST',
    body: JSON.stringify({ id: crypto.randomUUID(), ...alert, created_at: new Date().toISOString(), dismissed: false }),
  });
  console.log(`[pipeline-monitor] Alert: ${alert.title}`);
  return true;
}

export async function runPipelineMonitor() {
  console.log('[pipeline-monitor] Starting scan...');
  const now = Date.now();
  try {
    const deals = await sbFetch('deals?select=id,data,updated_at');
    if (!Array.isArray(deals) || !deals.length) { console.log('[pipeline-monitor] No deals found'); return; }
    let alertCount = 0;
    for (const deal of deals) {
      const d = deal.data || {};
      const dealName = d.name || d.company || d.title || 'Unknown deal';
      const stage = d.stage || 'unknown';
      const value = d.value || 0;
      const lastActivity = d.last_activity_at || deal.updated_at;
      const daysSinceActivity = lastActivity ? Math.floor((now - new Date(lastActivity).getTime()) / 86400000) : 999;
      const status = (d.status || "").toLowerCase();
      if (status === "archived" || status === "won" || status === "lost") continue;
      if (/closed|won|lost|dead/i.test(stage)) continue;
      if (daysSinceActivity > 14 && daysSinceActivity < 365) {
        const created = await createAlert({
          type: 'deal_stale', severity: daysSinceActivity > 30 ? 'high' : 'medium',
          title: `${dealName} — ${daysSinceActivity} days without activity`,
          detail: `Value: $${(value/1000000).toFixed(1)}M. Stage: ${stage}. Last: ${new Date(lastActivity).toLocaleDateString('en-GB')}.`,
          entity_type: 'deal', entity_id: deal.id, entity_name: dealName,
          metadata: { days_stale: daysSinceActivity, stage, value },
          user_id: null, expires_at: new Date(now + 7 * 86400000).toISOString(),
        });
        if (created) alertCount++;
      }
      if (value > 500000 && daysSinceActivity > 7 && daysSinceActivity <= 14) {
        const created = await createAlert({
          type: 'high_value_stale', severity: 'high',
          title: `High-value deal needs attention: ${dealName}`,
          detail: `$${(value/1000000).toFixed(1)}M deal, ${daysSinceActivity} days idle. Stage: ${stage}.`,
          entity_type: 'deal', entity_id: deal.id, entity_name: dealName,
          metadata: { days_stale: daysSinceActivity, stage, value },
          user_id: null, expires_at: new Date(now + 3 * 86400000).toISOString(),
        });
        if (created) alertCount++;
      }
    }
    // Clean expired alerts
    await sbFetch(`kiko_alerts?expires_at=lt.${new Date().toISOString()}`, { method: 'DELETE' });
    console.log(`[pipeline-monitor] Complete. ${alertCount} new alerts. ${deals.length} deals checked.`);
  } catch (err) { console.error('[pipeline-monitor] Error:', err.message); }
}
