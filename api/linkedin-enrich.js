// api/linkedin-enrich.js — LinkedIn profile enrichment via AI research
// Uses Claude Sonnet with web search to pull structured LinkedIn profile data.
// Called by Hetzner cron to enrich CRM contacts with LinkedIn intelligence.
// This replaces direct LinkedIn scraping (blocked by Cloudflare) with AI-powered research.

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5';

export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { contactId, batchSize = 5 } = body;

  try {
    let contacts = [];
    if (contactId) {
      const { data } = await supabase.from('contacts').select('id, data').eq('id', contactId).single();
      if (data) contacts = [data];
    } else {
      // Find thin contacts: have name + company but no linkedin enrichment yet
      const { data } = await supabase.from('contacts').select('id, data')
        .eq('org_id', ORG_ID)
        .is('data->linkedin_enriched_at', null)
        .not('data->name', 'is', null)
        .not('data->company', 'is', null)
        .limit(batchSize);
      contacts = data || [];
    }

    if (contacts.length === 0) return res.json({ enriched: 0, message: 'No contacts to enrich' });

    const results = [];
    for (const contact of contacts) {
      const d = contact.data || {};
      const name = d.name || [d.firstName, d.lastName].filter(Boolean).join(' ');
      const company = d.company || '';
      const title = d.title || '';
      const linkedinUrl = d.linkedinUrl || d.linkedin || '';

      if (!name) { results.push({ id: contact.id, status: 'skipped', reason: 'no name' }); continue; }

      try {
        const searchQuery = linkedinUrl
          ? `LinkedIn profile ${linkedinUrl} ${name} ${company}`
          : `LinkedIn profile ${name} ${title} ${company}`;

        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{
            role: 'user',
            content: `Research this person's professional background. Search for their LinkedIn profile and any other professional information.

Person: ${name}
Title: ${title || 'Unknown'}
Company: ${company}
${linkedinUrl ? `LinkedIn URL: ${linkedinUrl}` : ''}

Respond ONLY with a JSON object (no markdown, no backticks):
{
  "headline": "their LinkedIn headline or professional tagline",
  "current_role": "current job title",
  "current_company": "current employer",
  "location": "city, country",
  "experience_years": estimated total years of experience (number),
  "previous_roles": ["role at company (years)", "role at company (years)"],
  "education": ["degree, institution"],
  "skills": ["top 5 relevant skills"],
  "industry": "primary industry",
  "linkedin_url": "confirmed LinkedIn URL if found",
  "bio_summary": "2-3 sentence professional summary",
  "icebreaker_hooks": ["3 conversation starters based on their background"]
}`
          }],
        });

        const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
        let enrichment;
        try {
          // Strip markdown fences if present
          const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          enrichment = JSON.parse(cleaned);
        } catch {
          enrichment = { bio_summary: text.slice(0, 500), parse_error: true };
        }

        // Merge enrichment into contact data
        const updatedData = {
          ...d,
          linkedin_headline: enrichment.headline || d.linkedin_headline,
          linkedin_bio: enrichment.bio_summary || d.linkedin_bio,
          linkedin_location: enrichment.location || d.linkedin_location,
          linkedin_experience_years: enrichment.experience_years || d.linkedin_experience_years,
          linkedin_previous_roles: enrichment.previous_roles || d.linkedin_previous_roles,
          linkedin_education: enrichment.education || d.linkedin_education,
          linkedin_skills: enrichment.skills || d.linkedin_skills,
          linkedin_industry: enrichment.industry || d.linkedin_industry,
          linkedin_icebreakers: enrichment.icebreaker_hooks || d.linkedin_icebreakers,
          linkedinUrl: enrichment.linkedin_url || d.linkedinUrl || d.linkedin,
          linkedin_enriched_at: new Date().toISOString(),
        };

        await supabase.from('contacts').update({ data: updatedData, updated_at: new Date().toISOString() }).eq('id', contact.id);
        results.push({ id: contact.id, name, status: 'enriched', headline: enrichment.headline });

      } catch (err) {
        console.error(`[linkedin-enrich] ${name} failed:`, err.message);
        results.push({ id: contact.id, name, status: 'error', error: err.message });
      }
    }

    console.log(`[linkedin-enrich] Complete: ${results.filter(r => r.status === 'enriched').length}/${results.length} enriched`);
    res.json({ enriched: results.filter(r => r.status === 'enriched').length, total: results.length, results });

  } catch (err) {
    console.error('[linkedin-enrich] Fatal:', err.message);
    res.status(500).json({ error: err.message });
  }
}
