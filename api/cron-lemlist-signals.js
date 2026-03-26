// api/cron-lemlist-signals.js — Lemlist Intent Signals Sync
// Polls Lemlist watchlists for new signals (fundraising, job change, hiring, etc.)
// Creates kiko_alerts for each new signal so they appear on homepage
// Runs Mon-Fri 7:30am (after partnership scan, before morning brief)
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

export default async function handler(req, res) {
  console.log('[LemlistSignals] Starting signal sync...');
  let newAlerts = 0, processed = 0;

  try {
    // Get all watchlists
    const wlRes = await fetch('https://api.lemlist.com/api/watch-lists', { headers });
    if (!wlRes.ok) {
      console.log(`[LemlistSignals] Watchlists API ${wlRes.status}`);
      return res.json({ ok: false, error: `API ${wlRes.status}` });
    }
    const watchlists = await wlRes.json();
    if (!Array.isArray(watchlists)) return res.json({ ok: true, message: 'No watchlists', newAlerts: 0 });

    // For each watchlist, get recent signals
    for (const wl of watchlists) {
      try {
        const sigRes = await fetch(`https://api.lemlist.com/api/watch-lists/${wl._id}/signals?status=new&limit=50`, { headers });
        if (!sigRes.ok) continue;
        const signals = await sigRes.json();
        if (!Array.isArray(signals)) continue;

        for (const signal of signals) {
          processed++;
          const type = signal.type || 'unknown';
          const config = SIGNAL_LABELS[type] || { label: type, severity: 'low', icon: '📡' };
          const contact = signal.contact || {};
          const company = signal.company || {};
          const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email || '';
          const companyName = company.name || '';

          // Check if we already created an alert for this signal
          const { data: existing } = await supabase.from('kiko_alerts')
            .select('id').eq('metadata->>lemlist_signal_id', signal._id).maybeSingle();
          if (existing) continue;

          // Build alert title based on signal type
          let title = '', detail = '';
          switch (type) {
            case 'companyRaisedFunds':
              title = `${config.icon} ${companyName} raised funding`;
              detail = `${companyName} has raised new funding. ${name ? `Contact: ${name}.` : ''} Budget window open — consider outreach.`;
              break;
            case 'jobChange':
              title = `${config.icon} ${name} changed jobs`;
              detail = `${name} moved to ${companyName}. ${contact.jobTitle ? `New role: ${contact.jobTitle}.` : ''} Warm re-engagement opportunity.`;
              break;
            case 'newHire':
              title = `${config.icon} ${companyName} hired ${contact.jobTitle || 'new role'}`;
              detail = `${companyName} hired ${name}${contact.jobTitle ? ` as ${contact.jobTitle}` : ''}. New decision-maker — consider outreach.`;
              break;
            case 'companyIsHiring':
              title = `${config.icon} ${companyName} is hiring`;
              detail = `${companyName} hiring: ${signal.signalData?.jobTitle || 'multiple roles'}. Growth signal — budget expansion likely.`;
              break;
            default:
              title = `${config.icon} ${config.label}: ${companyName || name}`;
              detail = `Signal from ${wl.name || 'watchlist'}: ${type} for ${companyName || name}.`;
          }

          await supabase.from('kiko_alerts').insert({
            type: 'intent_signal', severity: config.severity, title, detail,
            entity_type: 'signal', entity_name: companyName || name,
            action: type === 'companyRaisedFunds' ? 'Draft outreach — funding window' : type === 'jobChange' ? 'Re-engage at new company' : 'Review signal',
            metadata: { lemlist_signal_id: signal._id, signal_type: type, company: companyName, contact: name, email: contact.email, watchlist: wl.name },
            expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          });
          newAlerts++;

          // Auto-create task for high-severity signals
          if (config.severity === 'high') {
            await supabase.from('tasks').insert({
              id: `tsig_${Date.now()}${Math.random().toString(36).slice(2, 5)}`,
              data: {
                type: type === 'companyRaisedFunds' ? 'Timing Opportunity' : 'Re-engage',
                company: companyName, contact: name,
                notes: `${title}. ${detail}`,
                dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                completed: false, createdAt: new Date().toISOString(), assignedTo: 'Sunny Sidhu', autoCreated: true,
              },
              org_id: '35975d96-c2c9-4b6c-b4d4-bb947ae817d5',
              updated_at: new Date().toISOString(),
            });
          }
          await new Promise(r => setTimeout(r, 300));
        }
      } catch (e) { console.error(`[LemlistSignals] Watchlist ${wl._id} error:`, e.message); }
    }

    const summary = { watchlists: watchlists.length, processed, newAlerts, timestamp: new Date().toISOString() };
    console.log('[LemlistSignals] Complete:', JSON.stringify(summary));
    return res.json({ ok: true, ...summary });
  } catch (err) {
    console.error('[LemlistSignals] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
