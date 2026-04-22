// api/source-prospects.js — Deep research pipeline to find and return prospects for campaigns
// Streams progress updates via SSE. Returns structured prospect data for frontend review.
import Anthropic from '@anthropic-ai/sdk';

export const config = { maxDuration: 300 };

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-20250514';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { campaignName, description, targetPersona, sequenceId, existingEmails = [], maxCompanies = 50, contactsPerCompany = 2 } = req.body || {};
  if (!campaignName) return res.status(400).json({ error: 'campaignName required' });

  // SSE setup
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const write = (data) => { try { res.write(`data: ${JSON.stringify(data)}\n\n`) } catch {} };

  try {
    // ── PHASE 1: Find companies matching criteria ──
    write({ phase: 'researching', message: `Researching companies matching: ${description || campaignName}`, progress: 5 });

    const companyPrompt = `You are a B2B sales researcher. Find companies that match this campaign criteria:

Campaign: ${campaignName}
Description: ${description || 'Not specified'}
Target persona: ${targetPersona || 'C-suite executives'}

TASK: Find up to ${maxCompanies} real companies that match this criteria. For EACH company provide:
- company_name (official name)
- website (domain)
- industry
- estimated_revenue (if available, e.g. "$500M", "$2B")
- employee_count (approximate)
- headquarters (city, country)
- why_relevant (1 sentence on why they match the criteria)

Focus on:
1. Companies that would genuinely be prospects for this campaign
2. Real, verifiable companies (not made-up)
3. Mix of well-known and mid-market companies
4. Companies with active sponsorship/marketing budgets if relevant

CRITICAL: Return ONLY a valid JSON array. No markdown, no backticks, no explanation. Just the JSON array.
Example: [{"company_name":"Acme Corp","website":"acme.com","industry":"Technology","estimated_revenue":"$1B","employee_count":5000,"headquarters":"New York, USA","why_relevant":"Active F1 sponsor with growing tech portfolio"}]`;

    const companyResponse = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: companyPrompt }],
    });

    // Extract text from response (may have tool_use blocks interspersed)
    let companyText = '';
    for (const block of companyResponse.content) {
      if (block.type === 'text') companyText += block.text;
    }

    // If the model used tools and needs continuation, handle it
    if (companyResponse.stop_reason === 'tool_use') {
      write({ phase: 'researching', message: 'Deep searching for matching companies...', progress: 15 });
      
      // Build continuation messages
      const continuationMessages = [
        { role: 'user', content: companyPrompt },
        { role: 'assistant', content: companyResponse.content },
      ];
      
      // Process tool results
      const toolResults = [];
      for (const block of companyResponse.content) {
        if (block.type === 'tool_use') {
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: 'Search completed. Now compile ALL companies found into the JSON array.' });
        }
      }
      continuationMessages.push({ role: 'user', content: toolResults });

      // Second call to get compiled results
      const companyResponse2 = await client.messages.create({
        model: MODEL,
        max_tokens: 8000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: continuationMessages,
      });

      for (const block of companyResponse2.content) {
        if (block.type === 'text') companyText += block.text;
      }

      // If still using tools, do one more round
      if (companyResponse2.stop_reason === 'tool_use') {
        write({ phase: 'researching', message: 'Compiling research results...', progress: 25 });
        const msgs3 = [
          ...continuationMessages,
          { role: 'assistant', content: companyResponse2.content },
          { role: 'user', content: companyResponse2.content.filter(b => b.type === 'tool_use').map(b => ({ type: 'tool_result', tool_use_id: b.id, content: 'Done. Now return the FINAL JSON array of all companies found. No markdown, just JSON.' })) },
        ];
        const companyResponse3 = await client.messages.create({
          model: MODEL,
          max_tokens: 8000,
          messages: msgs3,
        });
        for (const block of companyResponse3.content) {
          if (block.type === 'text') companyText += block.text;
        }
      }
    }

    // Parse companies
    let companies = [];
    try {
      // Extract JSON from text (might have surrounding text)
      const jsonMatch = companyText.match(/\[[\s\S]*\]/);
      if (jsonMatch) companies = JSON.parse(jsonMatch[0]);
    } catch (e) {
      write({ phase: 'error', message: 'Failed to parse company research results', error: e.message });
      res.end();
      return;
    }

    companies = companies.slice(0, maxCompanies);
    write({ phase: 'companies_found', message: `Found ${companies.length} matching companies`, progress: 40, count: companies.length });

    // ── PHASE 2: Find decision-makers at each company ──
    const existingSet = new Set((existingEmails || []).map(e => e.toLowerCase()));
    const allProspects = [];
    const batchSize = 10; // Process 10 companies at a time

    for (let i = 0; i < companies.length; i += batchSize) {
      const batch = companies.slice(i, i + batchSize);
      const progress = 40 + Math.round((i / companies.length) * 50);
      write({ phase: 'sourcing_contacts', message: `Finding decision-makers at companies ${i + 1}-${Math.min(i + batchSize, companies.length)} of ${companies.length}...`, progress });

      const contactPrompt = `For each company below, find ${contactsPerCompany} senior decision-makers (C-suite, VP, Director level). The target persona is: ${targetPersona || 'C-suite executives'}.

Companies:
${batch.map((c, j) => `${j + 1}. ${c.company_name} (${c.website || 'no website'})`).join('\n')}

For EACH contact provide:
- company_name (must match exactly)
- first_name
- last_name
- title (job title)
- email (professional email - use firstname.lastname@domain or firstname@domain format if not found)
- linkedin_url (if findable, otherwise empty string)
- location (city, country)

CRITICAL: Return ONLY a valid JSON array of contacts. No markdown, no backticks.
Example: [{"company_name":"Acme Corp","first_name":"John","last_name":"Smith","title":"CMO","email":"john.smith@acme.com","linkedin_url":"https://linkedin.com/in/johnsmith","location":"New York, USA"}]`;

      try {
        const contactResponse = await client.messages.create({
          model: MODEL,
          max_tokens: 4000,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{ role: 'user', content: contactPrompt }],
        });

        let contactText = '';
        for (const block of contactResponse.content) {
          if (block.type === 'text') contactText += block.text;
        }

        // Handle tool use continuation
        if (contactResponse.stop_reason === 'tool_use') {
          const contMsgs = [
            { role: 'user', content: contactPrompt },
            { role: 'assistant', content: contactResponse.content },
            { role: 'user', content: contactResponse.content.filter(b => b.type === 'tool_use').map(b => ({ type: 'tool_result', tool_use_id: b.id, content: 'Search done. Return the FINAL JSON array of all contacts. No markdown.' })) },
          ];
          const contactResponse2 = await client.messages.create({
            model: MODEL,
            max_tokens: 4000,
            messages: contMsgs,
          });
          for (const block of contactResponse2.content) {
            if (block.type === 'text') contactText += block.text;
          }
        }

        // Parse contacts
        try {
          const jsonMatch = contactText.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const contacts = JSON.parse(jsonMatch[0]);
            for (const contact of contacts) {
              if (contact.email && !existingSet.has(contact.email.toLowerCase())) {
                const company = companies.find(c => c.company_name === contact.company_name) || {};
                allProspects.push({
                  ...contact,
                  company_website: company.website || '',
                  company_industry: company.industry || '',
                  company_revenue: company.estimated_revenue || '',
                  company_employees: company.employee_count || 0,
                  company_hq: company.headquarters || '',
                  why_relevant: company.why_relevant || '',
                });
                existingSet.add(contact.email.toLowerCase());
              }
            }
          }
        } catch {}
      } catch (batchErr) {
        write({ phase: 'sourcing_contacts', message: `Warning: failed to source contacts for batch ${i + 1}-${i + batchSize}: ${batchErr.message}`, progress });
      }
    }

    // ── PHASE 3: Return results ──
    write({ phase: 'complete', message: `Sourced ${allProspects.length} prospects from ${companies.length} companies`, progress: 100, prospects: allProspects, companies });

  } catch (err) {
    write({ phase: 'error', message: err.message, progress: 0 });
  }

  res.end();
}
