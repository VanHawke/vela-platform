// api/selfcheck.js — System self-audit.
// Queries the live running system and verifies it matches KIKO_SYSTEM_MAP.md.
// Returns JSON pass/fail for every critical component so Sunny can verify Kiko's
// claims against reality in one curl call.
import { sbFetch } from './kiko-tools.js';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  const checks = [];
  const t0 = Date.now();

  async function check(name, fn) {
    try {
      const result = await fn();
      checks.push({ name, status: result.pass ? 'PASS' : 'FAIL', ...result });
    } catch (err) {
      checks.push({ name, status: 'FAIL', error: err.message || String(err) });
    }
  }

  // ─── Data layer invariants ───
  await check('teams_count_is_11', async () => {
    const rows = await sbFetch('f1_teams?select=id');
    return { pass: (rows || []).length === 11, actual: (rows || []).length, expected: 11 };
  });

  await check('categories_count_is_20', async () => {
    const rows = await sbFetch('sponsor_categories?select=id');
    return { pass: (rows || []).length === 20, actual: (rows || []).length, expected: 20 };
  });

  await check('partnerships_active_gte_370', async () => {
    const rows = await sbFetch('f1_partnerships?select=id&status=eq.active');
    return { pass: (rows || []).length >= 370, actual: (rows || []).length, expected: '>=370' };
  });

  await check('no_garbage_partner_names', async () => {
    const rows = await sbFetch('f1_partnerships?select=id,partner_name&status=eq.active');
    const garbage = (rows || []).filter(r => /unknown|not specified|not named|not disclosed|unnamed|partner name|sponsor name/i.test(r.partner_name || ''));
    return { pass: garbage.length === 0, actual: garbage.length, expected: 0, samples: garbage.slice(0, 3).map(g => g.partner_name) };
  });

  await check('cybersecurity_open_teams_correct', async () => {
    // Ground truth: only Cadillac and Haas should be open for cybersecurity
    const partnerships = await sbFetch('f1_partnerships?select=team_id,partner_name,category_id,related_categories&status=eq.active');
    const blocked = new Set();
    for (const p of (partnerships || [])) {
      if (!p.team_id || !p.partner_name) continue;
      if (p.category_id === 'cybersecurity') blocked.add(p.team_id);
      if (Array.isArray(p.related_categories) && p.related_categories.includes('cybersecurity')) blocked.add(p.team_id);
    }
    const allTeams = ['alpine','aston_martin','audi','cadillac','ferrari','haas','mclaren','mercedes','racing_bulls','red_bull','williams'];
    const open = allTeams.filter(t => !blocked.has(t)).sort();
    const expected = ['cadillac','haas'];
    const pass = open.length === 2 && open[0] === 'cadillac' && open[1] === 'haas';
    return { pass, actual: open, expected };
  });

  await check('category_overlaps_table_exists', async () => {
    const rows = await sbFetch('category_overlaps?select=primary_category,blocking_category');
    return { pass: Array.isArray(rows), actual: (rows || []).length, expected: '>=14' };
  });

  await check('no_software_cybersecurity_overlap', async () => {
    // Deleted this turn — it was too broad (Salesforce != CrowdStrike)
    const rows = await sbFetch('category_overlaps?select=primary_category,blocking_category&primary_category=eq.cybersecurity&blocking_category=eq.software');
    return { pass: (rows || []).length === 0, actual: (rows || []).length, expected: 0 };
  });

  // ─── Coverage per category (flag gaps where < 5 teams have a partner) ───
  await check('category_coverage', async () => {
    const partnerships = await sbFetch('f1_partnerships?select=team_id,category_id&status=eq.active');
    const byCategory = {};
    for (const p of (partnerships || [])) {
      if (!p.category_id || !p.team_id) continue;
      if (!byCategory[p.category_id]) byCategory[p.category_id] = new Set();
      byCategory[p.category_id].add(p.team_id);
    }
    const thinCategories = Object.entries(byCategory)
      .filter(([, teams]) => teams.size < 5)
      .map(([cat, teams]) => ({ category: cat, teams_with_partner: teams.size }));
    return {
      pass: thinCategories.length === 0,
      actual: `${thinCategories.length} thin categories`,
      expected: '0 thin',
      thin: thinCategories,
    };
  });

  // ─── Kiko sequences sanity ───
  await check('kiko_sequences_table_reachable', async () => {
    const rows = await sbFetch('kiko_sequences?select=id&limit=1');
    return { pass: Array.isArray(rows), actual: Array.isArray(rows), expected: true };
  });

  await check('campaign_targets_table_reachable', async () => {
    const rows = await sbFetch('campaign_targets?select=id&limit=1');
    return { pass: Array.isArray(rows), actual: Array.isArray(rows), expected: true };
  });

  // ─── Summary ───
  const passed = checks.filter(c => c.status === 'PASS').length;
  const failed = checks.filter(c => c.status === 'FAIL').length;
  const overall = failed === 0 ? 'PASS' : 'FAIL';

  res.status(200).json({
    overall,
    summary: `${passed}/${checks.length} passed, ${failed} failed`,
    duration_ms: Date.now() - t0,
    checks,
    timestamp: new Date().toISOString(),
  });
}
