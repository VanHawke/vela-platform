// api/embed-conversations.js — Backfill conversation embeddings
// GET /api/embed-conversations?action=backfill — embed all un-embedded conversations
// GET /api/embed-conversations?action=stats — show embedding stats
import { sbFetch, logError } from './kiko-tools.js';
import { embedConversation } from './embed-utils.js';

export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  const action = req.query?.action || 'stats';

  try {
    if (action === 'stats') {
      const [total, kiko, imported] = await Promise.all([
        sbFetch('conversation_embeddings?select=id&limit=9999'),
        sbFetch('conversations?select=id&archived=neq.true&limit=9999'),
        sbFetch('kiko_imported_conversations?select=id&processed=eq.true&limit=9999'),
      ]);
      return res.json({
        embedded: (total || []).length,
        kiko_convos: (kiko || []).length,
        imported_convos: (imported || []).length,
        coverage: `${(total || []).length} / ${(kiko || []).length + (imported || []).length}`,
      });
    }

    if (action === 'backfill') {
      let embedded = 0, errors = 0;

      // Get already-embedded conversation IDs
      const existing = await sbFetch('conversation_embeddings?select=conversation_id,source');
      const embeddedSet = new Set((existing || []).map(e => `${e.source}:${e.conversation_id}`));

      // Embed Kiko conversations
      const convos = await sbFetch('conversations?select=id,title,messages,user_id&archived=neq.true&order=updated_at.desc&limit=100');
      for (const c of (convos || [])) {
        if (embeddedSet.has(`kiko:${c.id}`)) continue;
        const ok = await embedConversation(c.id, 'kiko', c.title, c.messages, c.user_id);
        if (ok) embedded++; else errors++;
        // Rate limit: OpenAI embedding API
        await new Promise(r => setTimeout(r, 200));
      }

      // Embed imported conversations
      const imported = await sbFetch('kiko_imported_conversations?select=id,title,messages,user_id&processed=eq.true&order=original_date.desc&limit=500');
      for (const c of (imported || [])) {
        if (embeddedSet.has(`imported:${c.id}`)) continue;
        const ok = await embedConversation(c.id, 'imported', c.title, c.messages, c.user_id);
        if (ok) embedded++; else errors++;
        await new Promise(r => setTimeout(r, 200));
      }

      return res.json({ action: 'backfill', embedded, errors, total: (existing || []).length + embedded });
    }

    return res.status(400).json({ error: 'Invalid action. Use: stats, backfill' });
  } catch (err) {
    await logError('embed-conversations', err.message).catch(() => {});
    return res.status(500).json({ error: err.message });
  }
}
