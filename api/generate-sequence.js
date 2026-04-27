// api/generate-sequence.js — Research-backed sequence generation engine
// Enterprise partnerships ($3M-$40M): 12-16 touchpoints over 30-45 days
// Based on B2B research: 80% of sales need 5+ follow-ups, 70% of replies come on later touches
// Enterprise cadences need 12-18 touchpoints (Tendril, DevCommX, Growleads 2025-2026 research)
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from './kiko-tools.js';

export const config = { maxDuration: 90 };
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { category, team, persona, senderName: sn } = req.body;
  if (!category) return res.status(400).json({ error: 'category required' });

  const teamName = team || 'Haas F1 Team';
  const targetPersona = persona || `CEO / CMO at ${category} companies`;
  const categoryClean = category.replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
  const senderName = sn || 'Matt';

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
    const race2 = raceArr[1];
    const existingSponsors = partArr.map(p => p.company || p.partner_name).filter(Boolean).slice(0, 5);
    const styleExamples = styles.slice(0, 3).map(e => `[${e.category} Step ${e.step_number}]\nSubject: ${e.subject}\n${e.body}`).join('\n---\n');

    const prompt = `You are the world's leading B2B enterprise partnership strategist with deep expertise in:
- C-suite sales psychology and decision-making at board level
- Multi-channel outreach orchestration across email and LinkedIn
- Formula One commercial structuring and category exclusivity
- Sales copywriting that converts at enterprise level ($3M-$40M deals)
- Sector-specific business intelligence and competitive dynamics

═══ PHASE 1: THINK BEFORE YOU WRITE ═══

Before writing a single word, you MUST reason through these questions. Your answers shape every email and message.

SECTOR ANALYSIS for "${categoryClean}":
1. What does a ${categoryClean} company actually DO? Who are their customers? What problem do they solve?
2. Why would a ${categoryClean} CEO or board allocate $3M-$40M to an F1 partnership? What strategic outcome justifies that spend? (Enterprise credibility, competitive displacement, board-level positioning, institutional trust)
3. What is the SPECIFIC operational dependency ${teamName} has on ${categoryClean}? (Every F1 team has genuine operational needs — find the REAL dependency)
4. Who are the top 5-10 companies in the ${categoryClean} space? What stage are they at? What does their competitive landscape look like?
5. What is the TRUST BARRIER in this sector? How does F1 institutional credibility directly address that barrier?
6. What macro trends are driving this sector RIGHT NOW? (Regulatory changes, AI disruption, consolidation, IPO market, M&A activity?)
7. What would a competitor gaining this F1 category position mean for other ${categoryClean} companies?

BUYER PSYCHOLOGY:
8. The decision-maker receives 200+ outreach emails per week. What makes them stop scrolling? (Something about THEIR business they didn't expect you to know)
9. What is the emotional journey across 14 touchpoints? (Curiosity, Recognition, Respect, Trust, Urgency, Decision)
10. What specific LANGUAGE does a ${categoryClean} CEO use? What frameworks do they think in? (TAM/SAM, ARR, NRR, enterprise pipeline, competitive displacement)

Use your answers to shape every single touchpoint. If an email doesn't reflect genuine sector intelligence, rewrite it.

═══ PHASE 2: BUILD THE SEQUENCE ═══

Design a 14-touchpoint outreach sequence for "${categoryClean}" targeting ${targetPersona} for ${teamName}.

═══ RESEARCH-BACKED CADENCE STRUCTURE ═══

This is based on real B2B outreach research (Tendril, Growleads, DevCommX, Sendspark, Kondo 2025-2026):

PROVEN DATA:
- Enterprise deals (>$50K) need 12-18 touchpoints over 6-12 weeks
- At $3M-$40M per partnership, this is ultra-enterprise. 14 minimum touchpoints.
- 80% of sales need 5+ follow-ups. 70% of replies come on LATER touches (steps 5-10).
- Multi-channel (3+ channels) doubles engagement vs single-channel
- Email: 60-70% of touchpoints. LinkedIn: 20-30%. These run IN PARALLEL.
- Spacing: 2-3 business days between touches. Total cadence: 30-45 days.
- Breakup emails consistently get the HIGHEST reply rates in any sequence
- Tuesday-Thursday are optimal send days. 9-11am local time.
- Reps who use LinkedIn are 51% more likely to hit quota

OPTIMAL TIMING PATTERN (research-backed):
Day 0: Email 1 (authority opener)
Day 1: LinkedIn connection request
Day 3: Email 2 (operational depth)
Day 5: LinkedIn message IF connected (different angle from emails, add value)
Day 7: Email 3 (value-add: industry insight or data point)
Day 10: LinkedIn message IF connected (reference emails)
Day 12: Email 4 (case study / social proof from F1)
Day 15: LinkedIn message IF connected (short, direct)
Day 18: Email 5 (scarcity + race calendar urgency)
Day 21: LinkedIn message IF connected (final LinkedIn touch)
Day 25: Email 6 (strategic repositioning: different angle entirely)
Day 30: Email 7 (breakup email: respectful close, protect their option)
Day 35: LinkedIn message IF connected (soft re-engagement, reference time passed)
Day 42: Email 8 (resurrection: "circumstances may have changed")

═══ NARRATIVE ARC (THE MOST IMPORTANT SECTION) ═══

This is a STORY told across 14 touchpoints. Each touch ADVANCES the narrative. NEVER repeat a point already made.

THE ARC:
Email 1: OPEN THE DOOR. State one compelling fact they didn't know. The category exists, it's operational, it's exclusive. ONE idea only.
Email 2: DEEPEN. Go inside the F1 team. Show the real operational dependency. Make them think "I didn't realise F1 needed ${categoryClean} that deeply."
Email 3: PIVOT TO THEM. Stop talking about F1. Talk about THEIR market. What trend in ${categoryClean} makes this relevant RIGHT NOW? GC procurement trust? Enterprise pipeline credibility? IPO narrative?
Email 4: PROVE IT. Reference how comparable partnerships work. Not vague. Specific structure: what the partner gets, how it translates to pipeline.
Email 5: CREATE URGENCY. Race calendar. Activation windows. Time-bound, factual, not aggressive.
Email 6: CHALLENGE. What happens if a competitor takes this? Not a threat. A genuine strategic question.
Email 7: CLOSE WITH RESPECT. Breakup. Protect their option. This gets the highest reply rate because it removes pressure.
Email 8: RESURRECT. 2 weeks later. Brief. Circumstances change. Door is open.

LinkedIn messages must ADD something the emails don't. A personal observation, a question, a different angle. They are NOT summaries of the email.

CRITICAL: If email 3 makes the same point as email 1, you have failed. Each touch must give the reader a NEW reason to engage. Read all 14 back-to-back before finalising. If any two say the same thing, rewrite one.

═══ WHAT EACH TOUCHPOINT MUST ACHIEVE ═══

Every single touch must ADD VALUE. Never "just checking in." Never "following up on my last email."

Touch 1 (Email): AUTHORITY. Establish who you are. State the category is open. Explain WHY this category matters operationally for F1. End with a strategic question, not a pitch.
Touch 2 (LinkedIn invite): SOCIAL SIGNAL. Personalised note. Reference the email. No pitch. Human connection.
Touch 3 (Email): OPERATIONAL DEPTH. How does ${categoryClean} actually operate inside an F1 team? Contract management, compliance, data pipelines, simulation, logistics. Make them see the real dependency.
Touch 4 (LinkedIn message IF connected): VALUE-ADD. Share a brief relevant insight. "Saw [specific thing]. The category structure might interest you." Short, warm, adds value.
Touch 5 (Email): VALUE-ADD. Share a genuine insight. A data point about F1 commercial growth, or a trend in their sector. Position yourself as someone who THINKS about their market, not just sells to it.
Touch 6 (LinkedIn message IF connected): RELATIONSHIP. Short, warm. Reference a specific email. "Sent you a note on [topic]. The [specific angle] is worth a look."
Touch 7 (Email): SOCIAL PROOF. What have comparable partnerships looked like? Reference other F1 partnerships (without naming competitors for THIS category). Show the institutional credibility framework.
Touch 8 (LinkedIn message IF connected): DIRECT. "The category structure is being finalised. Worth 20 minutes before it closes."
Touch 9 (Email): SCARCITY + CALENDAR. ${nextRace ? `${nextRace.name} is coming up on ${nextRace.date}.` : 'Next race is approaching.'} Activation windows are structured around the race calendar. Category closes.
Touch 10 (LinkedIn message IF connected): URGENCY. Short. "Category decision moving. Wanted to flag it directly."
Touch 11 (Email): REPOSITIONING. Come at it from a COMPLETELY different angle. If previous emails focused on credibility, this one focuses on competitive threat. If a competitor takes this slot, what does that mean for them?
Touch 12 (Email): BREAKUP. This is NOT aggressive or threatening. It IS respectful and final. "This will be my last note. The position remains open. If circumstances change, the conversation is available." This email consistently gets the HIGHEST reply rate.
Touch 13 (LinkedIn message IF connected): RE-ENGAGEMENT. Soft, brief. "Some time has passed. The category has evolved. Worth a quick look if relevant." No pressure.
Touch 14 (Email): RESURRECTION (35-42 days later). Brief. "Circumstances may have changed since we last corresponded. The category position has evolved. If this is now relevant, I can outline the current structure."

═══ CONTRACT SCALE ═══

$3M-$40M annually per category-exclusive partnership. This is institutional strategic positioning, NOT marketing spend. The decision sits with the CEO, the board, or the chairman. Write like a principal at a tier-1 advisory firm structuring a strategic asset allocation.

═══ SECTOR-SPECIFIC INTELLIGENCE ═══

Before writing, THINK about:
- Why would a ${categoryClean} company want an F1 partnership? What is their strategic motivation beyond brand awareness?
- What operational dependency does ${teamName} have on ${categoryClean}? (Every F1 team has real operational needs: data, logistics, legal, engineering, communications, compliance, cybersecurity)
- What business outcome does the CEO/CMO of a ${categoryClean} company care about? Enterprise trust? Market credibility? Displacement of competitors?
- How does F1 credibility specifically translate into their sales pipeline or board-level positioning?

USE THESE INSIGHTS to make every email sector-specific. Do NOT write generic sponsorship emails.

═══ VOICE RULES (NON-NEGOTIABLE) ═══

Every email:
- Opens with "Dear {firstName}," ONLY
- Closes with "Kind regards,\\n\\n{signature}" ONLY
- 50-100 words MAXIMUM. Every word earns its place.
- Complete sentences. Short paragraphs (2-3 sentences each).
- Reads like correspondence from a senior advisor to a board member.

Every LinkedIn message (all messages, NOT connection invites):
- ALWAYS starts with "Hi {firstName}," — every single one, no exceptions
- ALWAYS ends with "Best, ${senderName}" — every single one
- 300 characters maximum INCLUDING greeting and sign-off
- Written like a REAL person typing a LinkedIn DM. Conversational. Warm. Human.
- NOT a summary of the preceding email. A different angle, a personal thought, a genuine observation.
- Each one should feel like ${senderName} personally typed it on his phone

LinkedIn connection invites:
- 200 characters maximum (LinkedIn platform limit)
- No greeting needed (LinkedIn shows sender name automatically)
- Brief, genuine, no pitch

WHAT GOOD LINKEDIN MESSAGES LOOK LIKE:
"Hi {firstName}, sent you a note on the legal AI category at Alpine. The GC procurement trust angle is the bit I think matters most for where you are right now. Worth 10 mins? Best, ${senderName}"

WHAT BAD LINKEDIN MESSAGES LOOK LIKE (NEVER):
"The category structure is being finalised. Worth 20 minutes." — no greeting, no sign-off, robotic
"Sent you a note on the enterprise trust dynamic." — reads like an automated notification


ABSOLUTELY BANNED (in ALL channels):
- Em dashes or en dashes. Use commas or full stops.
- Bullet points or lists of any kind
- "I hope this finds you well" / "I wanted to reach out" / "I am reaching out" / "I'm writing to"
- "Leveraging" / "synergies" / "exciting opportunity" / "game-changing"
- "I think" / "I believe" / "maybe" / "hopefully"
- "I will not continue to follow up" or any threatening language
- "Reply within the hour" or any aggressive time-boxing
- "I have 15 minutes" or any arrogant availability claims
- "Just checking in" / "Following up on my last email" / "Bumping this"
- Exclamation marks. Questions in subject lines. Subject lines with em dashes.
- Subject line format: "${teamName.replace(' Team', '')} x ${categoryClean}" or "${teamName.replace(' Team', '')} x ${categoryClean}: [angle]"

REQUIRED language anchors (use naturally across the sequence, not all in one email):
"principal level", "category-exclusive", "closed bundle", "governance", "institutional credibility",
"operating dependency", "category control", "scarcity by design", "board-level platform"

═══ CONTEXT ═══
Team: ${teamName}
Target: ${targetPersona}
Next race: ${nextRace ? `${nextRace.name} (${nextRace.date})` : 'TBC'}
Second race: ${race2 ? `${race2.name} (${race2.date})` : 'TBC'}
Existing sponsors: ${existingSponsors.length ? existingSponsors.join(', ') : 'Category is currently OPEN'}

${styleExamples ? `═══ REAL VAN HAWKE EMAIL EXAMPLES (match this tone) ═══\\n${styleExamples}\\n═══ END EXAMPLES ═══` : ''}

═══ OUTPUT FORMAT ═══

Return ONLY a valid JSON array of 14 objects. No markdown, no backticks, no explanation.

Email: {"step":N,"delay_days":D,"channel":"email","approach":"[psychology]","subject":"...","template":"Dear {firstName},\\n\\n[body 50-100 words]\\n\\nKind regards,\\n\\n{signature}"}
LinkedIn invite: {"step":N,"delay_days":D,"channel":"linkedin","action":"invite","template":"[personalised note, max 300 chars, NO dashes]"}
LinkedIn message: {"step":N,"delay_days":D,"channel":"linkedin","action":"message","condition":"connection_accepted","template":"Hi {firstName}, [conversational message]. Best, ${senderName}"}


All 14 steps must be top-level in the array. LinkedIn messages with condition:"connection_accepted" are auto-skipped if not connected.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 8000,
      system: 'You are a JSON API. You MUST respond with ONLY a valid JSON array. No explanation, no thinking, no markdown, no backticks, no preamble. Just the raw JSON array starting with [ and ending with ]. Do your reasoning internally but output ONLY JSON.',
      messages: [{ role: 'user', content: prompt }]
    });
    const text = response.content[0]?.text?.trim();
    let generatedSteps;
    try {
      const cleaned = text.replace(/```json|```/g, '').trim();
      generatedSteps = JSON.parse(cleaned);
    } catch {
      // Fallback: extract JSON array from response if Claude added preamble
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        try { generatedSteps = JSON.parse(match[0]); } catch {}
      }
      if (!generatedSteps) return res.status(500).json({ error: 'Failed to parse sequence', raw: text?.slice(0, 500) });
    }

    // Normalize step numbers
    generatedSteps = generatedSteps.map((s, i) => ({ ...s, step: i + 1 }));
    
    // Post-process: strip dashes and enforce LinkedIn format
    for (const step of generatedSteps) {
      if (step.subject) step.subject = step.subject.replace(/\s*[\u2014\u2013]\s*/g, ': ').replace(/\s+/g, ' ').trim();
      if (step.template) {
        // Replace em/en dashes with commas
        step.template = step.template.replace(/[\u2014\u2013]/g, ',');
        
        // Enforce LinkedIn message format: greeting + sign-off
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

    // Create the sequence in the database
    const seqName = `${teamName.replace(' Team', '')} - ${categoryClean}`;
    const created = await sbFetch('kiko_sequences', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        name: seqName,
        description: `14-touchpoint ${categoryClean} outreach for ${teamName}. Research-backed: 8 emails + 6 LinkedIn over 42 days. $3M-$40M institutional partnerships.`,
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
