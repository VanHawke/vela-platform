// api/generate-sequence.js — Strategic sequence generation engine
// Kiko acts as the expert: she reasons about sector, company type, team positioning,
// buyer psychology, and channel orchestration to create the optimal outreach sequence.
// LinkedIn and email run in PARALLEL — LinkedIn reinforces email, never replaces it.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from './kiko-tools.js';

export const config = { maxDuration: 60 };
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { category, team, persona, numSteps } = req.body;
  if (!category) return res.status(400).json({ error: 'category required' });

  const teamName = team || 'Haas F1 Team';
  const targetPersona = persona || `C-suite at $500M-$5B ${category} companies`;
  const steps = numSteps || 7;
  const categoryClean = category.replace(/\//g, ' ').replace(/\s+/g, ' ').trim();

  try {
    const [races, partnerships, styleArr] = await Promise.all([
      sbFetch('race_calendar?date=gte.' + new Date().toISOString().split('T')[0] + '&series=eq.F1&order=date&limit=6').catch(() => []),
      sbFetch(`partnerships?team=ilike.*${encodeURIComponent(teamName.split(' ')[0])}*&limit=20`).catch(() => []),
      sbFetch(`kiko_email_style_reference?order=step_number&limit=6`).catch(() => []),
    ]);
    const raceArr = Array.isArray(races) ? races : [];
    const partArr = Array.isArray(partnerships) ? partnerships : [];
    const styles = Array.isArray(styleArr) ? styleArr : [];
    const nextRace = raceArr[0];
    const existingSponsors = partArr.map(p => p.company || p.partner_name).filter(Boolean).slice(0, 5);
    const styleExamples = styles.slice(0, 3).map(e => `[${e.category} Step ${e.step_number}]\nSubject: ${e.subject}\n${e.body}`).join('\n---\n');

    const prompt = `You are the world's leading B2B sponsorship sales strategist. You have deep expertise in:
- C-suite psychology and decision-making patterns
- Multi-channel outreach orchestration (email + LinkedIn working together)
- Formula One partnership structuring and category exclusivity
- Authority-led positioning (you represent the platform, not a vendor)
- Persuasion science: authority, scarcity, social proof, loss aversion, commitment/consistency

Your task: Design a ${steps}-touchpoint outreach sequence for the "${categoryClean}" sector targeting ${targetPersona} for ${teamName}.

═══ STRATEGIC CONTEXT ═══

Team: ${teamName}
Category: ${categoryClean}
Target: ${targetPersona}
Next race: ${nextRace ? `${nextRace.name} on ${nextRace.date}` : 'TBC'}
Existing sponsors in category: ${existingSponsors.length ? existingSponsors.join(', ') : 'Category is currently OPEN — this is a key selling point'}
Contract value range: $3M — $40M annually (category-exclusive institutional partnerships)

This is NOT a marketing conversation. At $3M-$40M, the decision sits with the CEO, the board, or the chairman. You are writing as a principal at a tier-1 advisory firm structuring a strategic asset allocation. The prospect isn't buying media impressions — they're securing governance rights, category exclusivity, and institutional positioning within the most watched sport on earth.

═══ CHANNEL ORCHESTRATION RULES ═══

EMAIL is the primary channel. Every sequence is email-first and email-led.
LINKEDIN is a supporting channel that REINFORCES email — it never replaces it.

How they work together:
- Email carries the substance: the strategic argument, the operational detail, the proposition
- LinkedIn carries the relationship signal: the personal touch, the human connection, the urgency
- A LinkedIn message 1-2 days AFTER an email creates a "surround sound" effect — the prospect sees you in their inbox AND their LinkedIn
- A LinkedIn message should REFERENCE the email: "Sent you a note on [topic] — worth a look"
- Timing gaps between channels: LinkedIn 1-2 days after the preceding email, next email 2-3 days after LinkedIn

Example orchestration pattern:
Day 0: Email 1 (authority opener)
Day 1: LinkedIn connection request (with personalised note referencing Email 1)
Day 4: Email 2 (different angle, deeper)
Day 6: LinkedIn message IF connected (reference Email 2, add personal layer)
Day 9: Email 3 (scarcity, calendar-driven)
Day 11: LinkedIn message IF connected (short, urgent, "category closing")
Day 14: Email 4 (strategic withdrawal — final note)

Note: LinkedIn messages are conditional on connection being accepted. If not connected, the email sequence continues uninterrupted. The emails do NOT change based on LinkedIn status — they stand alone as a complete sequence.

═══ SECTOR-SPECIFIC STRATEGY ═══

Think about WHY a ${categoryClean} company would want an F1 partnership:
- What operational dependency does F1 have on ${categoryClean}? (data, logistics, engineering, compliance, communications?)
- What does ${teamName} specifically need from this sector?
- What business outcome does the CMO/CRO of a ${categoryClean} company care about?
- How does F1 credibility translate to their sales pipeline?

Use these insights to craft messaging that speaks to THEIR strategic priorities, not ours.

═══ VOICE & LANGUAGE (NON-NEGOTIABLE) ═══

Every email:
- Opens with "Dear {firstName}," — nothing else
- Closes with "Kind regards,\\n\\n{signature}"
- 50-125 words maximum
- Complete sentences, short paragraphs (2-3 sentences each)
- Reads like a senior advisor writing to a board member

Every LinkedIn message:
- Maximum 300 characters
- Casual but professional — not a mini-email
- References the preceding email specifically

BANNED: dashes (—), bullet points, "I hope this finds you well", "I wanted to reach out",
"leveraging", "synergies", "exciting opportunity", "game-changing", "I think", "I believe",
questions in subject lines, exclamation marks

REQUIRED language anchors (use naturally, not forced):
"principal level", "category-exclusive", "closed bundle", "governance", "institutional credibility",
"operating dependency", "category control", "scarcity by design", "board-level platform"

${styleExamples ? `═══ REAL VAN HAWKE EMAIL EXAMPLES (match this tone) ═══\n${styleExamples}\n═══ END EXAMPLES ═══` : ''}

═══ PSYCHOLOGY PER TOUCHPOINT ═══

Each touchpoint MUST use a distinct psychological lever. Not variations of the same email.

1. AUTHORITY + CURIOSITY: Establish position, explain operational relevance, strategic question
2. SOCIAL SIGNAL: LinkedIn connection — shows you're a real person at a real firm
3. OPERATIONAL DEPTH: How ${categoryClean} is actually used inside an F1 team (engineering, simulation, compliance, logistics). Make them see the genuine dependency.
4. RELATIONSHIP LAYER: LinkedIn message referencing the email — adds warmth to authority
5. SCARCITY + CALENDAR: Real race dates, category closing, limited slots
6. URGENCY REINFORCEMENT: LinkedIn short message — "worth a conversation before [race]"
7. STRATEGIC WITHDRAWAL: Respectful final note, protect their option, leave door open

═══ OUTPUT FORMAT ═══

Return ONLY a valid JSON array. No markdown, no backticks, no explanation.

Each step is one of:
- Email: {"step":N,"delay_days":D,"channel":"email","approach":"[psychology]","subject":"...","template":"Dear {firstName},\\n\\n[body max 125 words]\\n\\nKind regards,\\n\\n{signature}"}
- LinkedIn invite: {"step":N,"delay_days":D,"channel":"linkedin","action":"invite","template":"[personalised note, max 300 chars]"}
- LinkedIn message: {"step":N,"delay_days":D,"channel":"linkedin","action":"message","condition":"connection_accepted","template":"[message, max 300 chars]"}

LinkedIn messages with "condition":"connection_accepted" are automatically skipped if the prospect hasn't accepted. The email sequence continues regardless.

All ${steps} steps should be top-level in the array. No nested branches. The sequence sender handles conditions automatically.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 6000,
      messages: [{ role: 'user', content: prompt }]
    });
    const text = response.content[0]?.text?.trim();
    let generatedSteps;
    try {
      const cleaned = text.replace(/```json|```/g, '').trim();
      generatedSteps = JSON.parse(cleaned);
    } catch {
      return res.status(500).json({ error: 'Failed to parse sequence', raw: text?.slice(0, 500) });
    }

    // Normalize: ensure step numbers are sequential
    generatedSteps = generatedSteps.map((s, i) => ({ ...s, step: i + 1 }));

    // Create the sequence in the database
    const seqName = `${teamName.replace(' Team', '')} - ${categoryClean}`;
    const created = await sbFetch('kiko_sequences', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        name: seqName,
        description: `${steps}-touchpoint ${categoryClean} outreach for ${teamName}. Email-led, LinkedIn-reinforced. Authority → Operational depth → Scarcity → Withdrawal.`,
        target_persona: targetPersona,
        steps: generatedSteps,
        is_active: false,
      })
    });
    const seqId = Array.isArray(created) ? created[0]?.id : created?.id;

    return res.json({ ok: true, sequence: { name: seqName, target_persona: targetPersona, steps: generatedSteps }, id: seqId });
  } catch (err) {
    console.error('[GenerateSequence]', err.message);
    return res.json({ ok: false, error: err.message });
  }
}
