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

  // ── Sports Business Intelligence (added Apr 2026) ──
  { id: 'football-sponsorship', topic: 'Football sponsorship market 2026: Premier League, La Liga, Bundesliga, Serie A, Ligue 1 — latest shirt sponsors, stadium naming rights, training kit deals, sleeve sponsors, new brand entries, deal values where reported. Also MLS expansion deals. Key focus: which categories are spending (fintech, crypto, airlines, betting), which clubs have open inventory, notable new partnerships this month' },
  { id: 'us-sports-sponsorship', topic: 'US professional sports sponsorship 2026: NFL, NBA, MLB, NHL, MLS — latest jersey patch deals, arena naming rights, broadcast partnerships, technology sponsors, helmet decal sponsors (NFL). Focus on: deal structures, emerging sponsor categories, biggest deals this quarter, teams with new commercial partnerships' },
  { id: 'combat-sports-sponsorship', topic: 'Combat sports sponsorship 2026: UFC/MMA octagon sponsors, fighter kit deals, boxing promotion partnerships, PFL expansion. Which brands are entering combat sports, deal structures (per-fight vs annual), viewership trends, crossover with F1/motorsport audiences, Saudi Arabia investment in boxing/MMA events' },
  { id: 'cricket-rugby-sponsorship', topic: 'Cricket and rugby sponsorship 2026: IPL team sponsors, ICC commercial partnerships, T20 league deals globally, Premiership Rugby sponsors, Six Nations commercial partners, Rugby World Cup commercial programme. Focus on: which brands sponsor cricket vs rugby, deal values, emerging markets (USA cricket, Japan rugby)' },
  { id: 'motorsport-commercial', topic: 'Motorsport commercial landscape beyond F1 2026: MotoGP sponsorship deals, WEC/Le Mans partnerships, IndyCar commercial news, NASCAR sponsor changes, Formula E brand activations. Focus on: cross-series trends, which brands are multi-series (spanning F1 + WEC + MotoGP), category pricing comparisons across series, emerging sponsor categories' },
  { id: 'sports-media-rights', topic: 'Sports media and broadcasting rights 2026: latest TV/streaming deals, rights valuations, platform competition (DAZN, ESPN+, TNT Sports, Sky, Amazon, Apple), cord-cutting impact on sponsorship, digital rights trends, social media rights packages, betting integration into broadcasts' },
  { id: 'sports-business-trends', topic: 'Sports business trends and investment 2026: franchise valuations, private equity in sport (CVC, Arctos, RedBird), athlete NIL deals, women\'s sports commercial growth (WNBA, WSL, WTA), sustainability in sports sponsorship, AI/tech integration in fan engagement, latest SportsPro/SportBusiness intelligence' },

  // ── Licensing & Fashion Business Intelligence ──
  { id: 'brand-licensing', topic: 'Brand licensing news 2026: latest licensing deals across fashion, sports, entertainment, automotive, luxury. Focus on: new licensee agreements, brand extensions (e.g. F1 teams licensing apparel, fragrance, eyewear), celebrity/athlete brand licensing, co-branding partnerships, licensing revenue trends, key players (IMG Licensing, CAA Brand Management, Beanstalk), royalty rate benchmarks by category' },
  { id: 'sports-licensing', topic: 'Sports and gaming licensing 2026: team merchandise licensing deals, league licensing programmes (NFL, NBA, Premier League, F1), video game licensing (EA, 2K, Codemasters), esports team licensing, collectibles/NFT licensing, stadium/venue naming rights as licensing, kit manufacturer deals (Nike, Adidas, Puma, New Balance), replica kit sales data, fan merchandise trends' },
  { id: 'entertainment-licensing', topic: 'Entertainment and IP licensing 2026: film/TV franchise licensing, music artist merchandise licensing, streaming platform licensing deals, character licensing (Disney, Warner Bros, Universal), toy/game licensing, publishing licensing, theme park IP licensing, cross-media licensing trends, licensing expo news' },
  { id: 'fashion-business', topic: 'Fashion business news 2026: luxury conglomerate results (LVMH, Kering, Richemont, Hermès), M&A activity, brand launches and closures, creative director appointments, fashion-sport collaborations (Palm Angels × F1, Off-White × team kits), streetwear market trends, DTC vs wholesale shifts, fashion tech (AI styling, virtual try-on), sustainability regulations (EU textile strategy), key trade shows (Pitti, MICAM, Première Vision), eyewear industry news (EssilorLuxottica, Safilo, Marchon, Marcolin)' },
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
    // Default: run 3 domains based on daily rotation (called 5x by Hetzner cron = all 15 covered)
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    const startIdx = (dayOfYear * 3) % DOMAINS.length;
    todaysDomains = [];
    for (let i = 0; i < 3; i++) todaysDomains.push(DOMAINS[(startIdx + i) % DOMAINS.length]);
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
        // Compute simple hash for change detection
        const hash = Buffer.from(text.slice(0, 500)).toString('base64').slice(0, 32);

        // Check if content actually changed
        const { data: existing } = await supabase.from('kiko_knowledge').select('content_hash, version, content').eq('domain', domain.id).single();
        const changed = !existing || existing.content_hash !== hash;

        if (changed && existing?.content) {
          // Save previous version to history before overwriting
          await supabase.from('kiko_knowledge_history').insert({
            domain: domain.id,
            content: existing.content,
            researched_at: new Date().toISOString(),
            source: 'version-archive',
            content_hash: existing.content_hash,
            chars_changed: Math.abs(text.length - (existing.content || '').length),
          });
        }

        // Save current version
        const newVersion = (existing?.version || 0) + (changed ? 1 : 0);
        await supabase.from('kiko_knowledge').upsert({
          domain: domain.id,
          content: text,
          researched_at: new Date().toISOString(),
          source: 'cron-knowledge-seed',
          content_hash: hash,
          version: newVersion,
        }, { onConflict: 'domain' });
        results.push({ domain: domain.id, status: changed ? 'updated' : 'unchanged', version: newVersion, length: text.length });
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
