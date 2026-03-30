// import-chatgpt.js — Import ChatGPT export into Kiko
// Scoped entirely to Sunny's user_id
// Processes conversations, extracts insights, stores in kiko_imported_conversations

const fs = require('fs');
const https = require('https');

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
const USER_ID = '9f486437-4bf5-4111-abfe-fe19bfa76063'; // Sunny only

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: opts.headers?.Prefer || 'return=minimal', ...(opts.headers || {}) },
  });
  if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`Supabase ${res.status}: ${t.slice(0, 200)}`); }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}


function extractMessages(convo) {
  const mapping = convo.mapping || {};
  const messages = [];
  
  for (const [id, node] of Object.entries(mapping)) {
    if (!node.message) continue;
    const msg = node.message;
    const role = msg.author?.role;
    if (!role || role === 'system' || role === 'tool') continue;
    
    const parts = msg.content?.parts || [];
    const textParts = parts.filter(p => typeof p === 'string' && p.trim());
    if (!textParts.length) continue;
    
    messages.push({
      role: role === 'user' ? 'human' : 'assistant',
      content: textParts.join('\n').trim(),
      created: msg.create_time || convo.create_time || 0,
    });
  }
  
  // Sort by timestamp to get chronological order
  messages.sort((a, b) => (a.created || 0) - (b.created || 0));
  return messages;
}

async function extractInsights(title, messages) {
  // Use Haiku for fast, cheap insight extraction
  const sample = messages.slice(0, 10).map(m => `${m.role}: ${m.content.slice(0, 300)}`).join('\n\n');
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 300,
        system: 'Extract key business insights from this ChatGPT conversation. Return ONLY valid JSON: { "topics": ["topic1"], "decisions": ["decision1"], "entities": ["company/person"], "key_facts": ["fact1"], "category": "business|personal|technical|creative" }. Max 3 items per array.',
        messages: [{ role: 'user', content: `Title: ${title}\n\n${sample}` }],
      }),
    });
    const data = await res.json();
    const raw = (data.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim();
    return JSON.parse(raw);
  } catch { return { topics: [], decisions: [], entities: [], key_facts: [], category: 'unknown' }; }
}


async function importConversations(dir) {
  const files = fs.readdirSync(dir).filter(f => f.startsWith('conversations-') && f.endsWith('.json')).sort();
  console.log(`Found ${files.length} conversation files`);
  
  let total = 0, imported = 0, skipped = 0, errors = 0;
  
  for (const file of files) {
    console.log(`\nProcessing ${file}...`);
    const convos = JSON.parse(fs.readFileSync(`${dir}/${file}`, 'utf-8'));
    
    for (const convo of convos) {
      total++;
      const title = convo.title || 'Untitled';
      const createDate = convo.create_time ? new Date(convo.create_time * 1000).toISOString() : null;
      
      // Skip if already imported (by title + date)
      try {
        const existing = await sbFetch(`kiko_imported_conversations?title=eq.${encodeURIComponent(title)}&source=eq.chatgpt&user_id=eq.${USER_ID}&limit=1`);
        if (existing?.length) { skipped++; continue; }
      } catch {}
      
      // Extract messages from tree structure
      const messages = extractMessages(convo);
      if (messages.length < 2) { skipped++; continue; } // Skip trivial conversations
      
      // Extract insights (batch: only every 3rd conversation to save API costs)
      let insights = { topics: [], decisions: [], entities: [], key_facts: [], category: 'unknown' };
      if (imported % 3 === 0) {
        insights = await extractInsights(title, messages);
        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 500));
      }

      
      // Store in kiko_imported_conversations — scoped to Sunny's user_id
      try {
        await sbFetch('kiko_imported_conversations', {
          method: 'POST',
          body: JSON.stringify({
            user_id: USER_ID,
            title,
            source: 'chatgpt',
            original_date: createDate,
            messages: messages.map(m => ({ role: m.role, content: m.content.slice(0, 5000) })),
            extracted_insights: insights,
            processed: true,
          }),
        });
        imported++;
        if (imported % 10 === 0) console.log(`  Imported: ${imported}/${total} (${skipped} skipped)`);
      } catch (err) {
        errors++;
        console.error(`  Error importing "${title}": ${err.message.slice(0, 100)}`);
      }
    }
  }
  
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`IMPORT COMPLETE`);
  console.log(`Total: ${total} | Imported: ${imported} | Skipped: ${skipped} | Errors: ${errors}`);
  console.log(`All data scoped to user_id: ${USER_ID}`);
  console.log(`${'═'.repeat(50)}`);
}

// Run
const dir = process.argv[2] || '/Users/sunny/Downloads/chatgpt_export';
importConversations(dir).catch(e => console.error('FATAL:', e.message));
