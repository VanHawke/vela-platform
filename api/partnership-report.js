// api/partnership-report.js — PDF-ready partnership gap analysis
// Returns structured data for PDF generation or direct JSON for Kiko
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  const team = req.query?.team;
  const format = req.query?.format || 'json'; // json | html

  const { data: teams } = await supabase.from('f1_teams').select('*').order('sort_order');
  const { data: categories } = await supabase.from('sponsor_categories').select('*').order('sort_order');
  const { data: partnerships } = await supabase.from('f1_partnerships').select('*').eq('status', 'active').order('tier');

  const filteredTeams = team ? teams.filter(t => t.id === team || t.name.toLowerCase().includes(team.toLowerCase())) : teams;

  // Build analysis per team
  const analysis = filteredTeams.map(t => {
    const tPartners = partnerships.filter(p => p.team_id === t.id);
    const filledCats = new Set(tPartners.map(p => p.category_id));
    const gaps = categories.filter(c => !filledCats.has(c.id));
    const byTier = {};
    tPartners.forEach(p => { byTier[p.tier] = byTier[p.tier] || []; byTier[p.tier].push(p.partner_name); });
    return {
      team: t.name, fullName: t.full_name, engine: t.engine, color: t.color,
      totalPartners: tPartners.length,
      categoriesFilled: filledCats.size,
      totalCategories: categories.length,
      gaps: gaps.map(g => g.name),
      gapCount: gaps.length,
      byTier,
      partners: tPartners.map(p => ({ name: p.partner_name, category: categories.find(c => c.id === p.category_id)?.name, tier: p.tier })),
    };
  });

  if (format === 'json') return res.json({ analysis, generated: new Date().toISOString() });

  // HTML report — printable, saveable as PDF via browser
  const totalGaps = analysis.reduce((a, t) => a + t.gapCount, 0);
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>F1 Partnership Matrix — Gap Analysis</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'DM Sans', -apple-system, sans-serif; color: #1A1A1A; padding: 40px; max-width: 900px; margin: 0 auto; }
  h1 { font-size: 24px; font-weight: 700; letter-spacing: -0.03em; }
  h2 { font-size: 16px; font-weight: 600; margin-top: 28px; margin-bottom: 8px; }
  .subtitle { font-size: 12px; color: #6B6B6B; margin-top: 4px; }
  .team-card { border: 1px solid #E5E5E5; border-radius: 10px; padding: 16px; margin-bottom: 16px; page-break-inside: avoid; }
  .team-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .team-dot { width: 10px; height: 10px; border-radius: 5px; }
  .team-name { font-size: 15px; font-weight: 600; }
  .team-meta { font-size: 11px; color: #6B6B6B; }
  .stats { display: flex; gap: 16px; margin-bottom: 10px; }
  .stat { font-size: 11px; padding: 3px 8px; border-radius: 6px; }
  .stat-green { background: #D1FAE5; color: #065F46; }
  .stat-red { background: #FEE2E2; color: #991B1B; }
  .gaps-list { font-size: 11px; color: #991B1B; line-height: 1.6; }
  .partners-table { width: 100%; font-size: 11px; border-collapse: collapse; margin-top: 8px; }
  .partners-table th { text-align: left; padding: 4px 8px; background: #F9FAFB; border-bottom: 1px solid #E5E5E5; font-weight: 600; }
  .partners-table td { padding: 4px 8px; border-bottom: 1px solid #F3F4F6; }
  .tier-badge { font-size: 9px; padding: 1px 5px; border-radius: 3px; font-weight: 600; }
  .footer { margin-top: 32px; font-size: 10px; color: #ABABAB; border-top: 1px solid #E5E5E5; padding-top: 12px; }
  @media print { body { padding: 20px; } .team-card { break-inside: avoid; } }
</style></head><body>
<h1>F1 Partnership Matrix</h1>
<p class="subtitle">Gap Analysis Report · ${filteredTeams.length} teams · ${partnerships.length} partnerships · ${totalGaps} gaps · Generated ${new Date().toLocaleDateString('en-GB')}</p>
<p class="subtitle" style="margin-top:2px">Prepared by Van Hawke Group · vanhawke.com</p>

${analysis.map(t => `
<div class="team-card">
  <div class="team-header">
    <span class="team-dot" style="background:${t.color}"></span>
    <span class="team-name">${t.team}</span>
    <span class="team-meta">${t.fullName || ''} · ${t.engine || ''}</span>
  </div>
  <div class="stats">
    <span class="stat stat-green">${t.totalPartners} partners</span>
    <span class="stat stat-green">${t.categoriesFilled}/${t.totalCategories} categories</span>
    <span class="stat stat-red">${t.gapCount} gaps</span>
  </div>
  ${t.gaps.length ? `<p class="gaps-list"><strong>Open categories:</strong> ${t.gaps.join(' · ')}</p>` : '<p style="font-size:11px;color:#065F46">✓ No significant gaps</p>'}
  <table class="partners-table">
    <thead><tr><th>Partner</th><th>Category</th><th>Tier</th></tr></thead>
    <tbody>
      ${t.partners.map(p => `<tr><td>${p.name}</td><td>${p.category || '—'}</td><td><span class="tier-badge" style="background:${
        p.tier === 'title' ? '#FEF3C7' : p.tier === 'principal' ? '#DBEAFE' : '#F3F4F6'
      };color:${p.tier === 'title' ? '#92400E' : p.tier === 'principal' ? '#1E40AF' : '#374151'}">${p.tier}</span></td></tr>`).join('')}
    </tbody>
  </table>
</div>`).join('')}

<div class="footer">
  <p>Van Hawke Group · F1 Sponsorship Advisory · Confidential</p>
  <p>Data sourced from official team partner pages, press releases, and verified news sources.</p>
  <p>Auto-updated daily via Partnership Scanner Agent. Last scan: ${new Date().toISOString()}</p>
</div>
</body></html>`;

  res.setHeader('Content-Type', 'text/html');
  return res.send(html);
}
