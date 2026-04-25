// api/generate-sequence.js — AI-powered sequence generation
// Takes category + team + persona → returns fully formed 7-step multichannel sequence
// Uses real Van Hawke email style references, race calendar, partnership context
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

  try {
    // Pull real context: race calendar, partnerships, identity, STYLE REFERENCE
    const categoryClean = category.replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
    const [races, partnerships, identity, categoryStyle, fallbackStyle] = await Promise.all([
      sbFetch('race_calendar?date=gte.' + new Date().toISOString().split('T')[0] + '&series=eq.F1&order=date&limit=6').catch(() => []),
      sbFetch(`partnerships?team=ilike.*${encodeURIComponent(teamName.split(' ')[0])}*&limit=20`).catch(() => []),
      sbFetch('kiko_identity?category=in.(communication_style,strategic_position)&limit=10').catch(() => []),
      // Load style examples for THIS category first
      sbFetch(`kiko_email_style_reference?category=ilike.*${encodeURIComponent(categoryClean.split(' ')[0])}*&order=step_number&limit=4`).catch(() => []),
      // Fallback: load best-performing style examples
      sbFetch('kiko_email_style_reference?category=in.(Cloud Computing,Cybersecurity)&order=step_number&limit=4').catch(() => []),
    ]);

    const raceArr = Array.isArray(races) ? races : [];
    const partArr = Array.isArray(partnerships) ? partnerships : [];
    const styleArr = (Array.isArray(categoryStyle) && categoryStyle.length > 0) ? categoryStyle : (Array.isArray(fallbackStyle) ? fallbackStyle : []);
    const nextRace = raceArr[0];
    const existingSponsors = partArr.map(p => p.company || p.partner_name).filter(Boolean).slice(0, 5);

    // Build style examples section
    const styleExamples = styleArr.slice(0, 4).map(e => 
      `[${e.category} Step ${e.step_number}]\nSubject: ${e.subject}\n${e.body}`
    ).join('\n\n---\n\n');

    const prompt = `Generate a ${steps}-step B2B outreach sequence for the "${categoryClean}" category with ${teamName}.

═══ REAL VAN HAWKE EMAIL EXAMPLES — MATCH THIS EXACT TONE ═══

${styleExamples || 'No category-specific examples available.'}

═══ END EXAMPLES ═══

═══ VOICE & LANGUAGE RULES (NON-NEGOTIABLE) ═══

Every email MUST:
- Start with "Dear {firstName}," — no other greeting ever
- End with "Kind regards,\n\n{signature}"
- Be 50-125 words (not one word more)
- Use complete sentences, short paragraphs (2-3 sentences per paragraph)
- Sound like a senior advisor writing to a board member, not a salesperson pitching

NEVER use:
- Dashes (—) or bullet points in email body
- "I hope this finds you well", "I wanted to reach out", "I'm writing to"
- "leveraging", "synergies", "exciting opportunity", "game-changing"
- "I think", "I believe", "maybe", "hopefully", "if possible"
- Questions in subject lines or exclamation marks anywhere

ALWAYS use these language anchors naturally:
- "principal level", "category-exclusive", "closed bundle"
- "governance, access, institutional credibility"
- "operating dependency", "category control", "scarcity by design"
- "board-level platform", "intelligent age"

═══ 5-TOUCH PSYCHOLOGY FRAMEWORK ═══

Each step MUST use a DIFFERENT psychological angle. Not variations of the same email.

Step 1 (Email): AUTHORITY + RECIPROCITY
- Establish Van Hawke's position ("We work at principal level on the structuring of Formula One partnerships")
- Explain why ${categoryClean} matters OPERATIONALLY for F1 (not brand exposure — how the team actually uses this technology in simulation, telemetry, data pipelines, factory-to-track workflows)
- Close with an open strategic question, not a pitch
- Subject: "${teamName.replace(' Team', '')} x ${categoryClean}"

Step 2 (LinkedIn): CONNECTION REQUEST
- LinkedIn connection request with personalised note (MAX 300 characters)
- Reference something specific about the prospect's company or role
- No pitch, no ask — just a reason to connect
- Format: "Hi {firstName}, [reason]. [one-line context]. Worth connecting."

Step 3 (Condition): CONNECTION CHECK
- System checks if LinkedIn connection was accepted
- YES branch → Step 5 (LinkedIn message)
- NO branch → Step 4 (email follow-up)

Step 4 (Email — NO branch): REVENUE + SOCIAL PROOF
- Deeper operational detail about how ${categoryClean} impacts the team's competitive position
- Reference what similar companies have done in F1 (if any: ${existingSponsors.length ? existingSponsors.join(', ') : 'category is currently open'})
- Mention contract value tier implicitly: "partnerships at this level typically reflect a $500K-$2M annual commitment"
- Subject: "${teamName.replace(' Team', '')} — ${categoryClean} Operating Model"

Step 5 (LinkedIn — YES branch): COMMITMENT + EXCLUSIVITY
- Short LinkedIn message (max 300 chars) referencing the email sent
- Create urgency: "Category is being formalised this quarter"
- Ask for a specific next step: "Worth a 15-minute call this week?"

Step 6 (Email): SCARCITY + RACE CALENDAR
- Reference upcoming race: ${nextRace ? `${nextRace.name} in ${Math.ceil((new Date(nextRace.date) - new Date()) / 86400000)} days` : 'next race TBC'}
- Create urgency through calendar: "Activation windows are structured around the race calendar"
- Mention remaining category availability
- Subject: "${teamName.replace(' Team', '')} — Category Availability Update"

Step 7 (Email): STRATEGIC WITHDRAWAL
- Final touch — respectful close, not desperate
- Frame it as protecting their option: "I wanted to ensure you had the opportunity to consider this before the category is committed"
- Leave the door open without begging
- Subject: "${teamName.replace(' Team', '')} x ${categoryClean} — Final Note"

═══ CONTEXT ═══
- Target persona: ${targetPersona}
- Team: ${teamName}
- Next race: ${nextRace ? `${nextRace.name} (${nextRace.date})` : 'TBC'}
- Existing ${categoryClean} sponsors in F1: ${existingSponsors.length ? existingSponsors.join(', ') : 'Limited — category is open'}

═══ OUTPUT FORMAT ═══
Return ONLY a valid JSON array. No markdown, no backticks, no explanation.

For email steps: {"step":N,"delay_days":D,"channel":"email","approach":"...","psychology":"...","subject":"...","template":"Dear {firstName},\\n\\n[body]\\n\\nKind regards,\\n\\n{signature}"}
For LinkedIn invite: {"step":N,"delay_days":D,"channel":"linkedin","action":"invite","template":"Hi {firstName}, [300 char max note]"}
For LinkedIn message: {"step":N,"delay_days":D,"channel":"linkedin","action":"message","template":"Hi {firstName}, [300 char max message]"}
For condition: {"step":N,"delay_days":D,"type":"condition","condition_type":"connection_accepted","yes_steps":[5],"no_steps":[4]}`;

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
      return res.status(500).json({ error: 'Failed to parse generated sequence', raw: text?.slice(0, 500) });
    }

    // Create the sequence in the database
    const seqName = `${teamName.replace(' Team', '')} - ${categoryClean}`;
    const created = await sbFetch('kiko_sequences', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        name: seqName,
        description: `${steps}-step authority-led ${categoryClean} outreach for ${teamName}. 5-touch psychology: authority, social proof, scarcity, commitment, strategic withdrawal.`,
        target_persona: targetPersona,
        steps: generatedSteps,
        is_active: false,
      })
    });
    const seqId = Array.isArray(created) ? created[0]?.id : created?.id;

    return res.status(200).json({ ok: true, sequence: { name: seqName, target_persona: targetPersona, steps: generatedSteps }, id: seqId });
  } catch (err) {
    console.error('[GenerateSequence]', err.message, err.stack);
    return res.status(200).json({ ok: false, error: err.message });
  }
}
