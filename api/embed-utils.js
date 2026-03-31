// api/embed-utils.js — OpenAI embedding generation for semantic search
import { sbFetch } from './kiko-tools.js';

const OPENAI_KEY = () => process.env.OPENAI_KEY;

/**
 * Generate embedding for a text string using OpenAI text-embedding-3-small
 * @param {string} text - Text to embed (max ~8000 tokens)
 * @returns {number[]} 1536-dimension embedding vector
 */
export async function generateEmbedding(text) {
  if (!text || !OPENAI_KEY()) return null;
  // Truncate to ~6000 chars to stay within token limits
  const truncated = text.slice(0, 6000);
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: truncated,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI embedding error: ${res.status}`);
  const data = await res.json();
  return data.data?.[0]?.embedding || null;
}

/**
 * Summarise a conversation's messages into a searchable text block
 */
export function summariseConversation(messages, title = '') {
  if (!messages?.length) return title || '';
  // Extract user and assistant messages, trim each
  const parts = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `${m.role}: ${(m.content || '').slice(0, 500)}`)
    .slice(0, 20); // Cap at 20 messages
  return `${title ? title + '. ' : ''}${parts.join(' | ')}`.slice(0, 5000);
}

/**
 * Embed a single conversation and upsert to conversation_embeddings
 */
export async function embedConversation(convId, source, title, messages, userId) {
  try {
    const summary = summariseConversation(messages, title);
    if (!summary || summary.length < 20) return null;
    const embedding = await generateEmbedding(summary);
    if (!embedding) return null;
    // Upsert — delete existing then insert
    await sbFetch(`conversation_embeddings?conversation_id=eq.${convId}&source=eq.${source}`, { method: 'DELETE' });
    await sbFetch('conversation_embeddings', {
      method: 'POST',
      body: JSON.stringify({
        conversation_id: convId, source, title: (title || '').slice(0, 200),
        summary: summary.slice(0, 2000), embedding: JSON.stringify(embedding),
        user_id: userId || null,
      }),
    });
    return true;
  } catch (e) {
    console.error(`[embed] Failed for ${convId}:`, e.message);
    return false;
  }
}

/**
 * Semantic search across conversation embeddings
 * @param {string} query - Natural language search query
 * @param {number} limit - Max results
 * @param {string} userId - Filter by user
 * @returns {Array} Matching conversations with similarity scores
 */
export async function semanticSearchConversations(query, limit = 5, userId = null) {
  const embedding = await generateEmbedding(query);
  if (!embedding) return [];
  
  const SB = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SK = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  
  const res = await fetch(`${SB()}/rest/v1/rpc/search_conversations_semantic`, {
    method: 'POST',
    headers: {
      apikey: SK(), Authorization: `Bearer ${SK()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query_embedding: JSON.stringify(embedding),
      match_threshold: 0.25,
      match_count: limit,
      filter_user_id: userId || null,
    }),
  });
  
  if (!res.ok) {
    console.error('[semantic-search] RPC error:', res.status, await res.text());
    return [];
  }
  return await res.json();
}
