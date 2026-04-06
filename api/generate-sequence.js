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
    // Pull real context: race calendar, existing partnerships, identity
    const [races, partnerships, identity] = await Promise.all([
      sbFetch('race_calendar?date=gte.' + new Date().toISOString().split('T')[0] + '&series=eq.F1&order=date&limit=6').catch(() => []),
      sbFetch(`partnerships?team=ilike.*${encodeURIComponent(teamName.split(' ')[0])}*&limit=20`).catch(() => []),
      sbFetch('kiko_identity?category=in.(communication_style,strategic_position)&limit=10').catch(() => []),
    ]);
    const raceArr = Array.isArray(races) ? races : [];
    const partArr = Array.isArray(partnerships) ? partnerships : [];
    const idArr = Array.isArray(identity) ? identity : [];

    const nextRace = raceArr[0];
    const existingSponsors = partArr.map(p => p.company).filter(Boolean).slice(0, 5);
    const styleRules = idArr.map(i => i.content).join('\n');

    const prompt = `You are Kiko, the commercial intelligence AI for Van Hawke Group. Generate a ${steps}-step outreach sequence for the ${category} partnership category with ${teamName}.

CONTEXT:
- Target persona: ${targetPersona}
- Category: ${category} (exclusive tier-1 position)
- Team: ${teamName}
- Next race: ${nextRace ? `${nextRace.name} on ${nextRace.date} (${Math.ceil((new Date(nextRace.date) - new Date()) / 86400000)} days)` : 'TBC'}
- Existing ${category} sponsors in F1: ${existingSponsors.length ? existingSponsors.join(', ') : 'research needed'}
- Van Hawke communication style: ${styleRules || 'Authority-led, 2 paragraphs max, specific time ask, no filler'}

RULES:
- Emails: 2 paragraphs max. No "I hope this finds you well". No generic filler. End with specific time ask.
- Tone: Board-level, commanding authority. "At this level", "In practice", "Where organisations engage".
- Use {firstName}, {companyName}, {category}, {revenue}, {ceo}, {recentNews}, {raceWindow}, {prevSubject} as template variables.
- Step progression must follow Cialdini psychology: reciprocity → social proof → scarcity → liking → strategic withdrawal
- Mix channels: primarily email, with 1 LinkedIn touch (typically step 4)
- LinkedIn messages: max 300 characters, personal tone
- Sign off style: no sign-off, no name (added automatically)
- All financials in USD

Return ONLY valid JSON array, no markdown, no backticks:
[
  {"step":1,"delay_days":0,"channel":"email","approach":"authority-led","psychology":"reciprocity","subject":"subject line with {variables}","template":"email body with {variables}"},
  ...
]`;

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
      body: JSON.stringify({ name: seqName, description: `AI-generated ${steps}-step ${category} outreach for ${teamName}`, target_persona: targetPersona, steps: generatedSteps, is_active: true })
    });
    const seqId = Array.isArray(created) ? created[0]?.id : created?.id;

    return res.status(200).json({ ok: true, sequence: { name: seqName, target_persona: targetPersona, steps: generatedSteps }, id: seqId });
  } catch (err) {
    console.error('[GenerateSequence]', err.message, err.stack);
    return res.status(200).json({ ok: false, error: err.message });
  }
}
