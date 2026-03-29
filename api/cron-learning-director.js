// api/cron-learning-director.js — Autonomous Knowledge Engine
// Kiko's self-directed learning system. Runs daily.
// Works through a structured curriculum across 15 business pillars.
// Each run: picks the least-covered pillar, searches for knowledge, extracts principles.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, logError, cronHeartbeat } from './kiko-tools.js';

export const config = { maxDuration: 120 };
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const USER_ID = '9f486437-4bf5-4111-abfe-fe19bfa76063';

const CURRICULUM = {
  'sales_persuasion': {
    name: 'Sales & Persuasion',
    topics: [
      'Cialdini 6 principles of persuasion reciprocity scarcity authority',
      'SPIN selling methodology situation problem implication need-payoff',
      'Challenger Sale teaching tailoring taking control',
      'MEDDIC enterprise sales qualification methodology',
      'enterprise sales psychology C-suite decision making',
      'consultative selling techniques high-value B2B deals',
      'objection handling frameworks reframing techniques',
      'social proof case study selling sponsorship context',
    ]
  },
  'negotiation': {
    name: 'Negotiation',
    topics: [
      'Getting to Yes principled negotiation BATNA Fisher Ury',
      'Never Split the Difference Chris Voss tactical empathy',
      'anchoring effect negotiation first offer strategy',
      'concession patterns strategic compromise deal-making',
      'ZOPA zone of possible agreement negotiation range',
      'multi-party negotiation coalition building',
      'sponsorship rights negotiation exclusivity terms',
    ]
  },
  'sponsorship_licensing': {
    name: 'Sponsorship & Licensing',
    topics: [
      'IEG sponsorship valuation methodology rights pricing',
      'sponsorship activation models brand integration measurement',
      'sports sponsorship ROI measurement frameworks metrics',
      'licensing revenue models royalty rates territory rights',
      'brand licensing agreement structure key terms',
      'F1 sponsorship tier structure principal partner official supplier',
      'naming rights valuation stadium team jersey',
      'sponsorship category exclusivity conflict management',
    ]
  },
  'f1_business': {
    name: 'F1 Business & Motorsport',
    topics: [
      'Bernie Ecclestone Formula One commercial model television rights',
      'Liberty Media F1 acquisition transformation digital strategy',
      'F1 team economics cost cap budget allocation revenue share',
      'Formula E business model manufacturer involvement city racing',
      'motorsport sponsorship landscape category mapping tier structure',
      'F1 paddock politics governance FIA commercial rights holder',
      'race hosting fees circuit economics government investment',
    ]
  },
  'psychology_behaviour': {
    name: 'Psychology & Behavioural Science',
    topics: [
      'Kahneman Tversky System 1 System 2 thinking fast slow cognitive biases',
      'behavioural economics nudge theory Thaler choice architecture',
      'cognitive biases in business anchoring confirmation availability heuristic',
      'persuasion psychology Cialdini pre-suasion priming effects',
      'decision fatigue ego depletion executive decision making',
      'predictive behavioural patterns consumer psychology buying triggers',
      'emotional intelligence leadership Daniel Goleman frameworks',
      'dark patterns ethical persuasion design influence',
    ]
  },
  'legal_corporate': {
    name: 'Legal & Corporate Structure',
    topics: [
      'UK company law Companies Act 2006 director duties fiduciary',
      'US LLC vs C-Corp structure Delaware incorporation advantages',
      'intellectual property protection trademarks patents design rights UK US',
      'commercial contract law consideration terms conditions breach remedies',
      'commercial litigation process UK courts procedure costs',
      'CDDA company directors disqualification act wrongful trading',
      'employment law UK unfair dismissal redundancy TUPE',
      'data protection GDPR compliance commercial implications',
      'shareholder agreements drag along tag along pre-emption rights',
    ]
  },
  'finance_accounting': {
    name: 'Finance & Accounting',
    topics: [
      'financial modelling DCF valuation revenue forecasting startup',
      'fundraising mechanics pre-seed seed Series A term sheets',
      'cap table management dilution anti-dilution SAFE notes',
      'unit economics CAC LTV burn rate runway calculation',
      'corporate finance capital structure debt equity hybrid instruments',
      'management accounting P&L balance sheet cash flow interpretation',
      'tax planning UK US corporate structure transfer pricing',
    ]
  },
  'brand_luxury': {
    name: 'Brand & Luxury Markets',
    topics: [
      'LVMH luxury brand management Bernard Arnault strategy',
      'scarcity economics luxury limited edition drop culture',
      'cultural capital theory Bourdieu brand positioning premium',
      'DTC direct to consumer luxury eyewear fashion brands',
      'brand architecture house of brands branded house endorser',
      'luxury consumer psychology aspiration exclusivity identity',
      'Kering Gucci brand revitalisation case study luxury group',
    ]
  },
  'leadership_strategy': {
    name: 'Leadership & Strategy',
    topics: [
      'Porter five forces competitive advantage value chain strategy',
      'Blue Ocean Strategy Kim Mauborgne value innovation',
      'first principles thinking Elon Musk problem solving approach',
      'OKR framework objectives key results Google Intel alignment',
      'Jim Collins Good to Great flywheel hedgehog concept',
      'McKinsey 7S framework strategy execution organisational design',
      'Clayton Christensen innovators dilemma disruptive innovation',
    ]
  },
  'advertising_media': {
    name: 'Advertising & Media',
    topics: [
      'David Ogilvy advertising principles copywriting headlines',
      'attention economics media buying CPM CPC CPA programmatic',
      'cultural moment marketing event-driven brand activation',
      'content marketing authority building thought leadership B2B',
      'social media strategy LinkedIn B2B executive presence',
      'media planning reach frequency GRP advertising effectiveness',
    ]
  },
  'hr_operations': {
    name: 'HR & Operations',
    topics: [
      'UK employment law contracts unfair dismissal tribunal process',
      'organisational design flat hierarchy matrix remote teams',
      'compensation structures equity vesting cliff acceleration',
      'performance management OKR-based continuous feedback',
      'talent acquisition employer branding startup hiring',
    ]
  },
  'technology_ai': {
    name: 'Technology & AI',
    topics: [
      'AI product development LLM applications vertical SaaS',
      'platform economics network effects marketplace dynamics',
      'data moats competitive advantage through proprietary data',
      'API economy developer platforms integration strategy',
      'AI agent architecture multi-agent systems orchestration',
    ]
  },
  'entrepreneurship': {
    name: 'Entrepreneurship',
    topics: [
      'lean startup methodology MVP build measure learn Eric Ries',
      'fundraising narrative pitch deck structure investor psychology',
      'board management governance startup founder CEO relationship',
      'scaling frameworks Blitzscaling Reid Hoffman growth stages',
      'founder psychology resilience decision-making under uncertainty',
    ]
  },
  'property_commercial': {
    name: 'Property & Commercial Law',
    topics: [
      'commercial lease terms break clause rent review service charge',
      'landlord tenant obligations repair covenant dilapidations',
      'property investment structures SPV tax implications UK',
      'commercial property valuation yield cap rate',
    ]
  },
  'investor_relations': {
    name: 'Investor Relations',
    topics: [
      'pitch deck science storytelling data narrative arc investor',
      'due diligence preparation data room financial legal technical',
      'term sheet negotiation valuation liquidation preference board seats',
      'investor psychology what VCs look for pattern matching signals',
      'investor update communication cadence metrics transparency',
    ]
  },
  'design_brand': {
    name: 'Design & Brand Identity',
    topics: [
      'brand identity design system visual language typography colour',
      'luxury brand packaging unboxing experience tactile design',
      'eyewear design industrial design frame engineering materials',
      'brand guidelines creation consistency across touchpoints',
      'mood board creation visual direction art direction process',
      'typography hierarchy font pairing readability brand personality',
      'colour psychology branding consumer perception emotional response',
      'minimalist design principles less is more negative space',
      'presentation design pitch deck visual storytelling data viz',
      'motion design brand animation micro-interactions digital identity',
    ]
  },
  'ai_design_generation': {
    name: 'AI Design & Content Generation',
    topics: [
      'Midjourney prompting techniques style parameters aspect ratios',
      'DALL-E prompt engineering descriptive structured prompts',
      'Stable Diffusion ControlNet img2img inpainting workflows',
      'AI video generation Runway Gen-3 Kling Sora capabilities',
      'AI brand campaign creation automated visual content pipeline',
      'prompt engineering for photorealistic product photography AI',
      'AI typography poster design advertising creative generation',
      'Nijijourney anime illustration style AI generation techniques',
      'AI design tools Figma AI Canva AI Adobe Firefly comparison',
      'intellectual property AI generated images copyright commercial use',
    ]
  },
  'advertising_creative': {
    name: 'Advertising & Creative Strategy',
    topics: [
      'David Ogilvy advertising principles long copy direct response',
      'creative brief writing structure insight proposition execution',
      'campaign planning integrated media ATL BTL digital social',
      'Nike brand strategy Just Do It cultural marketing playbook',
      'Red Bull content marketing extreme sports energy drink positioning',
      'luxury advertising visual codes aspiration exclusivity storytelling',
      'social media advertising creative Facebook Instagram LinkedIn',
      'influencer marketing ROI measurement authentic partnerships',
    ]
  },
  'licensing_ip_commercial': {
    name: 'Licensing & IP Commercialisation',
    topics: [
      'brand licensing deal structure royalty rates territory exclusivity',
      'merchandise licensing sports entertainment fashion categories',
      'trademark registration protection enforcement UK US international',
      'design rights registered unregistered protection UK EU US',
      'patent basics utility design provisional application process',
      'IP valuation methods cost market income approaches',
      'licensing negotiation royalty advance minimum guarantee',
      'franchising vs licensing models control revenue structures',
    ]
  },
  'fashion_industry': {
    name: 'Fashion Industry & Luxury Markets',
    topics: [
      'fashion calendar seasons collections production timelines',
      'eyewear industry market size Luxottica EssilorLuxottica dominance',
      'DTC fashion brands disruption Warby Parker Glossier methodology',
      'fashion collaboration strategy brand x brand limited edition drops',
      'sustainability fashion circular economy materials innovation',
      'fashion supply chain production sourcing quality control',
      'capsule collection strategy limited runs scarcity marketing',
      'fashion PR media relations editorial placement celebrity seeding',
    ]
  },
};

async function getLearnedTopicCount() {
  try {
    const learned = await sbFetch('kiko_learning_log?category=eq.curriculum&select=entity_name');
    const topicSet = new Set((learned || []).map(l => l.entity_name));
    return topicSet;
  } catch { return new Set(); }
}

async function learnTopic(pillarKey, pillar, topic) {
  try {
    // Step 1: Use Claude with web search to research the topic
    const research = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 2000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: `Research this topic thoroughly for a CEO running an F1 sponsorship advisory and luxury eyewear business: "${topic}". 
        
Find the most authoritative sources. Extract:
1. Core principles (not just definitions — actionable rules)
2. Key frameworks or models
3. How this applies to: sponsorship sales, brand building, investor relations, deal negotiation
4. Specific examples or case studies
5. Common mistakes to avoid

Be specific and practical. This knowledge will be used operationally.` }],
    });

    // Extract text from response (may have tool_use blocks for web search)
    const researchText = research.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    if (!researchText || researchText.length < 200) return null;

    // Step 2: Distil into operational knowledge via Haiku (cheap, fast)
    const distil = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 800,
      system: `You are distilling research into operational knowledge for an AI assistant (Kiko) that helps run a business. Convert this research into ACTIONABLE PRINCIPLES that Kiko can reference when helping with tasks. Format as JSON: { "principles": ["When doing X, apply Y because Z", ...], "frameworks": ["Framework name: brief description"], "applications": { "sponsorship": "how this applies", "negotiation": "how this applies", "strategy": "how this applies" }, "key_quote": "one memorable quote or rule" }. Max 8 principles. Be specific and practical, not academic.`,
      messages: [{ role: 'user', content: `Topic: ${topic}\nPillar: ${pillar.name}\n\nResearch:\n${researchText.slice(0, 4000)}` }],
    });
    const raw = (distil.content[0]?.text || '{}').replace(/```json|```/g, '').trim();
    const knowledge = JSON.parse(raw);

    // Step 3: Store in learning log (operational knowledge)
    for (const principle of (knowledge.principles || []).slice(0, 5)) {
      await sbFetch('kiko_learning_log', {
        method: 'POST', body: JSON.stringify({
          user_id: USER_ID, category: 'curriculum',
          content: principle,
          entity_name: `${pillarKey}:${topic.split(' ').slice(0, 3).join('_')}`,
        })
      });
    }

    // Step 4: Store full knowledge in memories filesystem
    const memPath = `/memories/knowledge/${pillarKey}/${topic.split(' ').slice(0, 4).join('_').toLowerCase()}.md`;
    const memContent = `# ${topic}\n## Pillar: ${pillar.name}\n\n### Principles\n${(knowledge.principles || []).map(p => `- ${p}`).join('\n')}\n\n### Frameworks\n${(knowledge.frameworks || []).map(f => `- ${f}`).join('\n')}\n\n### Applications\n${Object.entries(knowledge.applications || {}).map(([k, v]) => `**${k}**: ${v}`).join('\n')}\n\n### Key Quote\n${knowledge.key_quote || ''}`;

    await sbFetch('kiko_memories', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ path: memPath, content: memContent, is_directory: false, org_id: '35975d96-c2c9-4b6c-b4d4-bb947ae817d5', updated_at: new Date().toISOString() })
    });

    // Step 5: Update kiko_skills if a new capability was learned
    await sbFetch('kiko_skills', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        name: `${pillar.name}: ${topic.split(' ').slice(0, 4).join(' ')}`,
        category: pillarKey, trigger_keywords: topic,
        updated_at: new Date().toISOString(),
      })
    });

    return { topic, principles: (knowledge.principles || []).length, frameworks: (knowledge.frameworks || []).length };
  } catch (e) { return { topic, error: e.message }; }
}

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-learning-director', 'started');
  try {
    // Discover what's already been learned
    const learned = await getLearnedTopicCount();

    // Score each pillar by coverage (topics learned / total topics)
    const pillarScores = [];
    for (const [key, pillar] of Object.entries(CURRICULUM)) {
      const total = pillar.topics.length;
      const covered = pillar.topics.filter(t =>
        learned.has(`${key}:${t.split(' ').slice(0, 3).join('_')}`)
      ).length;
      pillarScores.push({ key, pillar, total, covered, gap: total - covered, ratio: covered / total });
    }

    // Pick the pillar with the biggest gap (least covered)
    pillarScores.sort((a, b) => a.ratio - b.ratio);
    const target = pillarScores[0];

    if (!target || target.gap === 0) {
      await cronHeartbeat('cron-learning-director', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.status(200).json({ ok: true, message: 'All curriculum topics covered!', pillars: pillarScores.map(p => `${p.key}: ${p.covered}/${p.total}`) });
    }

    // Learn 2-3 topics from the target pillar (budget: ~120s total)
    const unlearned = target.pillar.topics.filter(t =>
      !learned.has(`${target.key}:${t.split(' ').slice(0, 3).join('_')}`)
    );
    const batch = unlearned.slice(0, 2); // 2 topics per run to stay within time limit

    const results = [];
    for (const topic of batch) {
      const result = await learnTopic(target.key, target.pillar, topic);
      if (result) results.push(result);
    }

    // ── CURIOSITY ENGINE: learn 1 topic from the curiosity queue ──
    let curiosityResult = null;
    try {
      const curious = await sbFetch('kiko_curiosity_queue?status=eq.queued&order=priority.desc&limit=1&select=id,topic,category,reason');
      if (curious?.[0]) {
        const c = curious[0];
        await sbFetch(`kiko_curiosity_queue?id=eq.${c.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'learning' }) });
        // Find closest matching pillar or use 'general'
        const pillarKey = Object.keys(CURRICULUM).find(k => c.category?.includes(k)) || 'leadership_strategy';
        const pillar = CURRICULUM[pillarKey] || { name: 'General Knowledge' };
        curiosityResult = await learnTopic(pillarKey, pillar, c.topic);
        await sbFetch(`kiko_curiosity_queue?id=eq.${c.id}`, { method: 'PATCH', body: JSON.stringify({ status: curiosityResult?.error ? 'queued' : 'learned' }) });
        // Also add this topic to the curriculum dynamically
        if (curiosityResult && !curiosityResult.error) {
          results.push({ ...curiosityResult, source: 'curiosity' });
        }
      }
    } catch {} // Non-blocking

    const summary = {
      pillar: target.pillar.name,
      topics_learned: results.filter(r => !r.error).length,
      topics_errored: results.filter(r => r.error).length,
      total_curriculum_coverage: `${pillarScores.reduce((a, p) => a + p.covered, 0) + results.filter(r => !r.error).length}/${pillarScores.reduce((a, p) => a + p.total, 0)}`,
      results,
    };

    await cronHeartbeat('cron-learning-director', 'finished', {
      heartbeatId: __hbId, durationMs: Date.now() - __hbStart,
      recordsProcessed: results.filter(r => !r.error).length,
    });
    return res.status(200).json({ ok: true, ...summary });
  } catch (err) {
    await logError('cron:learning-director', err.message);
    await cronHeartbeat('cron-learning-director', 'error', { heartbeatId: __hbId, errorMessage: err.message });
    return res.status(500).json({ error: err.message });
  }
}
