// api/cron-lemlist-signals.js — Lemlist Intent Signals Sync
import { cronHeartbeat } from './kiko-tools.js';
// Attempts to poll Lemlist watchlists API. If unavailable, falls back gracefully.
// Lemlist signals primarily flow via webhooks — see lemlist-webhook.js for real-time handling.
// Runs Mon-Fri 7:30am as backup data sync
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const LEMLIST_KEY = process.env.LEMLIST_KEY;
const headers = { 'Content-Type': 'application/json', 'Authorization': `Basic ${Buffer.from(`:${LEMLIST_KEY}`).toString('base64')}` };

const SIGNAL_LABELS = {
  companyIsHiring: { label: 'Hiring Signal', severity: 'medium', icon: '👥' },
  companyRaisedFunds: { label: 'Fundraising Signal', severity: 'high', icon: '💰' },
  jobChange: { label: 'Job Change', severity: 'high', icon: '🔄' },
  newHire: { label: 'New Hire', severity: 'medium', icon: '🆕' },
  companyEmployeeVisitedMyWebsite: { label: 'Website Visit', severity: 'low', icon: '🌐' },
  linkedinProfile: { label: 'LinkedIn Activity', severity: 'low', icon: '💼' },
  linkedinTopic: { label: 'LinkedIn Topic', severity: 'low', icon: '📝' },
};

async function tryFetchSignals() {
  // Try multiple possible endpoint paths
  const paths = ['watch-lists', 'watchlists', 'signals'];
  for (const path of paths) {
    try {
      const res = await fetch(`https://api.lemlist.com/api/${path}`, { headers });
      if (res.ok) {
        const text = await res.text();
        if (text.startsWith('[') || text.startsWith('{')) return { path, data: JSON.parse(text) };
      }
    } catch {}
  }
  return null;
}

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-lemlist-signals', 'started');
  try {
  console.log('[LemlistSignals] Starting signal sync...');
  
  const result = await tryFetchSignals();
  if (!result) {
    console.log('[LemlistSignals] Signals API not available — signals flow via webhooks instead');
    await cronHeartbeat('cron-lemlist-signals', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
    return res.json({ ok: true, message: 'Signals API not available on current plan. Signals flow via lemlist-webhook.js in real-time.', newAlerts: 0 });
  }

  const { path, data } = result;
  console.log(`[LemlistSignals] Found signals at /${path}`);
  let newAlerts = 0;

  // Process signals array
  const signals = Array.isArray(data) ? data : (data.signals || data.items || []);
  for (const signal of signals.slice(0, 50)) {
    const type = signal.type || 'unknown';
    const config = SIGNAL_LABELS[type] || { label: type, severity: 'low', icon: '📡' };
    const contact = signal.contact || {};
    const company = signal.company || {};
    const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email || '';
    const companyName = company.name || '';
    const sigId = signal._id || signal.id || `${type}_${companyName}_${Date.now()}`;

    // Dedup
    const { data: existing } = await supabase.from('kiko_alerts')
      .select('id').eq('metadata->>lemlist_signal_id', sigId).maybeSingle();
    if (existing) continue;

    let title = `${config.icon} ${config.label}: ${companyName || name}`;
    if (type === 'companyRaisedFunds') title = `${config.icon} ${companyName} raised funding — budget window open`;
    if (type === 'jobChange') title = `${config.icon} ${name} changed jobs → ${companyName}`;
    if (type === 'newHire') title = `${config.icon} ${companyName} hired ${contact.jobTitle || name}`;

    await supabase.from('kiko_alerts').insert({
      type: 'intent_signal', severity: config.severity, title,
      detail: `Signal: ${config.label}. Company: ${companyName}. Contact: ${name}. ${contact.jobTitle ? `Role: ${contact.jobTitle}.` : ''}`,
      entity_type: 'signal', entity_name: companyName || name,
      metadata: { lemlist_signal_id: sigId, signal_type: type, company: companyName, contact: name },
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    });
    newAlerts++;

    if (config.severity === 'high') {
      await supabase.from('tasks').insert({
        id: `tsig_${Date.now()}${Math.random().toString(36).slice(2, 5)}`,
        data: { type: type === 'companyRaisedFunds' ? 'Timing Opportunity' : 'Re-engage', company: companyName, contact: name,
          notes: title, dueDate: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
          completed: false, createdAt: new Date().toISOString(), assignedTo: 'Sunny Sidhu', autoCreated: true },
        org_id: '35975d96-c2c9-4b6c-b4d4-bb947ae817d5', updated_at: new Date().toISOString(),
      });
    }
    await new Promise(r => setTimeout(r, 300));
  }

  await cronHeartbeat('cron-lemlist-signals', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: signals.length });
  return res.json({ ok: true, path, signalsProcessed: signals.length, newAlerts, timestamp: new Date().toISOString() });
  } catch (__hbErr) {
    await cronHeartbeat('cron-lemlist-signals', 'error', { heartbeatId: __hbId, errorMessage: __hbErr?.message || 'unknown' });
    return res.status(200).json({ ok: false, error: __hbErr?.message });
  }
}
