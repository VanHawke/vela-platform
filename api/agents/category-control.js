// api/agents/category-control.js — Category Control Agent
// Pricing power through enforced scarcity. One partner per category.
// Model: claude-sonnet-4-6
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from '../kiko-tools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

// ── Check category availability ──
async function checkCategory({ team, category }) {
  const teams = await sbFetch('f1_teams?order=sort_order&select=id,name');
  const categories = await sbFetch('sponsor_categories?order=sort_order&select=id,name');
  const partnerships = await sbFetch('f1_partnerships?status=eq.active&select=team_id,partner_name,category_id,tier');

  if (!teams?.length) return 'Partnership data not loaded.';

  // Find team
  const targetTeam = team ? teams.find(t => t.name.toLowerCase().includes(team.toLowerCase())) : null;
  const targetCat = category ? categories?.find(c => c.name.toLowerCase().includes(category.toLowerCase())) : null;

  if (team && !targetTeam) return `Team "${team}" not found. Available: ${teams.map(t => t.name).join(', ')}`;
  if (category && !targetCat) return `Category "${category}" not found. Available: ${(categories || []).map(c => c.name).join(', ')}`;

  // Check specific team + category combo
  if (targetTeam && targetCat) {
    const existing = (partnerships || []).find(p => p.team_id === targetTeam.id && p.category_id === targetCat.id);
    if (existing) return `❌ ${targetCat.name} on ${targetTeam.name} is FILLED by ${existing.partner_name} (${existing.tier}). Category exclusivity applies — cannot sell.`;
    return `✅ ${targetCat.name} on ${targetTeam.name} is OPEN. Available for sale. Exclusivity premium applies.`;
  }

  // Team-level view: all gaps for a team
  if (targetTeam) {
    const teamPartners = (partnerships || []).filter(p => p.team_id === targetTeam.id);
    const filledIds = new Set(teamPartners.map(p => p.category_id));
    const gaps = (categories || []).filter(c => !filledIds.has(c.id));
    const filled = (categories || []).filter(c => filledIds.has(c.id));
    let out = `${targetTeam.name} — ${teamPartners.length} partners, ${gaps.length} gaps\n\n`;
    out += `OPEN CATEGORIES (${gaps.length}):\n${gaps.map(g => `  ✅ ${g.name} — available for sale`).join('\n')}\n\n`;
    out += `FILLED CATEGORIES (${filled.length}):\n${filled.map(f => {
      const p = teamPartners.find(tp => tp.category_id === f.id);
      return `  ❌ ${f.name} — ${p?.partner_name} (${p?.tier})`;
    }).join('\n')}`;
    return out;
  }

  // Category-level view: which teams have gaps in this category
  if (targetCat) {
    let out = `${targetCat.name} — across all teams:\n\n`;
    for (const t of teams) {
      const existing = (partnerships || []).find(p => p.team_id === t.id && p.category_id === targetCat.id);
      out += existing ? `  ❌ ${t.name}: ${existing.partner_name} (${existing.tier})\n` : `  ✅ ${t.name}: OPEN\n`;
    }
    return out;
  }

  return 'Specify a team, category, or both. Examples: "cybersecurity on Haas", "Haas gaps", "fintech across teams"';
}

// ── Conflict check: before proposing, verify no exclusivity conflict ──
async function conflictCheck({ company, team, category }) {
  // Check if this company already sponsors another team in this category
  const partnerships = await sbFetch('f1_partnerships?status=eq.active&select=team_id,partner_name,category_id,tier');
  const conflicts = (partnerships || []).filter(p =>
    p.partner_name?.toLowerCase().includes((company || '').toLowerCase())
  );

  if (!conflicts.length) return `No existing sponsorship found for ${company}. Clear to proceed.`;

  let out = `⚠️ CONFLICT CHECK for ${company}:\n\n`;
  for (const c of conflicts) {
    const teams = await sbFetch(`f1_teams?id=eq.${c.team_id}&select=name&limit=1`);
    const cats = await sbFetch(`sponsor_categories?id=eq.${c.category_id}&select=name&limit=1`);
    out += `${company} already sponsors ${teams?.[0]?.name || c.team_id} in ${cats?.[0]?.name || c.category_id} (${c.tier})\n`;
  }
  out += '\nConsider: exclusivity terms, competitive conflict rules, multi-team opportunity.';
  return out;
}

// ── Main Dispatch ──
export async function callCategoryControlAgent(operation, params = {}) {
  try {
    switch (operation) {
      case 'check': return await checkCategory(params);
      case 'conflict': return await conflictCheck(params);
      default: return `Unknown category operation: ${operation}. Available: check (team/category availability), conflict (company conflict check)`;
    }
  } catch (err) {
    return `Category Control error (${operation}): ${err.message}`;
  }
}
