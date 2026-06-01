// api/memory-import.js — Import conversation history from Claude/ChatGPT into Kiko's memory
// Accepts JSON exports, processes via Opus, extracts key knowledge and adds to memory
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { data, source, email } = req.body || {};
  const userId = email === 'sunny@vanhawke.agency' || email === 'sunny@vanhawke.com' ? '9f486437-4bf5-4111-abfe-fe19bfa76063' : null;
  // data = raw conversation export (JSON string or array)
  // source = 'claude' or 'chatgpt'
  if (!data) return res.status(400).json({ error: 'data field required (conversation export JSON)' });

  try {
    // Parse the raw data
    let conversations = [];
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;

    if (source === 'chatgpt' && Array.isArray(parsed)) {
      // ChatGPT export format: array of conversations with mapping of message nodes
      for (const conv of parsed.slice(0, 50)) {
        const msgs = [];
        if (conv.mapping) {
          for (const node of Object.values(conv.mapping)) {
            const msg = node.message;
            if (msg?.content?.parts?.length) {
              msgs.push({ role: msg.author?.role || 'user', content: msg.content.parts.join('\n') });
            }
          }
        }
        if (msgs.length > 0) conversations.push({ title: conv.title || 'Untitled', messages: msgs });
      }
    } else if (source === 'claude' && Array.isArray(parsed)) {
      // Claude export format
      for (const conv of parsed.slice(0, 50)) {
        conversations.push({ title: conv.name || conv.title || 'Untitled', messages: conv.chat_messages || conv.messages || [] });
      }
    } else if (Array.isArray(parsed)) {
      conversations = parsed.slice(0, 50);
    }

    if (conversations.length === 0) return res.json({ error: 'No conversations found in export', processed: 0 });

    // Process each conversation through Opus to extract knowledge
    let processed = 0;
    const insights = [];

    for (const conv of conversations) {
      const preview = conv.messages?.slice(0, 20).map(m =>
        `${m.role || 'user'}: ${(m.content || '').toString().slice(0, 300)}`
      ).join('\n') || '';

      if (preview.length < 50) continue;

      const extraction = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001', max_tokens: 500,
        messages: [{ role: 'user', content: `Extract the KEY KNOWLEDGE from this conversation that would be useful for a business AI assistant managing F1 sponsorship deals, campaigns, and executive operations. Focus on: decisions made, preferences expressed, strategies discussed, contacts mentioned, and any business rules established.\n\nConversation: "${conv.title}"\n${preview.slice(0, 4000)}\n\nReturn JSON: { "summary": "...", "decisions": ["..."], "preferences": ["..."], "contacts": ["..."], "business_rules": ["..."], "domain": "general|strategy|campaign|crm|personal" }` }]
      });

      const raw = (extraction.content[0]?.text || '{}').replace(/```json|```/g, '').trim();
      let parsed_result = {};
      try { parsed_result = JSON.parse(raw); } catch { parsed_result = { summary: raw }; }

      if (parsed_result.summary && parsed_result.summary.length > 20) {
        // Store in kiko_knowledge
        await supabase.from('kiko_knowledge').insert({
          domain: `imported-${source || 'unknown'}-${parsed_result.domain || 'general'}`,
          user_id: userId,
          content: `[Imported from ${source || 'unknown'}] ${conv.title}\n\n${parsed_result.summary}\n\nDecisions: ${(parsed_result.decisions || []).join('; ')}\nPreferences: ${(parsed_result.preferences || []).join('; ')}\nContacts: ${(parsed_result.contacts || []).join('; ')}`,
          source: `${source || 'unknown'}-import`,
          researched_at: new Date().toISOString(),
        });
        processed++;
        insights.push({ title: conv.title, domain: parsed_result.domain, decisions: (parsed_result.decisions || []).length });
      }
    }

    // Also append a summary to KIKO_MEMORY.md
    if (processed > 0) {
      const memPath = path.join(process.cwd(), 'api/data/KIKO_MEMORY.md');
      const memory = fs.readFileSync(memPath, 'utf-8');
      const importNote = `\n\n## IMPORTED KNOWLEDGE (${source || 'unknown'}, ${new Date().toISOString().split('T')[0]})\n- ${processed} conversations processed from ${source}\n- Key topics: ${insights.map(i => i.title).slice(0, 5).join(', ')}\n`;
      fs.writeFileSync(memPath, memory + importNote);
    }

    res.json({ processed, total: conversations.length, insights: insights.slice(0, 10) });
  } catch (err) {
    console.error('[memory-import] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
