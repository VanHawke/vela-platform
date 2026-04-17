// api/cron-knowledge-seed.js — Autonomous knowledge builder
// Kiko researches priority domains daily and saves findings to her persistent knowledge base.
// Runs on Hetzner cron, zero additional cost. Each run picks a domain rotation
// so she covers all areas across the week without overloading a single run.

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

// 15 domains — ALL researched every run. Hetzner is flat-rate, zero incremental cost.
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
  { id: 'hedge-funds-trading', topic: 'Hedge fund industry: fund structures (Cayman, Delaware, Luxembourg), prime brokerage trends, algorithmic trading regulations, high-water marks, carry structures, recent fund launches and closures, performance data, managed accounts vs commingled' },
  { id: 'kyc-aml-compliance', topic: 'KYC/AML compliance: client onboarding regulations, beneficial ownership requirements (UK PSC, US CTA), sanctions screening updates (OFAC, EU), PEP monitoring, FCA guidance on financial crime, 6th Anti-Money Laundering Directive, crypto compliance requirements' },
  { id: 'financial-regulation', topic: 'Financial regulation and compliance: FCA Consumer Duty updates, MiFID II changes, SEC enforcement actions, AIFMD updates, UCITS developments, ESG disclosure requirements (SFDR, TCFD), prudential rules for investment firms (IFPR/MIFIDPRU)' },
  { id: 'contract-disputes', topic: 'Contract law and disputes: recent High Court and Court of Appeal commercial cases, force majeure developments, limitation periods, Part 36 offers, mediation trends, arbitration (LCIA, ICC), unfair contract terms, penalty clauses' },
  { id: 'retail-consumer', topic: 'Retail and consumer law: Consumer Rights Act 2015 developments, distance selling regulations, advertising standards (ASA/CAP), consumer protection from unfair trading, product liability, online marketplace obligations, subscription trap rules' },
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Allow manual override via ?domains=gaming-esports,ai-saas or seed all with ?all=1
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const queryAll = req.query?.all === '1' || body.all;
  const queryDomains = (req.query?.domains || body.domains || '').split(',').filter(Boolean);

  let todaysDomains;
  if (queryAll) {
    todaysDomains = [...DOMAINS];
  } else if (queryDomains.length > 0) {
    todaysDomains = DOMAINS.filter(d => queryDomains.includes(d.id));
  } else {
    // Default: run ALL domains every night. Hetzner = flat rate, no per-execution cost.
    todaysDomains = [...DOMAINS];
  }

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
