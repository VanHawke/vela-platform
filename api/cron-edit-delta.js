// api/cron-edit-delta.js — Edit Delta Learning (Phase 16)
// Runs daily. Checks if Kiko-drafted emails were sent, compares
// original vs sent version, logs style refinement deltas.
// Feeds into profile synthesis for continuous learning.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, cronHeartbeat } from './kiko-tools.js';
import { getActiveUsers, getGoogleToken } from './cron-utils.js';

export const config = { maxDuration: 30 };
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

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


export default async function handler(req, res) {
    const __hbStart = Date.now();
    const __hbId = await cronHeartbeat('cron-edit-delta', 'started');
    try {
    // Get first active user with Google token for email checking
    const users = await getActiveUsers();
    let token = null;
    for (const u of users) { token = await getGoogleToken(u.email); if (token) break; }
    if (!token) { await cronHeartbeat('cron-edit-delta', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 }); return res.status(200).json({ ok: false, error: 'No Google token' }); }

    // Get unresolved drafts (status = 'drafted', created in last 7 days)
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const drafts = await sbFetch(`kiko_draft_tracking?status=eq.drafted&created_at=gt.${since}&order=created_at.desc&limit=20`);
    const safe = Array.isArray(drafts) ? drafts : [];
    if (!safe.length) { await cronHeartbeat('cron-edit-delta', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 }); return res.status(200).json({ ok: true, message: 'No pending drafts to check', deltas: 0 }); }

    let deltasFound = 0;
    for (const draft of safe) {
      try {
        // Search for sent email matching this draft's recipient + subject
        const q = `in:sent to:${draft.recipient}${draft.subject ? ` subject:"${draft.subject}"` : ''} newer_than:7d`;
        const searchRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=3`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const searchData = await searchRes.json();
        if (!searchData.messages?.length) continue; // Not sent yet


        // Fetch the sent email body
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${searchData.messages[0].id}?format=full`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const msg = await msgRes.json();
        const sentBody = extractBody(msg.payload);
        if (!sentBody || sentBody.length < 20) continue;

        // Clean sent body (remove signatures, quoted text)
        const cleanSent = sentBody.split('\n')
          .filter(l => !l.trim().startsWith('>') && !l.match(/^On .+ wrote:$/) && !l.match(/^-{2,}/) && !l.match(/^Sent from/))
          .join('\n').trim().slice(0, 2000);

        // Compare original vs sent — if identical, mark as accepted (no edit needed)
        const original = (draft.original_content || '').trim();
        const similarity = original.length && cleanSent.length
          ? (original === cleanSent ? 1.0 : 0.5) // Simple check; Haiku does detailed analysis
          : 0;

        if (similarity >= 0.99) {
          // Sent unmodified — mark as accepted
          await sbFetch(`kiko_draft_tracking?id=eq.${draft.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'accepted_unmodified', sent_content: cleanSent.slice(0, 2000), sent_at: new Date().toISOString() })
          });
          continue;
        }


        // Sent modified — analyse the delta via Haiku (cheap, fast)
        const deltaAnalysis = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          system: 'You compare an AI-drafted email with the human-edited version that was actually sent. Identify what the human changed and why. Return ONLY valid JSON: { "changes": ["list of specific changes"], "style_lesson": "One sentence: what this edit reveals about how the person prefers to communicate", "severity": "minor|moderate|major" }',
          messages: [{ role: 'user', content: `ORIGINAL (AI-drafted):\n${original.slice(0, 800)}\n\nSENT (human-edited):\n${cleanSent.slice(0, 800)}` }],
        });

        let delta = {};
        try {
          delta = JSON.parse((deltaAnalysis.content[0]?.text || '{}').replace(/```json|```/g, '').trim());
        } catch {}

        // Write delta back
        await sbFetch(`kiko_draft_tracking?id=eq.${draft.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'accepted_modified',
            sent_content: cleanSent.slice(0, 2000),
            edit_delta: delta,
            sent_at: new Date().toISOString()
          })
        });
        deltasFound++;
      } catch {} // Individual draft failure doesn't stop the loop
    }

    await cronHeartbeat('cron-edit-delta', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: deltasFound });
    return res.status(200).json({ ok: true, drafts_checked: safe.length, deltas: deltasFound });
  } catch (err) {
    await cronHeartbeat('cron-edit-delta', 'error', { heartbeatId: __hbId, errorMessage: err.message, durationMs: Date.now() - __hbStart }).catch(() => {});
    return res.status(200).json({ ok: false, error: err.message });
  }
}
