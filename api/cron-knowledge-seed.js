// api/cron-knowledge-seed.js — Autonomous knowledge builder
// Kiko researches priority domains daily and saves findings to her persistent knowledge base.
// Runs on Hetzner cron, zero additional cost. Each run picks a domain rotation
// so she covers all areas across the week without overloading a single run.

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 10 domains — rotated daily so each gets deep research every 2-3 days
const DOMAINS = [
  { id: 'f1-sponsorship', topic: 'F1 2026 sponsorship market: latest sponsor announcements, team budget changes, open categories, activation trends, any new deals signed this week' },
  { id: 'insolvency-bbls', topic: 'UK insolvency and Bounce Back Loan Scheme: latest MCA disputes, CDDA disqualification cases, personal guarantee enforcement, Insolvency Service actions, new case law from 2025-2026' },
  { id: 'cross-border-tax', topic: 'US-UK cross-border tax and finance: transfer pricing updates, double tax treaty changes, FATCA enforcement, offshore substance requirements, recent HMRC/IRS guidance' },
  { id: 'luxury-fashion', topic: 'Luxury eyewear and fashion licensing market: recent M&A deals, brand collaborations, cultural partnerships, eyewear market trends, any Jacques Marie Mage or Porsche Design news' },
  { id: 'gaming-esports', topic: 'Gaming and esports sponsorship: latest brand deals, team valuations, activation models, audience growth, any F1 crossover with gaming' },
  { id: 'ai-saas', topic: 'Enterprise AI and SaaS market: recent funding rounds, valuations, competitive landscape, AI agent platforms, vertical AI products launching' },
  { id: 'sports-entertainment-law', topic: 'Sports and entertainment law: recent image rights cases, athlete endorsement disputes, CAS arbitration decisions, F1 governance changes, broadcasting rights deals' },
  { id: 'uk-property', topic: 'UK property law updates: Renters Reform Act progress, Section 21 abolition timeline, commercial lease trends, EPC regulations, recent tribunal decisions' },
  { id: 'hr-employment', topic: 'UK employment law: recent tribunal decisions, settlement agreement trends, IR35 updates, unfair dismissal cases, redundancy case law, TUPE transfers' },
  { id: 'fundraising-vc', topic: 'Fundraising and venture capital: UK/US pre-seed and seed trends, EIS/SEIS changes, Reg D updates, notable term sheets, valuation multiples for AI/SaaS startups' },
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  // Pick 3 domains per run (rotated daily) — covers all 10 every ~3.3 days
  const startIdx = (dayOfYear * 3) % DOMAINS.length;
  const todaysDomains = [];
  for (let i = 0; i < 3; i++) todaysDomains.push(DOMAINS[(startIdx + i) % DOMAINS.length]);

  const results = [];
  for (const domain of todaysDomains) {
    try {
      console.log(`[knowledge-seed] Researching: ${domain.id}`);
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `You are a senior research analyst. Research the following topic and provide a structured brief with the most important, current findings. Focus on actionable intelligence — what changed recently, what matters commercially, and what to watch.\n\nTOPIC: ${domain.topic}\n\nProvide your findings in this format:\n## ${domain.id.replace(/-/g, ' ').toUpperCase()}\n**Date researched:** ${new Date().toISOString().split('T')[0]}\n\n### Key Findings\n[3-5 bullet points of the most important current developments]\n\n### Implications for Van Hawke Group\n[2-3 sentences on how this affects a sponsorship advisory/luxury eyewear/AI platform business]\n\n### Watch List\n[2-3 specific things to monitor going forward]`
        }],
      });

      const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
      if (text.length > 50) {
        // Save to knowledge base
        await supabase.from('kiko_knowledge').upsert({
          domain: domain.id,
          content: text,
          researched_at: new Date().toISOString(),
          source: 'cron-knowledge-seed',
        }, { onConflict: 'domain' });
        results.push({ domain: domain.id, status: 'saved', length: text.length });
      } else {
        results.push({ domain: domain.id, status: 'empty', length: text.length });
      }
    } catch (err) {
      console.error(`[knowledge-seed] ${domain.id} failed:`, err.message);
      results.push({ domain: domain.id, status: 'error', error: err.message });
    }
  }

  console.log('[knowledge-seed] Complete:', JSON.stringify(results));
  res.json({ researched: todaysDomains.map(d => d.id), results });
}
