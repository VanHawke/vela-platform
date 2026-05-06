// api/cron-learning-director.js — Autonomous Knowledge Engine
// Kiko's self-directed learning system. Runs daily.
// Works through a structured curriculum across 15 business pillars.
// Each run: picks the least-covered pillar, searches for knowledge, extracts principles.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch, logError, cronHeartbeat } from './kiko-tools.js';
import { getActiveUsers } from './cron-utils.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

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
  // ═══ COMPETITIVE INTELLIGENCE — Van Hawke Agency ═══
  'vh_agency_competitive': {
    name: 'Van Hawke Agency — Competitive Landscape (Self-Discovering)',
    topics: [
      'top sports sponsorship agencies globally 2026 ranking revenue clients who are the players',
      'CAA Sports WME Octagon CSM Wasserman Excel Sports Management latest deals wins losses 2026',
      'boutique sports marketing agencies challenging big agencies how they win what makes them different',
      'sports sponsorship agency business models revenue streams how they make money fee structures',
      'sports agency organizational structures teams departments how top agencies are built internally',
      'sports sponsorship agency pitch decks case studies client presentations how they sell',
      'sports sponsorship agency client acquisition strategies how they win new clients prospecting methods',
      'emerging sports marketing agencies nobody is watching yet startups disrupting sponsorship industry 2026',
    ]
  },
  'vh_f1_deal_intel': {
    name: 'F1 Deal Intelligence & Grid Economics',
    topics: [
      'F1 2026 sponsorship deals new sponsors entering grid every team announcements latest',
      'F1 team sponsorship valuations 2026 principal partner title sponsor costs tier pricing',
      'F1 sponsor exits departures 2026 2025 why companies leave Formula 1 what went wrong',
      'F1 cost cap impact sponsorship structure team budgets commercial revenue distribution 2026',
      'Haas F1 Team TGR sponsors partners 2026 commercial strategy available inventory opportunities',
      'F1 teams sponsorship revenue breakdown Mercedes Red Bull Ferrari McLaren Alpine Williams Sauber Cadillac',
      'Formula 1 new markets countries Grand Prix locations 2027 2028 expansion target brands from those regions',
      'F1 sponsorship category analysis technology crypto finance consumer healthcare which sectors growing',
    ]
  },
  'vh_prospect_intel': {
    name: 'Prospect & Target Intelligence — Predictive Signals',
    topics: [
      'companies raising Series B C D 2026 $50M+ funding rounds technology cybersecurity AI cloud fintech',
      'companies hiring CMO VP Marketing Head of Brand 2026 signals of sponsorship budget increase',
      'B2B technology companies first time sports sponsorship what triggered the decision case studies',
      'IPO pipeline 2026 2027 pre-IPO companies brand awareness marketing spend increase patterns',
      'cybersecurity AI infrastructure companies marketing budgets brand building strategies 2026',
      'predictive indicators company ready for F1 sponsorship funding growth revenue CMO hire board pressure',
      'companies expanding into Europe UK market entry brand awareness needs sponsorship as vehicle',
      'venture backed companies marketing spend ratios when do startups invest in brand vs performance marketing',
    ]
  },
  'vh_agency_positioning': {
    name: 'Agency Positioning Messaging & Sales Methodology',
    topics: [
      'how top sports agencies position themselves messaging differentiation what language they use',
      'authority led thought leadership strategy LinkedIn content sponsorship advisory positioning 2026',
      'C-suite engagement CMO CEO CFO sponsorship decision making process who decides budget cycles timing',
      'sponsorship sales psychology persuasion techniques enterprise B2B closing high value deals',
      'case study led selling sponsorship ROI evidence based advisory methodology best practices',
      'zero budget agency growth strategies how to build a sports agency with no capital bootstrap methods',
      'agency credibility building without revenue how startups establish authority before first big client',
      'sports business networking conferences events relationships paddock access strategy 2026',
    ]
  },
  // ═══ BUSINESS BUILDING & CEO INTELLIGENCE ═══
  'vh_business_building': {
    name: 'Business Building — Zero to Global (Applied to Van Hawke)',
    topics: [
      'how to build a global agency from zero capital bootstrapping strategies real examples founders who did it',
      'agency business models retainer vs commission vs hybrid revenue structures sports marketing advisory',
      'hiring first employees zero budget equity compensation advisory board building startup team design',
      'CEO leadership techniques scaling businesses biographies lessons Branson Arnault Ecclestone Ari Emanuel',
      'startup to scale playbook first 12 months revenue generation client acquisition without marketing budget',
      'building credibility as unknown brand thought leadership content strategy personal branding CEO visibility',
      'partnership and joint venture strategies for small agencies leveraging bigger brands relationships',
      'financial management zero revenue startup cash flow management when to invest when to hold runway planning',
    ]
  },
  // ═══ MARKETING & SOCIAL PLAYBOOK ═══
  'vh_marketing_playbook': {
    name: 'Marketing Social Media & Growth — What Works Now',
    topics: [
      'viral marketing campaigns 2026 what went viral why it worked analysis of best campaigns this year',
      'LinkedIn thought leadership strategy B2B what content performs best engagement tactics 2026',
      'social media marketing best practices 2026 Instagram TikTok LinkedIn X what works per platform',
      'content marketing for professional services agencies advisory firms how to create authority content',
      'email marketing cold outreach best practices 2026 subject lines open rates response optimization',
      'brand storytelling techniques luxury premium positioning narrative frameworks that convert',
      'influencer marketing sports fashion luxury how brands select partners ROI measurement 2026',
      'traditional media PR strategy press coverage how to get featured in Forbes Bloomberg SportBusiness',
    ]
  },
  // ═══ VAN HAWKE MAISON — Fashion & Eyewear Intelligence ═══
  'vh_maison_competitive': {
    name: 'Van Hawke Maison — Luxury Eyewear Competitive Intelligence',
    topics: [
      'luxury independent eyewear brands 2026 Jacques Marie Mage Gentle Monster Mykita who else emerging',
      'EssilorLuxottica Kering Eyewear Safilo strategy acquisitions collaborations 2026 what are they doing',
      'luxury eyewear pricing strategies $500+ frames how brands justify premium positioning scarcity models',
      'eyewear brand launch strategies how successful indie brands launched their first collection playbook',
      'fashion x sport crossover collaborations 2026 which brands are merging sport and luxury successfully',
      'DTC luxury brand building Warby Parker Gentle Monster retail strategy experiential stores online mix',
      'limited edition drop model fashion streetwear luxury how brands create scarcity and hype release strategy',
      'cultural performance eyewear positioning how to create a new category in luxury fashion branding',
    ]
  },
  'vh_maison_marketing': {
    name: 'Van Hawke Maison — Fashion Marketing & Viral Strategy',
    topics: [
      'luxury fashion marketing campaigns 2026 what brands are doing best creative social digital',
      'fashion brand social media strategy Instagram TikTok content that drives luxury sales 2026',
      'celebrity seeding product placement strategy luxury eyewear fashion how to get on the right faces',
      'fashion PR media relations getting coverage Vogue GQ Hypebeast editorial placement strategy',
      'luxury brand launch with zero budget guerrilla marketing creative strategies fashion startups',
      'fashion ecommerce conversion optimization luxury DTC website design UX best practices 2026',
      'sustainability in luxury fashion how brands communicate ethical sourcing materials innovation',
      'fashion collaboration strategy brand x brand limited edition co-creation methodology what works',
    ]
  },
  // ═══ AGENCY STRUCTURE DEEP INTELLIGENCE ═══
  'vh_agency_org_intel': {
    name: 'Agency Organisational Intelligence — How Competitors Are Built',
    topics: [
      'CAA Sports organizational structure how many people work there team breakdown departments reporting lines leadership 2026',
      'Octagon sports agency business model revenue streams retainer vs commission fee structure how they make money',
      'Wasserman agency structure clients team size growth trajectory acquisitions how they scaled from boutique to global',
      'CSM Sport Entertainment org chart key people who runs motorsport practice team size client roster pitch approach',
      'IMG WME sports agency F1 motorsport division who works there what clients deal flow how they win',
      'boutique sports agencies that beat big agencies specific case studies how they won deals against CAA Octagon CSM',
      'sports sponsorship agency employee backgrounds where do they hire from universities careers profiles LinkedIn data',
      'agency client churn rates why sponsors leave their agencies what triggers a review pitch competitive displacement',
      'sports agency technology stack CRM tools valuation platforms analytics what software powers top agencies',
      'sponsorship agency pitch deck structure what goes in a winning pitch to F1 teams and to brands case studies examples',
      'agency new business development how do Octagon Wasserman CSM prospect and win new clients process methodology',
      'agency revenue per employee headcount economics what is the right team size for a motorsport sponsorship practice',
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
      model: 'claude-sonnet-4-6', max_tokens: 2000,
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

// ═══ COMPETITIVE INTELLIGENCE — writes to kiko_knowledge (loaded into prompt) ═══
async function researchCompetitiveIntel(pillarKey, topic) {
  try {
    const research = await anthropic.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 3000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: `You are a competitive intelligence analyst for Van Hawke Group — an F1 sponsorship advisory and luxury eyewear company.

Research this topic with MAXIMUM DEPTH: "${topic}"

Find:
1. SPECIFIC deals, numbers, names, dates — not generalities
2. WHO is doing WHAT right now — companies, people, moves
3. Business structure details — how they operate, what makes them successful
4. Client rosters, case studies, pitch approaches where available
5. What's CHANGING — new entrants, exits, shifts in strategy
6. Messaging analysis — how competitors position themselves, their language, their angles
7. Gaps and opportunities — what nobody else is doing that Van Hawke could exploit

Be a forensic analyst, not a news summariser. Dig deep. Find the details that give strategic advantage.` }],
    });

    const researchText = research.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    if (!researchText || researchText.length < 300) return null;

    // Write to kiko_knowledge (loaded into Kiko's prompt every conversation)
    const domain = pillarKey.replace(/_/g, '-');
    await sbFetch('kiko_knowledge', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        domain,
        content: `## ${topic.split(' ').slice(0, 6).join(' ').toUpperCase()}\n**Researched:** ${new Date().toISOString().split('T')[0]}\n\n${researchText.slice(0, 5000)}`,
        researched_at: new Date().toISOString(),
        source: 'competitive-intel',
      })
    });

    console.log(`[learning-director] Competitive intel written to kiko_knowledge: ${domain} (${researchText.length} chars)`);
    return { topic, domain, chars: researchText.length };
  } catch (e) {
    console.error(`[learning-director] Competitive intel failed: ${e.message}`);
    return null;
  }
}

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-learning-director', 'started');
  try {
    // Resolve USER_ID dynamically — shared knowledge, written under first super_admin
    const users = await getActiveUsers();
    const USER_ID = users.find(u => u.role === 'super_admin')?.user_id || users[0]?.user_id;
    if (!USER_ID) { await cronHeartbeat('cron-learning-director', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 }); return res.status(200).json({ ok: false, error: 'No active users' }); }

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

    // Prioritize competitive intelligence domains (vh_*) — these refresh regularly, not just once
    const COMPETITIVE_KEYS = ['vh_agency_competitive', 'vh_f1_deal_intel', 'vh_prospect_intel', 'vh_agency_positioning', 'vh_business_building', 'vh_marketing_playbook', 'vh_maison_competitive', 'vh_maison_marketing', 'vh_agency_org_intel'];
    const isCompetitive = (key) => COMPETITIVE_KEYS.includes(key);

    // Competitive domains: pick a random topic each run (they need FRESH data, not one-time coverage)
    // Academic domains: pick the least covered pillar (one-time learning)
    const competitivePillars = pillarScores.filter(p => isCompetitive(p.key));
    const academicPillars = pillarScores.filter(p => !isCompetitive(p.key) && p.gap > 0);

    // Alternate: 2 out of 3 runs do competitive intel, 1 does academic
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    const doCompetitive = dayOfYear % 3 !== 0; // 2 of 3 days do competitive

    let target, useCompetitiveResearch = false;
    if (doCompetitive && competitivePillars.length > 0) {
      // Pick a random competitive pillar
      target = competitivePillars[Math.floor(Math.random() * competitivePillars.length)];
      useCompetitiveResearch = true;
    } else if (academicPillars.length > 0) {
      academicPillars.sort((a, b) => a.ratio - b.ratio);
      target = academicPillars[0];
    } else if (competitivePillars.length > 0) {
      target = competitivePillars[Math.floor(Math.random() * competitivePillars.length)];
      useCompetitiveResearch = true;
    }

    if (!target) {
      await cronHeartbeat('cron-learning-director', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: 0 });
      return res.status(200).json({ ok: true, message: 'All curriculum topics covered!', pillars: pillarScores.map(p => `${p.key}: ${p.covered}/${p.total}`) });
    }

    // For competitive: pick a random topic (not sequential — varied coverage)
    // For academic: pick the first unlearned topic
    const unlearned = target.pillar.topics.filter(t =>
      !learned.has(`${target.key}:${t.split(' ').slice(0, 3).join('_')}`)
    );
    const allTopics = target.pillar.topics;
    const topicPool = useCompetitiveResearch ? allTopics : unlearned;
    const batch = useCompetitiveResearch
      ? [topicPool[Math.floor(Math.random() * topicPool.length)]]
      : [topicPool[0]];

    const results = [];
    for (const topic of batch) {
      if (useCompetitiveResearch) {
        // Competitive intel: deep web research → writes to kiko_knowledge (in-prompt)
        const result = await researchCompetitiveIntel(target.key, topic);
        if (result) results.push(result);
      } else {
        // Academic: textbook learning → writes to learning_log + memories
        const result = await learnTopic(target.key, target.pillar, topic);
        if (result) results.push(result);
      }
    }

    // ── CURIOSITY ENGINE: learn 1 topic — only if time allows (under 80s elapsed) ──
    let curiosityResult = null;
    if (Date.now() - __hbStart < 50000) {
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
    } // time guard

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
    return res.status(200).json({ ok: false, error: err.message });
  }
}
