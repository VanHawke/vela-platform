// backfill-embeddings.cjs — Session 71: embed all imported conversations (one-off)
// Gives Phase-1 semantic search full coverage of the ChatGPT+Claude archive.
(async () => {
  const { sbFetch } = await import('./api/kiko-tools.js');
  const { embedConversation } = await import('./api/embed-utils.js');
  let from = 0, done = 0, errs = 0;
  while (true) {
    const rows = await sbFetch(`kiko_imported_conversations?select=id,source,title,messages,user_id&order=original_date.asc&limit=40&offset=${from}`);
    if (!rows || !rows.length) break;
    for (const c of rows) {
      try {
        // imported messages are {role,text}; embed pipeline expects {role,content}
        const msgs = (c.messages || []).map(m => ({ role: m.role, content: m.text || m.content || '' }));
        await embedConversation(c.id, c.source || 'imported', c.title || 'Untitled', msgs, c.user_id);
        done++;
        if (done % 25 === 0) console.log(`[backfill] ${done} embedded`);
      } catch (e) { errs++; console.error(`[backfill] ${c.id} ERR: ${e.message}`); }
      await new Promise(r => setTimeout(r, 150));
    }
    from += 40;
  }
  console.log(`[backfill] COMPLETE — ${done} embedded, ${errs} errors`);
  process.exit(0);
})().catch(e => { console.error('[backfill] FATAL:', e.message); process.exit(1); });
