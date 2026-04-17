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

  // Mode 1: Enrich a specific contact by ID
  // Mode 2: Auto-enrich batch of thin contacts (cron mode)
  const { contactId, batchSize = 5 } = body;

  try {
    let contacts = [];
    if (contactId) {
      const { data } = await supabase.from('contacts').select('id, data').eq('id', contactId).single();
      if (data) contacts = [data];
    } else {
      // Find thin contacts: have a name + company but missing linkedin enrichment
      const { data } = await supabase.from('contacts').select('id, data')
        .eq('org_id', ORG_ID)
        .is('data->linkedin_enriched', null)
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
      const linkedinUrl = d.linkedinUrl || d.linkedin || '';

      if (!name) { results.push({ id: contact.id, status: 'skipped', reason: 'no name' }); continue; }
