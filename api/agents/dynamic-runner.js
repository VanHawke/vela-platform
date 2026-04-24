// api/agents/dynamic-runner.js — Universal Dynamic Agent Runner
// Executes agent definitions stored in kiko_dynamic_agents table.
// Kiko can create, modify, and run her own agents without code changes.
import Anthropic from '@anthropic-ai/sdk';
import { sbFetch } from '../kiko-tools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

export async function runDynamicAgent(agentName, question, context = '') {
  // 1. Load agent definition
  const agents = await sbFetch(`kiko_dynamic_agents?name=eq.${encodeURIComponent(agentName)}&active=eq.true&limit=1`);
  if (!agents?.length) return `No dynamic agent found: "${agentName}". Available agents can be listed with manage_knowledge (list_sources).`;
  const agent = agents[0];

  // 2. Execute data queries for context
  let dataContext = '';
  if (Array.isArray(agent.data_queries) && agent.data_queries.length) {
    for (const q of agent.data_queries) {
      try {
        const data = await sbFetch(q.query);
        if (data?.length) {
          dataContext += `\n\n[${q.label || 'DATA'}]:\n`;
          if (typeof data === 'string') { dataContext += data; }
          else { dataContext += JSON.stringify(data).slice(0, 3000); }
        }
      } catch (e) { dataContext += `\n[${q.label || 'DATA'} ERROR]: ${e.message}`; }
    }
  }

  // 3. Call Claude with the agent's system prompt + data context + question
  try {
    const res = await anthropic.messages.create({
      model: agent.model || 'claude-sonnet-4-6',
      max_tokens: agent.max_tokens || 1200,
      system: agent.system_prompt + dataContext,
      messages: [{ role: 'user', content: `${question}${context ? `\nContext: ${context}` : ''}` }],
    });

    // 4. Increment usage counter (non-blocking)
    sbFetch(`kiko_dynamic_agents?id=eq.${agent.id}`, {
      method: 'PATCH', body: JSON.stringify({ usage_count: (agent.usage_count || 0) + 1, last_used_at: new Date().toISOString() })
    }).catch(() => {});

    return res.content[0]?.text || 'Agent returned no response.';
  } catch (err) { return `Dynamic agent "${agentName}" error: ${err.message}`; }
}

export async function createDynamicAgent({ name, display_name, description, system_prompt, data_queries, trigger_keywords, category }) {
  if (!name || !system_prompt || !description) return { error: 'name, description, and system_prompt are required' };
  try {
    const existing = await sbFetch(`kiko_dynamic_agents?name=eq.${encodeURIComponent(name)}&limit=1`);
    if (existing?.length) {
      await sbFetch(`kiko_dynamic_agents?name=eq.${encodeURIComponent(name)}`, {
        method: 'PATCH', body: JSON.stringify({ display_name, description, system_prompt, data_queries, trigger_keywords, category, updated_at: new Date().toISOString() })
      });
      return { success: true, action: 'updated', name };
    }
    await sbFetch('kiko_dynamic_agents', {
      method: 'POST', body: JSON.stringify({ name, display_name: display_name || name, description, system_prompt, data_queries: data_queries || [], trigger_keywords: trigger_keywords || [], category: category || 'custom', created_by: 'kiko' })
    });
    return { success: true, action: 'created', name };
  } catch (err) { return { error: err.message }; }
}

export async function listDynamicAgents() {
  try {
    const agents = await sbFetch('kiko_dynamic_agents?active=eq.true&select=name,display_name,description,category,usage_count,trigger_keywords&order=usage_count.desc');
    if (!agents?.length) return 'No dynamic agents created yet. I can create new agents — tell me what you need.';
    let out = `DYNAMIC AGENTS (${agents.length}):\n\n`;
    for (const a of agents) {
      out += `• ${a.display_name} [${a.name}] — ${a.description.slice(0, 100)}\n  Category: ${a.category} | Used: ${a.usage_count}x${a.trigger_keywords?.length ? ` | Triggers: ${a.trigger_keywords.join(', ')}` : ''}\n`;
    }
    return out;
  } catch (err) { return `Error listing agents: ${err.message}`; }
}
