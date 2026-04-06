// api/generate-sequence.js — AI-powered sequence generation
// Takes category + team + persona → returns fully formed 5-step sequence
// with correct tone, psychology, company intelligence, race calendar awareness
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
  const steps = numSteps || 5;

  try {
    // Pull real context: race calendar, existing partnerships, identity, STYLE REFERENCE
    const [races, partnerships, identity, styleEmails] = await Promise.all([
      sbFetch('race_calendar?date=gte.' + new Date().toISOString().split('T')[0] + '&series=eq.F1&order=date&limit=6').catch(() => []),
      sbFetch(`partnerships?team=ilike.*${encodeURIComponent(teamName.split(' ')[0])}*&limit=20`).catch(() => []),
      sbFetch('kiko_identity?category=in.(communication_style,strategic_position)&limit=10').catch(() => []),
      sbFetch('kiko_email_style_reference?order=step_number&limit=6').catch(() => []),
    ]);
    const raceArr = Array.isArray(races) ? races : [];
    const partArr = Array.isArray(partnerships) ? partnerships : [];
    const idArr = Array.isArray(identity) ? identity : [];
    const styleArr = Array.isArray(styleEmails) ? styleEmails : [];

    const nextRace = raceArr[0];
    const existingSponsors = partArr.map(p => p.company).filter(Boolean).slice(0, 5);
    const styleRules = idArr.map(i => i.content).join('\n');
    const styleExamples = styleArr.slice(0, 4).map(e => `[${e.category} Step ${e.step_number}]\nSubject: ${e.subject}\n${e.body}`).join('\n\n---\n\n');

    const prompt = `Generate a ${steps}-step B2B outreach sequence for the ${category} category with ${teamName}.

REAL EMAIL EXAMPLES FROM VAN HAWKE'S ACTIVE CAMPAIGNS — match this exact tone and structure:

${styleExamples || 'No style examples available — use the style rules below.'}

--- END EXAMPLES ---

THIS IS HOW THE EMAILS MUST READ (real examples from Van Hawke's active campaigns):

EMAIL STYLE:
"Dear {firstName},

We work at principal level on the structuring of Formula One partnerships for teams and rights-holders.

Our role is not to place sponsorship assets, but to design closed, category-exclusive partnership systems tied to governance, access, and institutional credibility.

[Category-specific paragraph: explain WHY ${category} matters operationally for F1 — not brand exposure, but how the team actually uses this technology in simulation, telemetry, data pipelines, factory-to-track workflows, race strategy, etc.]

The relevant question at this stage is simply whether this is strategic from your perspective.

If it is, we can outline how the ${category} category is being approached within ${teamName.replace(' Team', '')}'s Formula One programme and assess whether a conversation is warranted.

Kind regards,

{signature}"

FOLLOW-UP EMAIL STYLE:
"Dear {firstName},

Within Formula One, ${teamName.replace(' Team', '')} operates with a lean and highly exposed technical model — privately owned, independent of OEM infrastructure, and directly accountable for the performance of its data and compute workflows.

[Deeper operational detail about how ${category} specifically impacts the team's competitive position — use technical language that shows deep understanding of both F1 operations and the ${category} space]

For organisations operating seriously in ${category}, this distinction matters.

Kind regards,

{signature}"

ABSOLUTE RULES:
- Every email MUST start with "Dear {firstName}," and end with "Kind regards,\\n\\n{signature}"
- Subject format: "${teamName.replace(' Team', '')} x ${category}" for first email, variations for follow-ups
- NO "I hope this finds you well", "I wanted to reach out", "I'm writing to", or ANY generic opener
- NO "I think", "maybe", "hopefully" — declarative authority only
- Explain why ${category} matters OPERATIONALLY for F1, not as brand exposure
- Language: "principal level", "category-exclusive", "governance, access, institutional credibility", "operating dependency"
- Each email 50-125 words (research-backed optimal length)
- LinkedIn messages max 300 characters, start with "Hi {firstName},"

CONTEXT:
- Target: ${targetPersona}
- Team: ${teamName}
- Next race: ${nextRace ? `${nextRace.name} (${Math.ceil((new Date(nextRace.date) - new Date()) / 86400000)} days)` : 'TBC'}
- Existing ${category} F1 sponsors: ${existingSponsors.length ? existingSponsors.join(', ') : 'limited — category is open'}

STRUCTURE (${steps} steps, 4 emails + 3 LinkedIn over 14 days):
Step 1: Day 0, email, authority hook + reciprocity
Step 2: Day 2, linkedin (connection request with note), liking
Step 3: Day 3, email, deeper context + social proof  
Step 4: Day 7, email, scarcity + race calendar urgency
Step 5: Day 10, linkedin (direct message), commitment
Step 6: Day 12, linkedin (engage content/comment), liking
Step 7: Day 14, email, strategic withdrawal

Return ONLY valid JSON array, no markdown, no backticks:
[{"step":1,"delay_days":0,"channel":"email","approach":"authority-led","psychology":"reciprocity","subject":"subject","template":"full email body including Dear and Kind regards"},...]`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    });
    const text = response.content[0]?.text?.trim();
    let generatedSteps;
    try {
      const cleaned = text.replace(/```json|```/g, '').trim();
      generatedSteps = JSON.parse(cleaned);
    } catch {
      return res.status(500).json({ error: 'Failed to parse generated sequence', raw: text?.slice(0, 500) });
    }

    // Create the sequence in the database
    const seqName = `${teamName.replace(' Team', '')} - ${category}`;
    const created = await sbFetch('kiko_sequences', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ name: seqName, description: `AI-generated ${steps}-step ${category} outreach for ${teamName}`, target_persona: targetPersona, steps: generatedSteps, is_active: false })
    });
    const seqId = Array.isArray(created) ? created[0]?.id : created?.id;

    return res.status(200).json({ ok: true, sequence: { name: seqName, target_persona: targetPersona, steps: generatedSteps }, id: seqId });
  } catch (err) {
    console.error('[GenerateSequence]', err.message, err.stack);
    return res.status(200).json({ ok: false, error: err.message });
  }
}
