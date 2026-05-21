// api/cron-profile-synthesis.js — User Profile Synthesis (multi-user)
// Runs weekly. Pulls last 50 sent emails from Gmail, analyses via Sonnet.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, cronHeartbeat } from './kiko-tools.js';
import { getActiveUsers, getGoogleToken } from './cron-utils.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });


async function extractSentEmails(token, maxEmails = 50) {
  // Fetch sent emails
  const searchRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in:sent&maxResults=${maxEmails}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const searchData = await searchRes.json();
  const ids = (searchData.messages || []).map(m => m.id);
  if (!ids.length) return [];

  function extractBody(payload) {
    if (!payload) return '';
    if (payload.mimeType === 'text/plain' && payload.body?.data)
      return Buffer.from(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8').trim();
    if (payload.parts) {
      const plain = payload.parts.find(p => p.mimeType === 'text/plain');
      if (plain?.body?.data) return Buffer.from(plain.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8').trim();
      for (const part of payload.parts) { const n = extractBody(part); if (n) return n; }
    }
    return '';
  }


  const samples = [];
  // Process in batches of 10 to stay within rate limits
  for (let i = 0; i < Math.min(ids.length, maxEmails); i++) {
    try {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${ids[i]}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const msg = await msgRes.json();
      const body = extractBody(msg.payload);
      if (!body || body.length < 30) continue;
      // Get recipient info
      const toHeader = (msg.payload?.headers || []).find(h => h.name?.toLowerCase() === 'to')?.value || '';
      const subjectHeader = (msg.payload?.headers || []).find(h => h.name?.toLowerCase() === 'subject')?.value || '';
      // Clean: remove quoted replies, signatures
      const clean = body.split('\n')
        .filter(l => !l.trim().startsWith('>') && !l.match(/^On .+ wrote:$/) && !l.match(/^-{2,}/) && !l.match(/^Sent from/))
        .join('\n').trim().slice(0, 500);
      if (clean.length > 30) {
        samples.push({ body: clean, to: toHeader.slice(0, 60), subject: subjectHeader.slice(0, 80) });
      }
    } catch {}
  }
  return samples;
}


export default async function handler(req, res) {
  try {
    const __hbStart = Date.now();
    const __hbId = await cronHeartbeat('cron-profile-synthesis', 'started');
    const users = await getActiveUsers();
    const results = [];
    for (const user of users) {
    try {
    const USER_ID = user.user_id;
    const token = await getGoogleToken(user.email);
    if (!token) { results.push({ user: user.email, ok: false }); continue; }

    const samples = await extractSentEmails(token, 50);
    if (samples.length < 5) {
      return res.status(200).json({ ok: true, message: `Only ${samples.length} emails — need at least 5`, profiles: 0 });
    }

    // Format emails for analysis (keep under 15K tokens)
    const emailText = samples.slice(0, 40).map((s, i) =>
      `[EMAIL ${i+1}] To: ${s.to} | Subject: ${s.subject}\n${s.body}`
    ).join('\n\n---\n\n');

    // Phase 16: Pull edit deltas for style refinement
    let deltaContext = '';
    try {
      const deltas = await sbFetch('kiko_draft_tracking?status=eq.accepted_modified&order=created_at.desc&limit=10&select=original_content,sent_content,edit_delta');
      const safe = Array.isArray(deltas) ? deltas : [];
      if (safe.length) {
        deltaContext = '\n\n---\n\nSTYLE CORRECTIONS (edits the user made to AI-drafted emails — these reveal implicit preferences):\n';
        for (const d of safe.slice(0, 5)) {
          if (d.edit_delta?.style_lesson) deltaContext += `• ${d.edit_delta.style_lesson}\n`;
          if (d.edit_delta?.changes?.length) deltaContext += `  Changes: ${d.edit_delta.changes.slice(0, 3).join('; ')}\n`;
        }
        deltaContext += '\nIncorporate these corrections into the profile — they represent the user FIXING AI output to match their actual voice.';
      }
    } catch {}

    // Analyse via Sonnet — 6 dimensions
    const analysis = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: `You analyse a person's sent emails to build a comprehensive communication profile. Return ONLY valid JSON with these exact keys:

{
  "communication_style": {
    "formality": "formal|semi-formal|casual",
    "directness": "very-direct|direct|balanced|diplomatic|indirect",
    "avg_length": "brief|medium|detailed",
    "opening_pattern": "description of how they typically open emails",
    "closing_pattern": "description of how they typically close emails",
    "question_ratio": "high|medium|low — how often they ask questions vs state",
    "action_orientation": "high|medium|low — how often they request specific actions"
  },
  "psychological_profile": {
    "decision_speed": "fast|measured|deliberate",
    "risk_tolerance": "high|moderate|low",
    "conflict_approach": "direct-confrontation|firm-diplomatic|avoidant",
    "certainty_language": "high|medium|low — how often they use definitive vs hedging language",
    "authority_posture": "commanding|collaborative|deferential"
  },
  "tone_contexts": [
    { "context": "description of recipient type", "tone": "how tone shifts for this type" }
  ],
  "language_fingerprint": {
    "signature_phrases": ["phrases they use repeatedly"],
    "avoided_phrases": ["phrases they never use or actively avoid"],
    "vocabulary_level": "sophisticated|professional|conversational",
    "sentence_structure": "short-punchy|varied|complex-compound"
  },
  "behavioral_patterns": {
    "urgency_signals": "how they signal urgency",
    "delegation_style": "direct-assignment|request-based|collaborative",
    "follow_up_pattern": "how they follow up on unanswered items"
  },
  "draft_instructions": "A 3-4 sentence instruction for an AI writing as this person. Capture their voice precisely. E.g. 'Write with authority and directness. Open with the key point, not pleasantries. Use short paragraphs. Close with a specific next step, never open-ended.'"
}`,
      messages: [{ role: 'user', content: `Analyse these ${samples.length} sent emails and build a communication profile:\n\n${emailText}${deltaContext}` }],
    });


    const rawText = analysis.content[0]?.text || '{}';
    let profile = {};
    try {
      profile = JSON.parse(rawText.replace(/```json|```/g, '').trim());
    } catch {
      return res.status(200).json({ ok: true, message: 'Analysis ran but parse failed', raw: rawText.slice(0, 300) });
    }

    // Upsert to kiko_user_profiles
    const existing = await sbFetch(`kiko_user_profiles?user_id=eq.${USER_ID}&limit=1`);
    const isArray = Array.isArray(existing);
    const currentVersion = (isArray && existing[0]?.version) || 0;

    const profileData = {
      user_id: USER_ID,
      communication_style: profile.communication_style || {},
      psychological_profile: profile.psychological_profile || {},
      tone_contexts: profile.tone_contexts || {},
      language_fingerprint: profile.language_fingerprint || {},
      behavioral_patterns: profile.behavioral_patterns || {},
      draft_instructions: profile.draft_instructions || '',
      email_samples_analysed: samples.length,
      last_synthesised_at: new Date().toISOString(),
      version: currentVersion + 1,
    };

    if (isArray && existing.length > 0) {
      await sbFetch(`kiko_user_profiles?user_id=eq.${USER_ID}`, {
        method: 'PATCH', body: JSON.stringify(profileData)
      });
    } else {
      await sbFetch('kiko_user_profiles', {
        method: 'POST', body: JSON.stringify(profileData)
      });
    }

    results.push({ user: user.email, ok: true, emails: samples.length });
    } catch (e) { results.push({ user: user.email, ok: false, error: e.message }); }
    } // end user loop
    await cronHeartbeat('cron-profile-synthesis', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: results.length });
    return res.status(200).json({ ok: true, users: results });
  } catch (err) {
    try { await cronHeartbeat('cron-profile-synthesis', 'error', { heartbeatId: __hbId, errorMessage: err.message }); } catch {}
    return res.status(200).json({ ok: false, error: err.message });
  }
}
