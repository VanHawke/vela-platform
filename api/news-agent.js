// api/news-agent.js — RSS feed aggregator + Haiku intelligence classifier
// Fetches from 10+ sports business/F1/sponsorship RSS feeds, deduplicates, classifies via Haiku
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { cronHeartbeat, logError } from './kiko-tools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5';

// RSS Feed sources — sponsorship-first, all verified working
const FEEDS = [
  // SPONSORSHIP & SPORTS BUSINESS (primary — 7 feeds)
  { name: 'SportsPro Media', url: 'https://www.sportspromedia.com/feed/', category: 'sports_sponsorship' },
  { name: 'InsiderSport', url: 'https://insidersport.com/feed/', category: 'sports_sponsorship' },
  { name: 'The Sponsor', url: 'https://www.thesponsor.com/feed/', category: 'sports_sponsorship' },
  { name: 'Front Office Sports', url: 'https://frontofficesports.com/feed/', category: 'sports_sponsorship' },
  { name: 'iSportConnect', url: 'https://www.isportconnect.com/feed/', category: 'sports_sponsorship' },
  { name: 'Sportcal', url: 'https://sportcal.com/feed/', category: 'market_activity' },
  { name: 'BlackBook Motorsport', url: 'https://www.blackbookmotorsport.com/feed/', category: 'sports_sponsorship' },
  // F1 & MOTORSPORT (5 feeds — expanded for partnership coverage)
  { name: 'Formula1.com', url: 'https://www.formula1.com/en/latest/all.xml', category: 'f1_general' },
  { name: 'Motorsport.com F1', url: 'https://www.motorsport.com/rss/f1/news/', category: 'f1_general' },
  { name: 'RaceFans', url: 'https://www.racefans.net/feed/', category: 'f1_general' },
  { name: 'Autosport', url: 'https://www.autosport.com/rss/feed/f1', category: 'f1_general' },
  { name: 'RacingNews365', url: 'https://racingnews365.com/feed/news.xml', category: 'f1_general' },
  // FIA / FORMULA E
  { name: 'FIA', url: 'https://www.fia.com/rss/news', category: 'f1_general' },
  // GOOGLE NEWS — targeted per-team sponsorship queries (primary fix for missing team news)
  { name: 'GNews: Haas Sponsor', url: 'https://news.google.com/rss/search?q=%22Haas%22+%22F1%22+%22partner%22+OR+%22sponsor%22+OR+%22deal%22&hl=en&gl=GB&ceid=GB:en', category: 'f1_sponsorship' },
  { name: 'GNews: Alpine Sponsor', url: 'https://news.google.com/rss/search?q=%22Alpine+F1%22+%22partner%22+OR+%22sponsor%22+OR+%22deal%22&hl=en&gl=GB&ceid=GB:en', category: 'f1_sponsorship' },
  { name: 'GNews: Ferrari Sponsor', url: 'https://news.google.com/rss/search?q=%22Ferrari%22+%22F1%22+%22sponsor%22+OR+%22partner%22+OR+%22deal%22+2026&hl=en&gl=GB&ceid=GB:en', category: 'f1_sponsorship' },
  { name: 'GNews: McLaren Sponsor', url: 'https://news.google.com/rss/search?q=%22McLaren%22+%22F1%22+%22sponsor%22+OR+%22partner%22+2026&hl=en&gl=GB&ceid=GB:en', category: 'f1_sponsorship' },
  { name: 'GNews: Mercedes Sponsor', url: 'https://news.google.com/rss/search?q=%22Mercedes%22+%22F1%22+%22sponsor%22+OR+%22partner%22+2026&hl=en&gl=GB&ceid=GB:en', category: 'f1_sponsorship' },
  { name: 'GNews: Red Bull Sponsor', url: 'https://news.google.com/rss/search?q=%22Red+Bull+Racing%22+%22sponsor%22+OR+%22partner%22+2026&hl=en&gl=GB&ceid=GB:en', category: 'f1_sponsorship' },
  { name: 'GNews: F1 Partnership', url: 'https://news.google.com/rss/search?q=Formula+1+sponsorship+partnership+announcement&hl=en&gl=US&ceid=US:en', category: 'f1_sponsorship' },
  { name: 'GNews: F1 Commercial', url: 'https://news.google.com/rss/search?q=%22F1+team%22+%22new+partner%22+OR+%22title+sponsor%22+OR+%22official+partner%22&hl=en&gl=GB&ceid=GB:en', category: 'f1_sponsorship' },
  // PR NEWSWIRE — press release wires where teams publish directly
  { name: 'PRN: F1 Motorsport', url: 'https://www.prnewswire.com/rss/news-releases-list.rss?category=SPT&subjectCode=SPT_F1&pageSize=50', category: 'f1_sponsorship' },
  { name: 'PRN: Sports Sponsorship', url: 'https://www.prnewswire.com/rss/news-releases-list.rss?category=SPT&subjectCode=SPT_EM&pageSize=50', category: 'sports_sponsorship' },
  // BUSINESS PUBLICATIONS (free RSS)
  { name: 'Forbes Business', url: 'https://www.forbes.com/business/feed/', category: 'business' },
  { name: 'Forbes Innovation', url: 'https://www.forbes.com/innovation/feed/', category: 'technology' },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', category: 'technology' },
  { name: 'TechCrunch Fundraising', url: 'https://techcrunch.com/category/fundraising/feed/', category: 'funding' },
  { name: 'Reuters Business', url: 'https://www.reutersagency.com/feed/?best-topics=business-finance', category: 'business' },
  { name: 'CNBC Tech', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=19854910', category: 'technology' },
  { name: 'CNBC Economy', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258', category: 'macro' },
  { name: 'Wired Business', url: 'https://www.wired.com/feed/category/business/latest/rss', category: 'business' },
  { name: 'Wired Science', url: 'https://www.wired.com/feed/category/science/latest/rss', category: 'technology' },
  { name: 'VentureBeat', url: 'https://venturebeat.com/feed/', category: 'technology' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', category: 'technology' },
  { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', category: 'technology' },
  { name: 'MIT Technology Review', url: 'https://www.technologyreview.com/feed/', category: 'technology' },
  // PAYWALLED — headline capture via Google News
  { name: 'GNews: Bloomberg Business', url: 'https://news.google.com/rss/search?q=site:bloomberg.com+business+OR+technology+OR+deal&hl=en&gl=US&ceid=US:en', category: 'business' },
  { name: 'GNews: Financial Times', url: 'https://news.google.com/rss/search?q=site:ft.com+business+OR+technology+OR+acquisition&hl=en&gl=GB&ceid=GB:en', category: 'business' },
  { name: 'GNews: Wall Street Journal', url: 'https://news.google.com/rss/search?q=site:wsj.com+technology+OR+deal+OR+acquisition+OR+funding&hl=en&gl=US&ceid=US:en', category: 'business' },
  { name: 'GNews: The Times Business', url: 'https://news.google.com/rss/search?q=site:thetimes.com+business+OR+technology+OR+sponsorship&hl=en&gl=GB&ceid=GB:en', category: 'business' },
  // VC / PE / FUNDING
  { name: 'Crunchbase News', url: 'https://news.crunchbase.com/feed/', category: 'funding' },
  { name: 'GNews: Series A Funding', url: 'https://news.google.com/rss/search?q=%22Series+A%22+OR+%22Series+B%22+OR+%22Series+C%22+funding+announced&hl=en&gl=US&ceid=US:en', category: 'funding' },
  { name: 'GNews: IPO Filing', url: 'https://news.google.com/rss/search?q=IPO+filing+OR+%22goes+public%22+OR+%22IPO+plans%22+technology&hl=en&gl=US&ceid=US:en', category: 'funding' },
  { name: 'GNews: Acquisitions', url: 'https://news.google.com/rss/search?q=%22acquires%22+OR+%22acquisition%22+OR+%22merger%22+technology+OR+software&hl=en&gl=US&ceid=US:en', category: 'market_activity' },
  { name: 'GNews: PE Deals', url: 'https://news.google.com/rss/search?q=%22private+equity%22+OR+%22buyout%22+OR+%22LBO%22+technology&hl=en&gl=US&ceid=US:en', category: 'funding' },
  { name: 'GlobeNewsWire', url: 'https://www.globenewswire.com/RssFeed/subjectcode/25-Mergers%20and%20Acquisitions/feedTitle/GlobeNewsWire%20-%20Mergers%20and%20Acquisitions', category: 'market_activity' },
  { name: 'PRN: Technology', url: 'https://www.prnewswire.com/rss/news-releases-list.rss?category=TEC&pageSize=50', category: 'technology' },
  { name: 'PRN: Business Finance', url: 'https://www.prnewswire.com/rss/news-releases-list.rss?category=FIN&pageSize=50', category: 'funding' },
  // MARKETING / ADVERTISING / CAMPAIGNS
  { name: 'Marketing Week', url: 'https://www.marketingweek.com/feed/', category: 'marketing' },
  { name: 'The Drum', url: 'https://www.thedrum.com/feeds/all.xml', category: 'marketing' },
  { name: 'AdAge', url: 'https://adage.com/arc/outboundfeeds/rss/', category: 'marketing' },
  { name: 'Campaign', url: 'https://www.campaignlive.co.uk/feed', category: 'marketing' },
  { name: 'Digiday', url: 'https://digiday.com/feed/', category: 'marketing' },
  { name: 'GNews: CMO Moves', url: 'https://news.google.com/rss/search?q=%22new+CMO%22+OR+%22chief+marketing+officer+appointed%22+OR+%22head+of+marketing%22&hl=en&gl=US&ceid=US:en', category: 'leadership' },
  { name: 'GNews: CTO Moves', url: 'https://news.google.com/rss/search?q=%22new+CTO%22+OR+%22chief+technology+officer+appointed%22+OR+%22VP+Engineering%22+hired&hl=en&gl=US&ceid=US:en', category: 'leadership' },
  { name: 'GNews: CEO Moves', url: 'https://news.google.com/rss/search?q=%22new+CEO%22+OR+%22chief+executive+appointed%22+technology+OR+SaaS&hl=en&gl=US&ceid=US:en', category: 'leadership' },
  // MACROECONOMICS / SECTORS
  { name: 'GNews: Cybersecurity Market', url: 'https://news.google.com/rss/search?q=cybersecurity+market+OR+%22cyber+security%22+growth+OR+funding&hl=en&gl=US&ceid=US:en', category: 'sector_intel' },
  { name: 'GNews: Cloud Computing', url: 'https://news.google.com/rss/search?q=cloud+computing+market+OR+%22cloud+infrastructure%22+growth+OR+deal&hl=en&gl=US&ceid=US:en', category: 'sector_intel' },
  { name: 'GNews: AI Enterprise', url: 'https://news.google.com/rss/search?q=%22enterprise+AI%22+OR+%22AI+startup%22+funding+OR+launch+OR+partnership&hl=en&gl=US&ceid=US:en', category: 'sector_intel' },
  { name: 'GNews: Semiconductor', url: 'https://news.google.com/rss/search?q=semiconductor+chip+market+OR+funding+OR+expansion+OR+partnership&hl=en&gl=US&ceid=US:en', category: 'sector_intel' },
  // PSYCHOLOGY / BEHAVIORAL SCIENCE / PERSUASION
  { name: 'Harvard Business Review', url: 'https://hbr.org/resources/rss', category: 'psychology_strategy' },
  { name: 'Psychology Today', url: 'https://www.psychologytoday.com/intl/blog/feed', category: 'psychology_strategy' },
  { name: 'BehavioralEconomics.com', url: 'https://www.behavioraleconomics.com/feed/', category: 'psychology_strategy' },
  { name: 'GNews: Behavioral Science', url: 'https://news.google.com/rss/search?q=%22behavioral+science%22+OR+%22decision+making%22+OR+%22cognitive+bias%22+business&hl=en&gl=US&ceid=US:en', category: 'psychology_strategy' },
  // DESIGN / CREATIVE / BRAND
  { name: 'Creative Review', url: 'https://www.creativereview.co.uk/feed/', category: 'design' },
  { name: 'It\'s Nice That', url: 'https://www.itsnicethat.com/rss/all', category: 'design' },
  { name: 'Dezeen', url: 'https://www.dezeen.com/feed/', category: 'design' },
  { name: 'Brand New (UnderConsideration)', url: 'https://www.underconsideration.com/brandnew/atom.xml', category: 'design' },
];

// Simple XML RSS parser (no dependencies)
function parseRSS(xml, sourceName, sourceUrl) {
  const articles = [];
  // Handle both RSS 2.0 (<item>) and Atom (<entry>) formats
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>|<entry[\s>]([\s\S]*?)<\/entry>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1] || match[2];
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return (m?.[1] || m?.[2] || '').trim().replace(/<[^>]*>/g, '').trim();
    };
    const getAttr = (tag, attr) => {
      const m = block.match(new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i'));
      return m?.[1] || '';
    };
    const title = get('title');
    const link = get('link') || getAttr('link', 'href');
    const desc = get('description') || get('summary') || get('content');
    const pubDate = get('pubDate') || get('published') || get('updated') || get('dc:date');
    const author = get('author') || get('dc:creator');
    const imageMatch = block.match(/<media:content[^>]*url="([^"]*)"/) || block.match(/<enclosure[^>]*url="([^"]*)"/) || block.match(/<img[^>]*src="([^"]*)"/);
    if (title && link) {
      articles.push({
        source_name: sourceName, source_url: sourceUrl, article_url: link,
        title: title.slice(0, 500), summary: desc?.slice(0, 1000) || '',
        image_url: imageMatch?.[1] || null, author: author || null,
        published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        org_id: ORG_ID,
      });
    }
  }
  return articles;
}

// Fetch all RSS feeds and return deduplicated articles
async function fetchAllFeeds() {
  const allArticles = [];
  const startTime = Date.now();
  // Process feeds in parallel batches of 10 for speed
  for (let i = 0; i < FEEDS.length; i += 10) {
    if (Date.now() - startTime > 80000) { console.log(`[News] Time guard: processed ${i}/${FEEDS.length} feeds in 80s`); break; }
    const batch = FEEDS.slice(i, i + 10);
    const results = await Promise.allSettled(batch.map(async (feed) => {
      try {
        const res = await fetch(feed.url, {
          headers: { 'User-Agent': 'Kiko/1.0 (RSS Reader)', Accept: 'application/rss+xml, application/xml, text/xml' },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return [];
        const xml = await res.text();
      const articles = parseRSS(xml, feed.name, feed.url);
      return articles;
    } catch (e) { return []; }
    }));
    for (const r of results) { if (r.status === 'fulfilled' && r.value?.length) allArticles.push(...r.value); }
  }
  console.log(`[News] Fetched ${allArticles.length} articles from ${FEEDS.length} feeds in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  return allArticles;
}

// Store articles, skip duplicates via article_url_hash unique constraint
async function storeArticles(articles) {
  let stored = 0, skipped = 0;
  for (const a of articles) {
    const { error } = await supabase.from('news_articles').upsert(a, { onConflict: 'article_url_hash', ignoreDuplicates: true });
    if (error) skipped++; else stored++;
  }
  return { stored, skipped, total: articles.length };
}

// Classify articles via Claude Haiku — category, relevance, deal signals
async function classifyArticle(article, companyNames) {
  const prompt = `Classify this sports business article. Return ONLY valid JSON (no markdown, no backticks):
Title: ${article.title}
Source: ${article.source_name}
Summary: ${(article.summary || '').slice(0, 800)}

Context: Van Hawke Group is an F1/Formula E sponsorship advisory firm. Key clients: Haas F1, Alpine F1. Target sectors: cybersecurity, AI, cloud, semiconductors, fintech, robotics, legal, banking.

CATEGORY RULES (pick the most specific match):
- "sports_sponsorship" = ANY new sponsorship deal, brand partnership, naming rights, shirt deal, renewal, or commercial agreement in ANY sport. This is the PRIMARY category — use it for any article about a brand signing/renewing with a sports entity.
- "f1_sponsorship" = Sponsorship deals specifically involving F1 teams, FIA, or F1 as a property.
- "brand_ambassador" = Individual athlete endorsement or ambassador deals.
- "market_activity" = Media rights deals, broadcast agreements, M&A, investment, league valuations. NOT sponsorship deals.
- "formula_e" = Anything specifically about Formula E (Season 12, E-Prix, FIA Formula E).
- "f1_general" = F1 race results, driver news, technical regulations, team performance — NOT commercial/sponsorship.
- "team_news" = Team operations, management changes, new venues — NOT sponsorship.
- "regulatory" = FIA/league rules, governance, policy changes.

Return JSON:
{
  "category": "sports_sponsorship|f1_sponsorship|formula_e|f1_general|market_activity|brand_ambassador|team_news|regulatory",
  "relevance_score": 0-10,
  "deal_signal": true/false,
  "key_topics": ["topic1", "topic2"],
  "sentiment": "positive|neutral|negative",
  "matched_companies": [],
  "is_partnership_announcement": true/false,
  "partnership_team": "team name if F1 partnership",
  "partnership_partner": "company name if partnership"
}

deal_signal = true if the article announces a NEW deal, partnership, renewal, naming rights, or commercial agreement.
is_partnership_announcement = true if the article specifically announces or confirms a NEW or RENEWED partnership between an F1 team and a sponsor/partner. This is the most important signal.

Relevance scoring:
- 9-10: Mentions Haas F1, Van Hawke, Toyota, or a company in Van Hawke's CRM
- 7-8: New sponsorship deal announcement in ANY sport (brand + rights holder named)
- 5-6: Sponsorship market analysis, deal renewals, commercial trends
- 3-4: General sports business (media rights, investment, M&A)
- 1-2: Race results, driver gossip, non-commercial content

For matched_companies, check if any of these appear: ${companyNames.slice(0, 100).join(', ')}
Return matched names as strings in the array.`;

  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content?.[0]?.text || '{}';
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch (e) { console.error('[News] Haiku classify error:', e.message); return null; }
}

// Process unclassified articles
async function classifyBatch(limit = 15) {
  // Get company names from CRM for matching
  const { data: companies } = await supabase.from('companies').select("data->name").limit(200);
  const companyNames = (companies || []).map(c => c.name).filter(Boolean);

  const { data: articles } = await supabase.from('news_articles')
    .select('*').eq('is_processed', false).order('published_at', { ascending: false }).limit(limit);
  if (!articles?.length) return { classified: 0 };

  let classified = 0;
  for (const article of articles) {
    const intel = await classifyArticle(article, companyNames);
    if (intel) {
      // Look up matched company IDs
      const matchedCompanies = [];
      for (const name of (intel.matched_companies || [])) {
        const { data: match } = await supabase.from('companies')
          .select('id, data->name').ilike('data->>name', `%${name}%`).limit(1);
        if (match?.[0]) matchedCompanies.push({ id: match[0].id, name: match[0].name });
      }
      await supabase.from('news_articles').update({
        category: intel.category, relevance_score: intel.relevance_score,
        deal_signal: intel.deal_signal || false, key_topics: intel.key_topics || [],
        sentiment: intel.sentiment, matched_companies: matchedCompanies,
        is_processed: true,
        intelligence: {
          is_partnership_announcement: intel.is_partnership_announcement || false,
          partnership_team: intel.partnership_team || null,
          partnership_partner: intel.partnership_partner || null,
        },
      }).eq('id', article.id);
      // Create Kiko alert if high relevance deal signal
      if (intel.deal_signal && intel.relevance_score >= 7) {
        await supabase.from('kiko_alerts').insert({
          org_id: ORG_ID, type: 'deal_signal', severity: 'high',
          title: `Deal Signal: ${article.title.slice(0, 100)}`,
          body: `${article.source_name}: ${article.summary?.slice(0, 200)}`,
          metadata: { article_id: article.id, url: article.article_url, matched_companies: matchedCompanies },
        });
      }

      // === AUTO-UPDATE PARTNERSHIP MATRIX IN REAL-TIME ===
      if (intel.is_partnership_announcement && intel.partnership_team && intel.partnership_partner) {
        const teamAliases = {
          'red bull': 'red_bull', 'red bull racing': 'red_bull', 'oracle red bull': 'red_bull', 'rbr': 'red_bull',
          'ferrari': 'ferrari', 'scuderia ferrari': 'ferrari', 'hp ferrari': 'ferrari',
          'mclaren': 'mclaren', 'mastercard mclaren': 'mclaren', 'mclaren f1': 'mclaren',
          'mercedes': 'mercedes', 'petronas mercedes': 'mercedes', 'silver arrows': 'mercedes', 'mercedes-amg': 'mercedes',
          'aston martin': 'aston_martin', 'aramco aston martin': 'aston_martin', 'amr': 'aston_martin',
          'alpine': 'alpine', 'bwt alpine': 'alpine',
          'williams': 'williams', 'atlassian williams': 'williams', 'williams f1': 'williams',
          'haas': 'haas', 'tgr haas': 'haas', 'haas f1': 'haas',
          'racing bulls': 'racing_bulls', 'visa cash app': 'racing_bulls', 'rb': 'racing_bulls',
          'audi': 'audi', 'revolut audi': 'audi', 'sauber': 'audi',
          'cadillac': 'cadillac',
        };
        const teamName = (intel.partnership_team || '').toLowerCase().trim();
        const teamId = teamAliases[teamName] || Object.entries(teamAliases).find(([k]) => teamName.includes(k))?.[1];
        if (teamId) {
          // Handle comma-separated partner names (Haiku sometimes returns multiple)
          const partnerNames = intel.partnership_partner.split(/[,&]/).map(s => s.trim()).filter(s => s.length > 1 && s.length < 60);
          for (const partnerName of partnerNames) {
            const { data: existing } = await supabase.from('f1_partnerships')
              .select('id').eq('team_id', teamId).eq('partner_name', partnerName).maybeSingle();
            if (!existing) {
              await supabase.from('f1_partnerships').upsert({
                team_id: teamId, partner_name: partnerName,
                tier: 'partner', status: 'active', verified: false,
                last_verified_at: new Date().toISOString(), updated_at: new Date().toISOString(),
              }, { onConflict: 'team_id,partner_name' });
              await supabase.from('kiko_alerts').insert({
                type: 'new_partnership', severity: 'medium',
                title: `New: ${partnerName} → ${teamId}`,
                detail: `Auto-detected from news: "${article.title}". ${partnerName} identified as new partner for ${teamId}.`,
                entity_type: 'partnership', entity_name: partnerName,
                metadata: { source: article.title, article_id: article.id, team_id: teamId, partner: partnerName },
                expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              });
              // Homepage notification — shows in the Pipeline Activity panel
              const teamDisplayName = intel.partnership_team || teamId;
              await supabase.from('pipeline_notifications').insert({
                type: 'new_partnership',
                title: `New F1 partner: ${partnerName} → ${teamDisplayName}`,
                body: `${partnerName} announced as partner for ${teamDisplayName}. Source: ${article.source_name}. Auto-detected from: "${article.title.slice(0, 100)}"`,
                company_name: partnerName,
                pipeline: teamDisplayName,
                stage: 'Partnership Announced',
                source: 'news_agent',
                priority: 'high',
                metadata: { article_id: article.id, team_id: teamId, partner: partnerName, article_url: article.article_url },
              });
              console.log(`[News] Auto-added partnership: ${partnerName} → ${teamId}`);
            }
          }
        }
      }
      classified++;
    }
  }
  return { classified, total: articles.length };
}

// API handler
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  const action = req.body?.action || req.query?.action;

  // FETCH — pull RSS feeds and store new articles
  if (action === 'fetch') {
    const articles = await fetchAllFeeds();
    const result = await storeArticles(articles);
    return res.json({ action: 'fetch', ...result });
  }

  // CLASSIFY — run Haiku on unclassified articles
  if (action === 'classify') {
    const limit = req.body?.limit || 15;
    const result = await classifyBatch(limit);
    return res.json({ action: 'classify', ...result });
  }

  // SYNC — fetch + classify in one call (for cron)
  if (action === 'sync') {
    const articles = await fetchAllFeeds();
    const storeResult = await storeArticles(articles);
    const classifyResult = await classifyBatch(20);
    return res.json({ action: 'sync', fetched: storeResult, classified: classifyResult });
  }

  // LIST — get articles for frontend (requires action=list explicitly)
  if (action === 'list') {
    const category = req.query?.category;
    const page = parseInt(req.query?.page || '1');
    const limit = parseInt(req.query?.limit || '30');
    const offset = (page - 1) * limit;
    const dealSignalsOnly = req.query?.deals === 'true';
    const partnershipsOnly = req.query?.partnerships === 'true';

    let query = supabase.from('news_articles')
      .select('id, title, source_name, article_url, image_url, published_at, category, relevance_score, deal_signal, matched_companies, key_topics, sentiment, is_read, is_starred, intelligence', { count: 'exact' })
      .order('published_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (partnershipsOnly) {
      // Show articles that are partnership/sponsorship announcements
      query = query.or('deal_signal.eq.true,intelligence->>is_partnership_announcement.eq.true')
        .in('category', ['f1_sponsorship', 'sports_sponsorship', 'brand_ambassador']);
    } else {
      if (category && category !== 'all') query = query.eq('category', category);
      if (dealSignalsOnly) query = query.eq('deal_signal', true);
    }

    const { data, count, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ articles: data || [], total: count || 0, page });
  }

  // STAR/READ — toggle state
  if (action === 'star' || action === 'read') {
    const { id, value } = req.body;
    const field = action === 'star' ? 'is_starred' : 'is_read';
    await supabase.from('news_articles').update({ [field]: value }).eq('id', id);
    return res.json({ ok: true });
  }

  // Default for GET (cron trigger) — run sync with heartbeat
  if (req.method === 'GET' && !action) {
    const __hbStart = Date.now();
    const __hbId = await cronHeartbeat('news-agent', 'started');
    try {
      const articles = await fetchAllFeeds();
      const storeResult = await storeArticles(articles);
      const classifyResult = await classifyBatch(20);
      await cronHeartbeat('news-agent', 'finished', {
        heartbeatId: __hbId, durationMs: Date.now() - __hbStart,
        recordsProcessed: (storeResult?.stored || 0) + (classifyResult?.classified || 0),
      });
      return res.json({ action: 'cron-sync', fetched: storeResult, classified: classifyResult });
    } catch (err) {
      await cronHeartbeat('news-agent', 'error', { heartbeatId: __hbId, errorMessage: err.message });
      await logError('news-agent', err.message).catch(() => {});
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'action required: fetch|classify|sync|list|star|read' });
}
