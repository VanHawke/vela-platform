// api/generate-sequence.js — Multi-step campaign intelligence engine
// 4-phase chain: RESEARCH → PLAN → WRITE → REVIEW
// Each phase builds on the previous. Kiko reasons, not templates.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from './kiko-tools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const MODEL = 'claude-sonnet-4-6';

async function callClaude(system, prompt, maxTokens = 4000) {
  const r = await anthropic.messages.create({
    model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }]
  });
  return r.content[0]?.text?.trim() || '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { category, team, persona, senderName: sn } = req.body;
  if (!category) return res.status(400).json({ error: 'category required' });

  const teamName = team || 'Haas F1 Team';
  const targetPersona = persona || `CEO / CMO at ${category} companies`;
  const categoryClean = category.replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
  const senderName = sn || 'Matt';

  try {
    // Load context data
    const [partnerships, styleArr] = await Promise.all([
      sbFetch(`partnerships?team=ilike.*${encodeURIComponent(teamName.split(' ')[0])}*&limit=20`).catch(() => []),
      sbFetch(`kiko_email_style_reference?order=step_number&limit=10`).catch(() => []),
    ]);
    const existingSponsors = (Array.isArray(partnerships) ? partnerships : []).map(p => p.company || p.partner_name).filter(Boolean).slice(0, 5);
    const styleExamples = (Array.isArray(styleArr) ? styleArr : []).map(e => `[${e.category} Step ${e.step_number}] ${e.approach || ''}\nSubject: ${e.subject}\n${e.body}`).join('\n---\n');

    console.log(`[gen-seq] Starting 4-phase generation for ${categoryClean} @ ${teamName}`);

    // ═══════════════════════════════════════════════════════════
    // PHASE 1: RESEARCH — Understand the sector deeply
    // ═══════════════════════════════════════════════════════════
    console.log('[gen-seq] Phase 1: Research');
    const research = await callClaude(
      'You are a senior commercial strategist specialising in enterprise technology partnerships within Formula One. You research sectors deeply before any outreach is written.',
      `Research the "${categoryClean}" sector for a Formula One partnership campaign targeting ${targetPersona} for ${teamName}.

Answer each question thoroughly. Your research will be used to write a 14-touchpoint outreach sequence. Be specific, not generic.

1. SECTOR OVERVIEW: What do ${categoryClean} companies actually do? Who are their customers? What problem do they solve? Name 5-10 real companies in this space and their competitive positions (funding stage, revenue scale, market position).

2. F1 OPERATIONAL DEPENDENCY: What specific operational functions inside ${teamName} require ${categoryClean}? Think about: contracts, compliance, data, logistics, engineering, communications, IP protection, regulatory, partner management. Be granular — how does this technology actually get used inside a race team?

3. BUYER PSYCHOLOGY: A CEO or board member at a ${categoryClean} company receives 200+ emails per week. What would make them stop and read? What do they care about right now? What language do they use internally? (TAM, ARR, NRR, enterprise pipeline, competitive displacement, regulatory risk, IPO narrative, Series B/C positioning)

4. TRUST BARRIER: What is the primary reason enterprise buyers hesitate to adopt ${categoryClean} solutions? How does institutional credibility from an F1 partnership directly address that barrier?

5. MACRO TRENDS: What is happening in this sector RIGHT NOW? Regulatory changes, AI disruption, M&A activity, market consolidation, new entrants, funding environment?

6. THE PADDOCK VALUE: When GCs, CLOs, board members, and sovereign wealth fund principals gather in the F1 paddock across 24 weekends, how specifically does a ${categoryClean} company benefit from being the defined authority in that environment?

7. COMPETITIVE THREAT: If a competing ${categoryClean} company secures this category-exclusive F1 position, what does that mean strategically for other companies in the space?

Provide detailed, specific answers. This research shapes every word of the campaign.`,
      3000
    );

    // ═══════════════════════════════════════════════════════════
    // PHASE 2: PLAN — Design the narrative arc
    // ═══════════════════════════════════════════════════════════
    console.log('[gen-seq] Phase 2: Plan');
    const plan = await callClaude(
      'You are a campaign strategist designing a multi-million dollar outreach sequence. You plan the narrative arc before any content is written. Every touchpoint must drive toward ONE objective: getting the prospect on the phone.',
      `Based on this sector research, plan the narrative arc for a 14-touchpoint sequence (8 emails + 6 LinkedIn) targeting ${targetPersona} for ${teamName} in the ${categoryClean} category.

SECTOR RESEARCH:
${research}

THE SINGLE OBJECTIVE: Every touchpoint exists to get the prospect on the phone. Not to educate. Not to impress. To create enough curiosity and relevance that they reply or agree to a 20-minute call.

NARRATIVE ARC FRAMEWORK (8 emails):
1. OPEN THE DOOR — one compelling fact about why this category matters operationally for F1
2. DEEPEN — inside the team, the real operational dependency (use the research above)
3. THE PADDOCK — the concentrated decision-making environment (GCs, CLOs, board members in one room)
4. TANGIBLE ASSETS — what the partner actually GETS (leadership access, hospitality, driver time, co-branded content)
5. THEIR MARKET — stop talking about F1, talk about THEIR sector (use macro trends from research)
6. SCARCITY + COMPETITIVE THREAT — category closing, what if a competitor takes it (use competitive threat research)
7. BREAKUP — respectful, protects their option
8. RESURRECTION — circumstances change, door open

For each of the 8 emails, write:
- The SPECIFIC angle for this sector (not generic — use your research)
- The ONE insight that makes a CEO stop scrolling
- How this email connects to the previous one (the narrative thread)
- The call-to-action (always: get on a call)

For each of the 6 LinkedIn messages:
- What does this ADD that the emails don't?
- Is this a personal observation, a question, or a different angle?

Do NOT write the actual emails yet. Just plan the arc. Be specific to ${categoryClean} — if these plans could apply to any sector, they're too generic.`,
      2000
    );

    // ═══════════════════════════════════════════════════════════
    // PHASE 3: WRITE — Generate all 14 touchpoints
    // ═══════════════════════════════════════════════════════════
    console.log('[gen-seq] Phase 3: Write');
    const writeResult = await callClaude(
      'You are a JSON API. Respond with ONLY a valid JSON array. No explanation, no thinking, no markdown, no backticks. Just the raw JSON array starting with [ and ending with ].',
      `Using the research and plan below, write all 14 touchpoints for a ${categoryClean} campaign targeting ${targetPersona} for ${teamName}.

SECTOR RESEARCH:
${research}

NARRATIVE ARC PLAN:
${plan}

${styleExamples ? `REAL VAN HAWKE EMAIL EXAMPLES (match this tone and voice):\n${styleExamples}\n` : ''}

EXISTING PARTNERS: ${existingSponsors.length ? existingSponsors.join(', ') : 'Category is currently OPEN'}

VOICE RULES (NON-NEGOTIABLE):
- Every email opens with "Dear {firstName}," and closes with "Kind regards,\\n\\n{signature}"
- Every LinkedIn message starts with "Hi {firstName}," and ends with "Best, ${senderName}"
- Emails: 50-120 words. LinkedIn messages: max 300 chars. LinkedIn invites: max 200 chars.
- NO em dashes or en dashes. Use commas or full stops.
- NO "I hope this finds you well" / "I wanted to reach out" / "Just checking in" / "Following up"
- NO bullet points, no lists, no exclamation marks
- Write like a principal at a tier-1 advisory firm. Every word earns its place.
- Subject format: "${teamName.replace(' Team', '')} x ${categoryClean}" or "${teamName.replace(' Team', '')}: [angle]"
- Do NOT reference a specific Grand Prix by name. Scarcity comes from category structure, not a race date.

TIMING PATTERN:
Day 0: Email 1 | Day 1: LinkedIn invite | Day 3: Email 2 | Day 5: LinkedIn msg | Day 7: Email 3 | Day 10: LinkedIn msg | Day 12: Email 4 | Day 15: LinkedIn msg | Day 18: Email 5 | Day 21: LinkedIn msg | Day 25: Email 6 | Day 30: Email 7 | Day 35: LinkedIn msg | Day 42: Email 8

OUTPUT FORMAT — return ONLY this JSON array:
Email: {"step":N,"delay_days":D,"channel":"email","approach":"[what this email achieves]","subject":"...","template":"Dear {firstName},\\n\\n[body]\\n\\nKind regards,\\n\\n{signature}"}
LinkedIn invite: {"step":N,"delay_days":D,"channel":"linkedin","action":"invite","template":"[note, max 200 chars]"}
LinkedIn message: {"step":N,"delay_days":D,"channel":"linkedin","action":"message","condition":"connection_accepted","template":"Hi {firstName}, [message]. Best, ${senderName}"}`,
      6000
    );

    // Parse the written sequence
    let generatedSteps;
    try {
      const cleaned = writeResult.replace(/```json|```/g, '').trim();
      generatedSteps = JSON.parse(cleaned);
    } catch {
      const match = writeResult.match(/\[[\s\S]*\]/);
      if (match) { try { generatedSteps = JSON.parse(match[0]); } catch {} }
      if (!generatedSteps) return res.status(500).json({ error: 'Failed to parse sequence from Phase 3', raw: writeResult?.slice(0, 500) });
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 4: REVIEW — Quality check and fix issues
    // ═══════════════════════════════════════════════════════════
    console.log('[gen-seq] Phase 4: Review');
    
    // Build a readable version for the reviewer
    const readableSeq = generatedSteps.map(s => {
      const ch = s.channel === 'email' ? 'EMAIL' : `LINKEDIN:${s.action}`;
      return `Step ${s.step} (Day ${s.delay_days}) [${ch}]\nSubject: ${s.subject || 'n/a'}\n${s.template}\n`;
    }).join('\n---\n');

    const reviewResult = await callClaude(
      'You are a JSON API. You review outreach sequences and fix problems. Respond with ONLY a valid JSON array of the corrected 14 steps. No explanation.',
      `Review this 14-touchpoint sequence for quality. Fix any issues and return the corrected JSON array.

THE SEQUENCE TO REVIEW:
${readableSeq}

CHECK FOR AND FIX:
1. REPETITION: Do any two emails make the same point? If yes, rewrite one with a genuinely different angle.
2. NARRATIVE FLOW: Does each email build on the previous? Does the story advance? If not, restructure.
3. DASHES: Remove ALL em dashes and en dashes. Replace with commas or full stops.
4. GENERIC CONTENT: Does every email contain sector-specific insight? Replace anything that could apply to any industry.
5. LINKEDIN QUALITY: Do LinkedIn messages ADD something the emails don't? Are they conversational? Do they all start with "Hi {firstName}," and end with "Best, ${senderName}"?
6. OBJECTIVE: Does every touchpoint drive toward getting the prospect on the phone? If an email just states facts without creating curiosity or a reason to respond, rewrite it.
7. WORD COUNT: Emails should be 50-120 words. If over, cut. If under, the content may be too thin.
8. BANNED PHRASES: Remove "I wanted to reach out", "Just checking in", "Following up", "I hope this finds you well", "I believe", "I think", exclamation marks.
9. GREETING/SIGNOFF: Every email starts "Dear {firstName}," and ends "Kind regards,\\n\\n{signature}". Every LinkedIn message starts "Hi {firstName}," and ends "Best, ${senderName}".
10. NO GRAND PRIX REFERENCES: Remove any specific race name. Scarcity comes from category structure.

Return the CORRECTED JSON array of all 14 steps. Same format as input. Fix problems, keep what works.`,
      6000
    );

    // Parse reviewed sequence
    try {
      const cleaned = reviewResult.replace(/```json|```/g, '').trim();
      generatedSteps = JSON.parse(cleaned);
    } catch {
      const match = reviewResult.match(/\[[\s\S]*\]/);
      if (match) { try { generatedSteps = JSON.parse(match[0]); } catch {} }
      // If review parse fails, keep the Phase 3 output (already parsed)
      console.log('[gen-seq] Phase 4 parse failed, using Phase 3 output');
    }

    // ═══════════════════════════════════════════════════════════
    // POST-PROCESS: Normalize format, cleanup, enforcement
    // ═══════════════════════════════════════════════════════════
    generatedSteps = generatedSteps.map((s, i) => {
      // Normalize format variations from review phase
      const channel = (s.channel || '').toLowerCase().includes('linkedin') ? 'linkedin' : (s.channel || 'email').toLowerCase();
      const template = s.template || s.body || '';
      const delay_days = s.delay_days ?? s.day ?? 0;
      let action = s.action || null;
      if (channel === 'linkedin' && !action) {
        const ch = (s.channel || '').toLowerCase();
        if (ch.includes('invite') || ch.includes('invitation')) action = 'invite';
        else if (ch.includes('message') || ch.includes('chat')) action = 'message';
        else action = i === 1 ? 'invite' : 'message'; // step 2 is invite by default
      }
      const step = { step: i + 1, delay_days, channel, template };
      if (s.subject && channel === 'email') step.subject = s.subject;
      if (s.approach) step.approach = s.approach;
      if (action && channel === 'linkedin') step.action = action;
      if (channel === 'linkedin' && action === 'message') step.condition = 'connection_accepted';
      return step;
    });

    for (const step of generatedSteps) {
      if (step.subject) step.subject = step.subject.replace(/\s*[\u2014\u2013]\s*/g, ': ').replace(/\s+/g, ' ').trim();
      if (step.template) {
        step.template = step.template.replace(/[\u2014\u2013]/g, ',');
        if (step.channel === 'linkedin' && step.action === 'message') {
          if (!step.template.startsWith('Hi {firstName}')) {
            step.template = 'Hi {firstName}, ' + step.template.replace(/^(Hi|Hey|Hello)\s+\{?firstName\}?,?\s*/i, '');
          }
          const senderTag = `Best, ${senderName}`;
          if (!step.template.includes('Best,') && !step.template.includes('Regards,')) {
            step.template = step.template.replace(/\.?\s*$/, '. ' + senderTag);
          }
        }
      }
    }

    // Save to database
    const seqName = `${teamName.replace(' Team', '')} - ${categoryClean}`;
    const created = await sbFetch('kiko_sequences', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        name: seqName,
        description: `14-touchpoint ${categoryClean} outreach for ${teamName}. Multi-step generation: researched → planned → written → reviewed. $3M-$40M institutional partnerships.`,
        target_persona: targetPersona,
        steps: generatedSteps,
        is_active: false,
      })
    });
    const seqId = Array.isArray(created) ? created[0]?.id : created?.id;

    console.log(`[gen-seq] Complete: ${seqName} — ${generatedSteps.length} steps, 4 phases`);
    return res.json({ ok: true, sequence: { name: seqName, target_persona: targetPersona, steps: generatedSteps }, id: seqId, phases: { research: research.length, plan: plan.length, written: writeResult.length, reviewed: reviewResult.length } });
  } catch (err) {
    console.error('[gen-seq] Error:', err.message);
    return res.json({ ok: false, error: err.message });
  }
}
