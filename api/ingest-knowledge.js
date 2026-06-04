// api/ingest-knowledge.js — Knowledge source ingestion
// Fetches URLs, extracts key information, stores in kiko_knowledge_sources
// Can be called on-demand or by a cron
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, logError } from './kiko-tools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

async function fetchAndExtract(source) {
  try {
    // Fetch URL content
    const response = await fetch(source.url, {
      headers: { 'User-Agent': 'KikoOS/1.0 (Van Hawke Group Intelligence)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return { error: `HTTP ${response.status}` };
    const html = await response.text();

    // Strip HTML to text (basic)
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000); // Max for Haiku context

    if (text.length < 100) return { error: 'Page content too short' };

    // Extract intelligence via Haiku
    const res = await anthropic.messages.create({
      model: 'claude-opus-4-8' // OPUS — knowledge ingestion shapes understanding, max_tokens: 600,
      system: `Extract business intelligence from this web page for Van Hawke Group (F1 sponsorship advisory + luxury eyewear). Category: ${source.category}. Return ONLY valid JSON: { "summary": "2-3 sentence summary", "key_facts": ["max 8 specific facts — numbers, names, dates"], "entities": ["company/person names"], "relevance": 1-10 (to F1 sponsorship / luxury brand / Van Hawke business), "actionable_insights": ["things Van Hawke could act on"] }`,
      messages: [{ role: 'user', content: `Source: ${source.name} (${source.url})\n\n${text}` }],
    });
    const raw = (res.content[0]?.text || '{}').replace(/```json|```/g, '').trim();
    const extracted = JSON.parse(raw);
    return { ...extracted, text_length: text.length };
  } catch (e) { return { error: e.message }; }
}

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      // On-demand: add + ingest a new source
      const { name, url, category, type, content } = req.body;
      if (!name) return res.status(400).json({ error: 'name required' });

      // If content provided (white paper, document), store directly
      if (content) {
        const extracted = await anthropic.messages.create({
          model: 'claude-opus-4-8' // OPUS — knowledge ingestion shapes understanding, max_tokens: 600,
          system: `Extract intelligence from this document for Van Hawke Group. Return JSON: { "summary": "...", "key_facts": ["..."], "entities": ["..."], "relevance": 1-10, "actionable_insights": ["..."] }`,
          messages: [{ role: 'user', content: `Document: ${name}\n\n${content.slice(0, 8000)}` }],
        });
        const parsed = JSON.parse((extracted.content[0]?.text || '{}').replace(/```json|```/g, '').trim());
        await sbFetch('kiko_knowledge_sources', {
          method: 'POST', body: JSON.stringify({
            name, type: type || 'document', category: category || 'general',
            content: content.slice(0, 50000), summary: parsed.summary,
            key_facts: parsed.key_facts || [], entities_mentioned: parsed.entities || [],
            relevance_score: parsed.relevance || 5, last_scraped_at: new Date().toISOString(),
          })
        });
        return res.status(200).json({ ok: true, name, insights: parsed });
      }

      // URL source — fetch and extract
      if (url) {
        const source = { name, url, category: category || 'general' };
        const result = await fetchAndExtract(source);
        if (result.error) return res.status(200).json({ ok: false, error: result.error });
        await sbFetch('kiko_knowledge_sources', {
          method: 'POST', body: JSON.stringify({
            name, type: type || 'url', category: category || 'general', url,
            summary: result.summary, key_facts: result.key_facts || [],
            entities_mentioned: result.entities || [],
            relevance_score: result.relevance || 5,
            last_scraped_at: new Date().toISOString(),
          })
        });
        // Also write high-relevance facts to learning log
        if (result.relevance >= 7) {
          for (const fact of (result.key_facts || []).slice(0, 3)) {
            await sbFetch('kiko_learning_log', {
              method: 'POST', body: JSON.stringify({
                user_id: '9f486437-4bf5-4111-abfe-fe19bfa76063',
                category: 'knowledge_source', content: `[${name}] ${fact}`,
                entity_name: (result.entities || [])[0] || name,
              })
            });
          }
        }
        return res.status(200).json({ ok: true, name, insights: result });
      }
      return res.status(400).json({ error: 'Provide url or content' });
    }

    // GET: batch re-scrape sources due for refresh
    const freqMap = { daily: 1, weekly: 7, monthly: 30 };
    const sources = await sbFetch('kiko_knowledge_sources?active=eq.true&type=eq.url&order=last_scraped_at.asc.nullsfirst&limit=10&select=*');
    let refreshed = 0;
    for (const source of (sources || [])) {
      const freq = freqMap[source.scrape_frequency] || 7;
      const stale = !source.last_scraped_at || (Date.now() - new Date(source.last_scraped_at)) > freq * 86400000;
      if (!stale) continue;
      const result = await fetchAndExtract(source);
      if (result.error) continue;
      await sbFetch(`kiko_knowledge_sources?id=eq.${source.id}`, {
        method: 'PATCH', body: JSON.stringify({
          summary: result.summary, key_facts: result.key_facts || [],
          entities_mentioned: result.entities || [],
          relevance_score: result.relevance || source.relevance_score,
          last_scraped_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        })
      });
      refreshed++;
    }
    return res.status(200).json({ ok: true, refreshed, total_sources: (sources || []).length });
  } catch (err) {
    await logError('ingest-knowledge', err.message);
    return res.status(500).json({ error: err.message });
  }
}
