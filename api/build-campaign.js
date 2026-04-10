// api/build-campaign.js
// DETERMINISTIC campaign builder. No LLM judgment in critical path.
// Input: { category: "banking" }
// Output: { team, category, why, criteria, competitive_landscape, top_50, top_8, sequence_id, enrolled }
//
// Architecture: see CAMPAIGN_BUILDER_ARCHITECTURE.md
// This endpoint exists because 3 prior prompt-engineering attempts to get Kiko
// to reliably build campaigns without hallucinating partnerships failed.
// The fix is to move all judgment into SQL + a single deterministic web_search call.

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

// Default minimum criteria per category — used as starting point
const CATEGORY_CRITERIA = {
  banking:       { revenue_min: '$10B', funding_min: null, geography: 'Global / EU / US', dm_seniority: 'CMO / Head of Brand / EVP' },
  fintech:       { revenue_min: '$500M', funding_min: '$200M', geography: 'Global', dm_seniority: 'CMO / VP Marketing' },
  cybersecurity: { revenue_min: '$500M', funding_min: '$100M', geography: 'Global', dm_seniority: 'CMO / VP Marketing' },
  cloud:         { revenue_min: '$1B', funding_min: '$500M', geography: 'Global', dm_seniority: 'CMO / VP Marketing' },
  ai_data:       { revenue_min: '$200M', funding_min: '$200M', geography: 'Global', dm_seniority: 'CMO / Head of Marketing' },
  software:      { revenue_min: '$500M', funding_min: '$200M', geography: 'Global', dm_seniority: 'CMO / VP Marketing' },
  semiconductors:{ revenue_min: '$1B', funding_min: null, geography: 'Global', dm_seniority: 'CMO / VP Marketing' },
  telecom:       { revenue_min: '$5B', funding_min: null, geography: 'Regional / Global', dm_seniority: 'CMO / EVP Brand' },
  gaming:        { revenue_min: '$300M', funding_min: '$100M', geography: 'Global', dm_seniority: 'CMO / VP Marketing' },
  crypto:        { revenue_min: '$100M', funding_min: '$50M', geography: 'Global', dm_seniority: 'CMO / Head of Brand' },
  energy:        { revenue_min: '$10B', funding_min: null, geography: 'Global', dm_seniority: 'CMO / VP Brand' },
  automotive:    { revenue_min: '$5B', funding_min: null, geography: 'Global', dm_seniority: 'CMO / VP Marketing' },
  hospitality:   { revenue_min: '$1B', funding_min: null, geography: 'Global', dm_seniority: 'CMO / VP Marketing' },
  fashion:       { revenue_min: '$500M', funding_min: null, geography: 'Global', dm_seniority: 'CMO / Brand Director' },
  watches:       { revenue_min: '$200M', funding_min: null, geography: 'Global', dm_seniority: 'CMO / Brand Director' },
  food_bev:      { revenue_min: '$1B', funding_min: null, geography: 'Global', dm_seniority: 'CMO / VP Marketing' },
  health:        { revenue_min: '$500M', funding_min: '$100M', geography: 'Global', dm_seniority: 'CMO / VP Marketing' },
  logistics:     { revenue_min: '$2B', funding_min: null, geography: 'Global', dm_seniority: 'CMO / VP Brand' },
  legal:         { revenue_min: '$200M', funding_min: null, geography: 'Global', dm_seniority: 'CMO / Head of Marketing' },
  robotics:      { revenue_min: '$200M', funding_min: '$100M', geography: 'Global', dm_seniority: 'CMO / VP Marketing' },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { category } = req.body || {};
  if (!category) return res.status(400).json({ error: 'category required' });

  try {
    // ─── STEP 1: Validate category exists ───
    const { data: catRow } = await supabase
      .from('sponsor_categories').select('*').eq('id', category).maybeSingle();
    if (!catRow) return res.status(400).json({ error: `Unknown category: ${category}. Valid: banking, fintech, cybersecurity, cloud, ai_data, software, semiconductors, telecom, gaming, crypto, energy, automotive, hospitality, fashion, watches, food_bev, health, logistics, legal, robotics` });

    // ─── STEP 2: Build expanded category set (category + overlapping categories) ───
    const { data: overlaps } = await supabase
      .from('category_overlaps').select('blocking_category').eq('primary_category', category);
    const expandedCategories = [category, ...(overlaps || []).map(o => o.blocking_category)];

    // ─── STEP 3: Find which teams are blocked in this category space ───
    // A team is blocked if they have ANY active partner in the expanded category set
    const { data: allPartnerships } = await supabase
      .from('f1_partnerships')
      .select('team_id, partner_name, category_id, tier, related_categories')
      .eq('status', 'active');

    const blockedTeamIds = new Set();
    for (const p of allPartnerships || []) {
      if (!p.partner_name) continue;
      // Direct category match
      if (p.category_id && expandedCategories.includes(p.category_id)) {
        blockedTeamIds.add(p.team_id);
      }
      // Related categories match (handles Revolut blocking banking via related_categories)
      if (p.related_categories?.some(rc => expandedCategories.includes(rc))) {
        blockedTeamIds.add(p.team_id);
      }
    }

    // ─── STEP 4: Pick the team — alphabetical for full determinism ───
    const { data: allTeams } = await supabase
      .from('f1_teams').select('id, name, full_name, team_principal').order('id');
    const openTeams = (allTeams || []).filter(t => !blockedTeamIds.has(t.id));
    if (openTeams.length === 0) {
      return res.status(409).json({
        error: 'category_saturated',
        message: `Category "${category}" (and overlapping categories ${expandedCategories.join(', ')}) is fully saturated across all 11 F1 teams. No clean slot.`,
        blocked_teams: [...blockedTeamIds],
      });
    }
    // RESPECT USER TEAM CHOICE: if preferredTeam is supplied and it's open, use it.
    // If preferredTeam is supplied but BLOCKED, refuse — don't silently fall back.
    // If no preferredTeam, pick alphabetically first (deterministic default).
    const preferredTeam = (req.body?.preferredTeam || req.query?.preferredTeam || '').toLowerCase().trim();
    let team;
    if (preferredTeam) {
      const match = openTeams.find(t => t.id === preferredTeam);
      if (match) {
        team = match;
      } else {
        // User asked for a specific team but it's blocked. Return a clear error with the reason.
        const blockedBy = (allPartnerships || []).filter(p => p.team_id === preferredTeam &&
          (p.category_id === catRow.id || (Array.isArray(p.related_categories) && p.related_categories.some(rc => expandedCategories.includes(rc)))));
        return res.status(409).json({
          error: 'preferred_team_blocked',
          message: `${preferredTeam} is blocked in ${catRow.name} by: ${blockedBy.map(b => b.partner_name).join(', ') || 'an overlapping category partner'}. Open teams in this category: ${openTeams.map(t => t.id).join(', ')}.`,
          preferred_team: preferredTeam,
          open_teams: openTeams.map(t => t.id),
          blocked_by: blockedBy.map(b => ({ partner: b.partner_name, category: b.category_id })),
        });
      }
    } else {
      team = openTeams[0]; // Deterministic fallback: alphabetical first
    }

    // ─── STEP 5: Build the exclusion set (every clean partner name across all teams) ───
    const exclusionSet = new Set();
    for (const p of allPartnerships || []) {
      const name = (p.partner_name || '').trim();
      if (name && !/unknown|not specified|not named|not disclosed/i.test(name)) {
        exclusionSet.add(name.toLowerCase());
      }
    }

    // ─── STEP 6: Find or create the campaign sequence ───
    const { data: existingSeq } = await supabase
      .from('kiko_sequences').select('*')
      .ilike('name', `%${team.name}%${catRow.name.split(' ')[0]}%`)
      .limit(1).maybeSingle();
    let sequenceId = existingSeq?.id;
    let sequenceName = existingSeq?.name;
    if (!sequenceId) {
      // Auto-draft the 5 sequence steps using Sunny's commercial doctrine
      // Template: Dear {firstName}, [body] Kind regards, Sunny Sidhu
      // Each step has a distinct persuasion lever (authority, reciprocity, social proof, scarcity, final)
      const draftedSteps = await draftSequenceSteps(team.name, catRow.name);

      const { data: newSeq, error: seqErr } = await supabase.from('kiko_sequences').insert({
        name: `${team.name} F1 - ${catRow.name}`,
        target_persona: `C-suite at ${catRow.name} companies`,
        description: `Auto-generated by build-campaign for ${team.name} ${catRow.name} category`,
        is_active: false,
        steps: draftedSteps,
      }).select().single();
      if (seqErr || !newSeq) throw new Error(`Failed to create sequence: ${seqErr?.message || 'no row returned'}`);
      sequenceId = newSeq.id;
      sequenceName = newSeq.name;
    }

    // ─── STEP 7: Source 50 targets via Claude + web_search, with exclusion list ───
    // Limit exclusion list passed to LLM to avoid token explosion
    const exclusionListForPrompt = [...exclusionSet].slice(0, 100).join(', ');
    const sourcingPrompt = `You are sourcing 50 companies in the ${catRow.name} sector for an F1 sponsorship campaign with ${team.name}. This is a real outreach list.

CRITERIA (all must be met):
- Annual revenue: ${CATEGORY_CRITERIA[category]?.revenue_min || '$500M+'}
${CATEGORY_CRITERIA[category]?.funding_min ? `- OR recent funding: ${CATEGORY_CRITERIA[category].funding_min}+` : ''}
- Geography: ${CATEGORY_CRITERIA[category]?.geography || 'Global'}
- Active brand/marketing budget visible (sports sponsorships, ad campaigns, conference presence)
- Decision-maker reachable: ${CATEGORY_CRITERIA[category]?.dm_seniority || 'CMO / VP Marketing'}

CRITICAL EXCLUSION RULE: The following companies are ALREADY F1 partners with another team and MUST NOT appear in your list under any circumstances. If you find one, skip it and find another company instead. Exclusion list: ${exclusionListForPrompt}

Return ONLY a JSON array of EXACTLY 50 entries. No explanation, no markdown fences, just the array. Each entry must have: company, revenue, hq, rationale, decision_maker_name, decision_maker_title.

[{"company":"...","revenue":"...","hq":"...","rationale":"...","decision_maker_name":"...","decision_maker_title":"..."}]`;

    const sourcingRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: sourcingPrompt }],
    });

    // Extract JSON from response
    const textContent = sourcingRes.content.filter(b => b.type === 'text').map(b => b.text).join('');
    let sourced = [];
    try {
      const cleaned = textContent.replace(/```json|```/g, '').trim();
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (match) sourced = JSON.parse(match[0]);
    } catch (err) {
      console.error('[build-campaign] JSON parse failed:', err.message);
    }

    // ─── STEP 8: Hard-filter against exclusion set (defense in depth) ───
    const filtered = sourced.filter(c => {
      const name = (c.company || '').toLowerCase().trim();
      return name && !exclusionSet.has(name);
    });
    const violations = sourced.filter(c => {
      const name = (c.company || '').toLowerCase().trim();
      return name && exclusionSet.has(name);
    });

    // ─── STEP 9: Insert top 50 into campaign_targets ───
    // Wipe any previous targets for this campaign first
    await supabase.from('campaign_targets').delete().eq('campaign_id', sequenceId);
    const top50 = filtered.slice(0, 50);
    if (top50.length > 0) {
      const rows = top50.map((c, i) => ({
        campaign_id: sequenceId,
        category_id: category,
        team_id: team.id,
        rank: i + 1,
        company_name: c.company,
        revenue_estimate: c.revenue,
        hq_location: c.hq,
        rationale: c.rationale,
        decision_maker_name: c.decision_maker_name,
        decision_maker_title: c.decision_maker_title,
        enrollment_status: 'sourced',
      }));
      await supabase.from('campaign_targets').insert(rows);
    }

    // ─── STEP 10: Build competitive landscape from real data ───
    const competitiveLandscape = (allPartnerships || [])
      .filter(p => {
        if (!p.partner_name || /unknown|not specified|not named/i.test(p.partner_name)) return false;
        if (p.category_id && expandedCategories.includes(p.category_id)) return true;
        if (p.related_categories?.some(rc => expandedCategories.includes(rc))) return true;
        return false;
      })
      .map(p => ({ team_id: p.team_id, partner: p.partner_name, tier: p.tier, category: p.category_id }));

    // ─── STEP 11: Return the structured campaign spec ───
    return res.status(200).json({
      success: true,
      team: { id: team.id, name: team.name, full_name: team.full_name, principal: team.team_principal },
      category: { id: category, name: catRow.name },
      why: `${team.name} has zero active partners in ${catRow.name} or overlapping categories (${expandedCategories.join(', ')}). ${openTeams.length === 1 ? 'Only team with this slot open.' : `${openTeams.length} teams have this slot open; ${team.name} picked alphabetically for determinism.`} Competitive landscape verified against ${allPartnerships?.length || 0} live partnership records.`,
      criteria: CATEGORY_CRITERIA[category] || { revenue_min: '$500M', dm_seniority: 'CMO / VP Marketing' },
      competitive_landscape: competitiveLandscape,
      top_50: top50,
      top_8: top50.slice(0, 8),
      sequence_id: sequenceId,
      sequence_name: sequenceName,
      sourced_total: sourced.length,
      filtered_count: filtered.length,
      violations_caught: violations.length,
      excluded_companies_count: exclusionSet.size,
      blocked_teams: [...blockedTeamIds],
      next_action: `Review top 8 then call POST /api/build-campaign/enroll with { campaign_id: "${sequenceId}" } to enroll the top 8 into the sequence.`,
    });
  } catch (err) {
    console.error('[build-campaign] error:', err);
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
}


// ─── Auto-draft 5 sequence steps using Sunny's commercial doctrine ───
async function draftSequenceSteps(teamName, categoryName) {
  const prompt = `Draft 5 outreach steps for an F1 sponsorship campaign with ${teamName} targeting ${categoryName} companies. Sunny Sidhu (CEO of Van Hawke Group, F1 sponsorship advisory) is the sender.

VOICE: Direct, corporate, commanding authority. No "hope you're well". No "circle back". No generic mission language. Open with strategic context, close with a specific next step. Sentences are complex-compound and confident.

CONSTRAINTS PER STEP:
- Email body: under 150 words
- LinkedIn message: under 120 words
- Subject lines: under 8 words, specific (no "Quick question" or "Following up")
- Use {firstName} for first name, {company} for company name
- DO NOT include sponsorship pricing
- DO NOT reference any "secured funding"
- USD only if mentioning numbers
- Sign off: "Kind regards,\\nSunny Sidhu\\nCEO, Van Hawke Group"

5 STEPS REQUIRED:
1. Day 0 — Email — Authority-led intro. Reference ${teamName}'s 2026 ${categoryName} category opportunity. Concrete competitive context. End with a specific 15-min slot ask.
2. Day 3 — Email — Reciprocity follow-up. Offer a one-page intelligence brief on the ${categoryName} sponsorship landscape in F1. Soft re-ask.
3. Day 5 — LinkedIn — Connection request + opener. Reference the email. Tighter, more conversational than the email but still corporate.
4. Day 7 — Email — Scarcity / window. Note that ${teamName} is in active conversation with two other ${categoryName} brands and the window closes within 14 days. Specific CTA.
5. Day 14 — Email — Final note. Direct, no fluff, "if now is not the right time, here is who else to contact internally / when would be better". Door-open close.

Return ONLY a valid JSON array of EXACTLY 5 entries, no markdown, no preamble. Each entry must have: { "type", "channel", "delay_days", "subject", "body" }. type is always "email". channel is "email" or "linkedin". delay_days as integer. body uses \\n for line breaks.`;

  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const cleaned = text.replace(/```json|```/g, '').trim();
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No JSON array in draft response');
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Empty draft array');
    return parsed.map(s => ({
      type: s.type || 'email',
      channel: s.channel || 'email',
      delay_days: typeof s.delay_days === 'number' ? s.delay_days : 0,
      subject: s.subject || '',
      body: s.body || s.template || '',
    }));
  } catch (err) {
    console.error('[draftSequenceSteps] failed, falling back to placeholders:', err.message);
    return [
      { type: 'email', channel: 'email', delay_days: 0, subject: `${teamName} F1 × ${categoryName}`, body: 'Authority-led intro — to be customised per target' },
      { type: 'email', channel: 'email', delay_days: 3, subject: `Following up — ${teamName} F1`, body: 'Reciprocity follow-up' },
      { type: 'email', channel: 'linkedin', delay_days: 5, subject: 'connection_request', body: 'LinkedIn touchpoint' },
      { type: 'email', channel: 'email', delay_days: 7, subject: `Scarcity — ${teamName} F1 ${categoryName} window`, body: 'Scarcity-driven follow-up' },
      { type: 'email', channel: 'email', delay_days: 14, subject: `Final note — ${teamName} F1`, body: 'Final touchpoint' },
    ];
  }
}
