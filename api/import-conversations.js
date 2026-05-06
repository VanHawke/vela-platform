// api/import-conversations.js — Import ChatGPT + Claude conversation history
// Parses exported JSON, extracts insights, stores in kiko_imported_conversations
// Then runs insight extraction to populate intelligence tables
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, logError } from './kiko-tools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const USER_ID = '9f486437-4bf5-4111-abfe-fe19bfa76063';

// ── ChatGPT format: { conversations: [{ title, messages: [{ role, content }] }] }
// ── Claude format: [{ uuid, name, chat_messages: [{ sender, text }] }]
function parseChatGPT(data) {
  const convos = [];
  const raw = Array.isArray(data) ? data : (data.conversations || data);
  for (const c of (raw || [])) {
    const messages = [];
    const mapping = c.mapping || {};
    if (Object.keys(mapping).length > 0) {
      // ChatGPT tree format — traverse the message tree
      const nodes = Object.values(mapping).filter(n => n.message?.content?.parts?.length);
      nodes.sort((a, b) => (a.message?.create_time || 0) - (b.message?.create_time || 0));
      for (const node of nodes) {
        const msg = node.message;
        const role = msg.author?.role === 'assistant' ? 'assistant' : 'user';
        const content = (msg.content?.parts || []).filter(p => typeof p === 'string').join('\n');
        if (content.trim()) messages.push({ role, content: content.slice(0, 3000) });
      }
    } else if (c.messages) {
      for (const m of c.messages) {
        if (m.content?.trim()) messages.push({ role: m.role || 'user', content: m.content.slice(0, 3000) });
      }
    }
    if (messages.length >= 2) {
      convos.push({
        source: 'chatgpt', title: c.title || 'Untitled',
        messages, original_date: c.create_time ? new Date(c.create_time * 1000).toISOString() : null,
      });
    }
  }
  return convos;
}

function parseClaude(data) {
  const convos = [];
  const raw = Array.isArray(data) ? data : [data];
  for (const c of raw) {
    const messages = [];
    const chatMsgs = c.chat_messages || c.messages || [];
    for (const m of chatMsgs) {
      const role = (m.sender === 'human' || m.role === 'user') ? 'user' : 'assistant';
      const content = m.text || m.content || '';
      if (content.trim()) messages.push({ role, content: content.slice(0, 3000) });
    }
    if (messages.length >= 2) {
      convos.push({
        source: 'claude', title: c.name || c.title || 'Untitled',
        messages, original_date: c.created_at || c.updated_at || null,
      });
    }
  }
  return convos;
}

async function extractInsights(convo) {
  try {
    const msgText = convo.messages.slice(0, 20).map(m => `[${m.role}]: ${m.content.slice(0, 300)}`).join('\n');
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 400,
      system: `Extract business intelligence from this conversation. This is from the CEO of Van Hawke Group (F1 sponsorship advisory + luxury eyewear). Return ONLY valid JSON: { "key_facts": ["max 5 facts"], "decisions": ["decisions made"], "entities": ["company/person names"], "topics": ["main topics"], "strategic_value": 1-10 }. If the conversation is casual/irrelevant, return strategic_value: 0.`,
      messages: [{ role: 'user', content: `Title: ${convo.title}\n\n${msgText}` }],
    });
    const raw = (res.content[0]?.text || '{}').replace(/```json|```/g, '').trim();
    return JSON.parse(raw);
  } catch { return { key_facts: [], decisions: [], entities: [], topics: [], strategic_value: 0 }; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const { data, source } = req.body; // source: 'chatgpt' | 'claude' | 'auto'
    if (!data) return res.status(400).json({ error: 'No data provided' });

    // Parse based on source
    let convos;
    const detectedSource = source || (data.conversations || (data[0]?.mapping) ? 'chatgpt' : 'claude');
    if (detectedSource === 'chatgpt') convos = parseChatGPT(data);
    else convos = parseClaude(data);

    if (!convos.length) return res.status(200).json({ ok: true, imported: 0, message: 'No conversations found in data' });

    let imported = 0, insightsExtracted = 0, highValue = 0;

    for (const convo of convos) {
      // Store raw conversation
      await sbFetch('kiko_imported_conversations', {
        method: 'POST', body: JSON.stringify({
          source: convo.source, title: convo.title,
          messages: convo.messages, original_date: convo.original_date,
        })
      });
      imported++;

      // Extract insights (batch — process max 50 to stay in time limit)
      if (imported <= 50) {
        const insights = await extractInsights(convo);
        if (insights.strategic_value >= 3) {
          highValue++;
          // Write to conversation insights
          await sbFetch('kiko_conversation_insights', {
            method: 'POST', body: JSON.stringify({
              user_id: USER_ID,
              key_facts: insights.key_facts || [],
              decisions_made: insights.decisions || [],
              open_threads: [], entities_discussed: insights.entities || [],
              summary: `[Imported from ${convo.source}] ${convo.title}: ${(insights.key_facts || []).join('; ').slice(0, 200)}`,
            })
          });
          // Write entities to learning log
          for (const entity of (insights.entities || []).slice(0, 3)) {
            await sbFetch('kiko_learning_log', {
              method: 'POST', body: JSON.stringify({
                user_id: USER_ID, category: 'imported_knowledge',
                content: `From ${convo.source}: ${convo.title}. Key: ${(insights.key_facts || []).slice(0, 2).join('; ')}`,
                entity_name: entity,
              })
            });
          }
          insightsExtracted++;
        }
        // Mark as processed
        await sbFetch(`kiko_imported_conversations?title=eq.${encodeURIComponent(convo.title)}&source=eq.${convo.source}`, {
          method: 'PATCH', body: JSON.stringify({
            processed: true, extracted_insights: insights,
            entities_mentioned: insights.entities || [], decisions_made: insights.decisions || [],
          })
        });
      }
    }

    return res.status(200).json({
      ok: true, imported, insights_extracted: insightsExtracted,
      high_value_conversations: highValue,
      message: `Imported ${imported} conversations from ${detectedSource}. Extracted insights from ${insightsExtracted} (${highValue} high-value).${imported > 50 ? ' Note: insights only extracted for first 50 conversations. Run /api/process-imports to process the rest.' : ''}`
    });
  } catch (err) {
    await logError('import-conversations', err.message);
    return res.status(500).json({ error: err.message });
  }
}
