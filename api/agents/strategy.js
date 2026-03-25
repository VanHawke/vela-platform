// api/agents/strategy.js — Strategy Agent (Decision Engine)
// Delivers verdicts, not summaries. Called for strategic questions.
// Model: claude-opus-4-6 (highest reasoning)
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from '../kiko-tools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

const STRATEGY_PROMPT = `You are the Strategy Agent inside Kiko, the AI operating system for Van Hawke Group.

You are Sunny Sidhu's strategic advisor. You deliver VERDICTS, not summaries.

FRAMEWORK:
Every strategic question maps to one of these:
1. PURSUE / MONITOR / KILL — Should we chase this company?
2. LEVERAGE ANALYSIS — Where is our advantage? (Calendar, competitive, scarcity, authority, timing)
3. TIME vs VALUE — Expected value ÷ time investment. Kill anything below threshold.
4. CAPITAL ALLOCATION — Which entity gets resource priority? (Agency vs Maison vs Group Inc.)
5. PRIORITY STACK — What matters most right now? Rank by revenue impact × urgency.

OUTPUT FORMAT:
- VERDICT first (1 sentence, bold decision)
- REASONING (2-3 sentences, evidence-based)
- ACTION (specific next step with owner and deadline)
- RISK (what could go wrong, 1 sentence)

RULES:
- Never hedge. Pick a side.
- "Monitor" is acceptable but must have a trigger condition ("Monitor until Q3 earnings" not "Monitor for now").
- All values in USD. All timelines specific.
- You have access to CRM data, deal history, and learning log context. Use it.
- Think like a board advisor, not a consultant. Consultants describe problems. Advisors solve them.

Van Hawke entities:
- Agency: sponsorship advisory (primary revenue, Haas F1 client)
- Maison: Cultural Performance Eyewear (equity compounding, pre-seed)
- Group Inc: US holding / capital allocation

Current context: F1 2026 season, Formula E Season 12. Primary pipeline: Haas F1 sponsorship.`;

// ── Evaluate: core strategic question handler ──
async function evaluate(question, context = '') {
  // Gather ALL relevant context in parallel
  let crmContext = '', pipelineContext = '', pastDecisions = '', newsContext = '', companyContext = '', outreachContext = '';

  // Extract company name if mentioned
  const companyMatch = question.match(/(?:pursue|chase|target|prioritise|evaluate|assess|about|on)\s+(.+?)(?:\?|$|or|\svs)/i);
  const company = companyMatch ? companyMatch[1].trim() : null;

  const fetches = [];

  // CRM deals for mentioned company
  if (company) {
    fetches.push(
      sbFetch(`deals?select=data&data->>company=ilike.*${encodeURIComponent(company)}*&limit=3`)
        .then(deals => { if (deals?.length) crmContext = `\nDEALS: ${deals.map(d => `${d.data.company} — ${d.data.stage} (${d.data.pipeline}), value: $${(d.data.value||0).toLocaleString()}`).join('; ')}`; })
        .catch(() => {}),
      // Company enrichment data
      sbFetch(`companies?select=data&data->>name=ilike.*${encodeURIComponent(company)}*&limit=1`)
        .then(companies => {
          if (companies?.[0]?.data) {
            const c = companies[0].data;
            companyContext = `\nCOMPANY: ${c.name} | Industry: ${c.industry || '?'} | Employees: ${c.employees || '?'} | Funding: ${c.totalFunding || '?'} | Last Round: ${c.lastRound || '?'} | Revenue Est: ${c.revenueEst || '?'}`;
          }
        }).catch(() => {}),
      // Contacts at this company
      sbFetch(`contacts?select=data&data->>company=ilike.*${encodeURIComponent(company)}*&limit=5`)
        .then(contacts => {
          if (contacts?.length) companyContext += `\nCONTACTS (${contacts.length}): ${contacts.map(c => `${c.data.firstName} ${c.data.lastName||''} — ${c.data.title||'?'}`).join('; ')}`;
        }).catch(() => {}),
      // News about this company
      sbFetch('news_articles?is_processed=eq.true&order=published_at.desc&limit=20&select=title,matched_companies,published_at,deal_signal')
        .then(news => {
          const relevant = (news || []).filter(a => (a.matched_companies || []).some(c => (c.name || c).toLowerCase().includes(company.toLowerCase())));
          if (relevant.length) newsContext = `\nNEWS (${relevant.length}): ${relevant.slice(0,3).map(a => `${a.title}${a.deal_signal ? ' [DEAL SIGNAL]' : ''}`).join('; ')}`;
        }).catch(() => {}),
      // Outreach performance for this company
      sbFetch(`outreach_scores?company=ilike.*${encodeURIComponent(company)}*&order=sent_at.desc&limit=10`)
        .then(scores => {
          if (scores?.length) {
            const replied = scores.filter(s => s.outcome === 'replied').length;
            outreachContext = `\nOUTREACH: ${scores.length} emails sent, ${replied} replied (${Math.round(replied/scores.length*100)}% rate)`;
          }
        }).catch(() => {}),
    );
  }

  // Pipeline summary for portfolio-level questions
  if (question.toLowerCase().match(/priorit|allocat|portfolio|which.*first|focus|pipeline/)) {
    fetches.push(
      sbFetch('deals?select=data&data->>status=eq.active&limit=200')
        .then(deals => {
          if (deals?.length) {
            const STAGE_PROB = {'To revisit':0.05,'Contact made':0.10,'Qualified':0.20,'In Dialogue':0.35,'Meeting arranged (brand x RH)':0.50,'Proposal Sent':0.60,'Negotiation':0.75,'Verbal Agreement':0.90,'Contract Review':0.95};
            let totalWeighted = 0;
            const byStage = {};
            deals.forEach(d => { const s = d.data?.stage || '?'; byStage[s] = (byStage[s] || 0) + 1; totalWeighted += (d.data?.value || 0) * (STAGE_PROB[s] || 0.1); });
            pipelineContext = `\nPIPELINE: ${deals.length} active, $${(totalWeighted/1000000).toFixed(1)}M weighted. ${Object.entries(byStage).map(([s,c]) => `${s}: ${c}`).join(', ')}`;
          }
        }).catch(() => {}),
    );
  }

  // Past decisions from learning log
  fetches.push(
    sbFetch('kiko_learning_log?category=eq.decision&order=created_at.desc&limit=30&select=content,entity_name,created_at')
      .then(entries => {
        if (!entries?.length) return;
        const keywords = question.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const relevant = entries.filter(e => {
          const text = `${e.content || ''} ${e.entity_name || ''}`.toLowerCase();
          return keywords.some(k => text.includes(k));
        });
        if (relevant.length) {
          pastDecisions = `\nPAST DECISIONS (${relevant.length} relevant — reference these to show learning):\n` +
            relevant.slice(0, 5).map(e => {
              const date = e.created_at ? new Date(e.created_at).toLocaleDateString('en-GB', {day:'numeric',month:'short'}) : '?';
              return `• [${date}] ${e.entity_name || '?'}: ${(e.content || '').slice(0, 200)}`;
            }).join('\n');
        }
      }).catch(() => {}),
  );

  // Phase 19: Thought journal — past strategic reasoning threads
  let thoughtContext = '';
  fetches.push(
    sbFetch('kiko_thought_journal?order=created_at.desc&limit=15&select=topic,insight,related_entities,confidence')
      .then(entries => {
        if (!entries?.length) return;
        const keywords = question.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const relevant = (Array.isArray(entries) ? entries : []).filter(e => {
          const text = `${e.topic || ''} ${e.insight || ''} ${(e.related_entities||[]).join(' ')}`.toLowerCase();
          return keywords.some(k => text.includes(k));
        });
        if (relevant.length) {
          thoughtContext = `\nPAST REASONING (reference to show continuity of thinking):\n` +
            relevant.slice(0, 3).map(e => `• ${e.topic}: ${(e.insight || '').slice(0, 150)}`).join('\n');
        }
      }).catch(() => {}),
  );

  await Promise.all(fetches);
  const fullContext = [context, companyContext, crmContext, outreachContext, newsContext, pipelineContext, pastDecisions, thoughtContext].filter(Boolean).join('\n');

  try {
    const res = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1000,
      system: STRATEGY_PROMPT,
      messages: [{ role: 'user', content: `STRATEGIC QUESTION: ${question}${fullContext ? `\n\nCONTEXT:\n${fullContext}` : ''}` }],
    });
    return res.content[0]?.text || 'Strategy Agent could not evaluate this question.';
  } catch (err) {
    return `Strategy error: ${err.message}`;
  }
}

// ── Prioritise: rank items by revenue impact × urgency ──
async function prioritise(items = [], criteria = '') {
  if (!items.length) {
    try {
      const deals = await sbFetch('deals?select=data&data->>status=eq.active&order=updated_at.desc&limit=30');
      const STAGE_PROB = {'To revisit':0.05,'Contact made':0.10,'Qualified':0.20,'In Dialogue':0.35,'Meeting arranged (brand x RH)':0.50,'Proposal Sent':0.60,'Negotiation':0.75,'Verbal Agreement':0.90,'Contract Review':0.95};
      items = (deals || []).map(d => {
        const data = d.data || {};
        const last = data.lastActivity ? new Date(data.lastActivity) : null;
        const daysSince = last ? Math.floor((Date.now() - last) / 86400000) : 999;
        return {
          name: data.company, stage: data.stage, pipeline: data.pipeline,
          value: data.value || 0, weighted: (data.value || 0) * (STAGE_PROB[data.stage] || 0.1),
          daysSinceActivity: daysSince, contact: data.contactName || '?',
        };
      });
    } catch {}
  }
  if (!items.length) return 'No items to prioritise.';

  try {
    const res = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 800,
      system: STRATEGY_PROMPT,
      messages: [{ role: 'user', content: `PRIORITISE these ${items.length} items. Rank by revenue impact × urgency. Top 5 only.\n\n${JSON.stringify(items, null, 2)}${criteria ? `\n\nAdditional criteria: ${criteria}` : ''}` }],
    });
    return res.content[0]?.text || 'Could not prioritise.';
  } catch (err) {
    return `Priority error: ${err.message}`;
  }
}

// ── Main Dispatch ──
export async function callStrategyAgent(operation, params = {}) {
  try {
    switch (operation) {
      case 'evaluate': return await evaluate(params.question || params.query, params.context);
      case 'prioritise': return await prioritise(params.items, params.criteria);
      default: return `Unknown strategy operation: ${operation}. Available: evaluate, prioritise`;
    }
  } catch (err) {
    return `Strategy Agent error (${operation}): ${err.message}`;
  }
}
