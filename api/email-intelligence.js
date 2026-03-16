// api/email-intelligence.js — Background email analysis agent
// Runs on new emails, enriches with behavioral signals, updates contact scores
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5';

// Analyse a single email and return intelligence
export async function analyseEmail(email) {
  const prompt = `Analyse this email and return ONLY valid JSON (no markdown, no backticks):
From: ${email.from_address}
To: ${(email.to_addresses || []).join(', ')}
Subject: ${email.subject}
Date: ${email.date}
Body: ${(email.body_text || email.snippet || '').slice(0, 1500)}

Return JSON with:
{
  "category": "outreach|follow_up|negotiation|administrative|newsletter|notification|personal|cold_inbound",
  "tone": "formal|casual|urgent|warm|cold|neutral",
  "sentiment": "positive|neutral|negative",
  "has_action_items": true/false,
  "action_items": ["item1", "item2"],
  "has_commitment": true/false,
  "commitments": ["commitment1"],
  "is_automated": true/false,
  "commercial_relevance": 0-10,
  "key_topics": ["topic1", "topic2"]
}`;

  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content?.[0]?.text || '{}';
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch (e) {
    console.error('[Intelligence] Haiku error:', e.message);
    return null;
  }
}

// Update per-contact email scores from all their emails
export async function updateContactScore(userEmail, contactEmail) {
  // Get all emails between user and contact
  const { data: emails } = await supabase.from('emails')
    .select('date, from_address, to_addresses, intelligence, subject')
    .eq('user_email', userEmail)
    .or(`from_address.ilike.%${contactEmail}%,to_addresses.cs.{${contactEmail}}`)
    .order('date', { ascending: true });

  if (!emails?.length) return null;

  const sent = emails.filter(e => !(e.from_address || '').toLowerCase().includes(contactEmail.toLowerCase()));
  const received = emails.filter(e => (e.from_address || '').toLowerCase().includes(contactEmail.toLowerCase()));
  const lastEmail = emails[emails.length - 1];
  const firstEmail = emails[0];
  const now = new Date();
  const daysSinceLast = lastEmail?.date ? Math.floor((now - new Date(lastEmail.date)) / 86400000) : 999;

  // Response time calculation
  let responseTimes = [];
  for (let i = 1; i < emails.length; i++) {
    const prev = emails[i - 1], curr = emails[i];
    const prevFrom = (prev.from_address || '').toLowerCase();
    const currFrom = (curr.from_address || '').toLowerCase();
    if (prevFrom !== currFrom) { // Direction change = response
      const hours = (new Date(curr.date) - new Date(prev.date)) / 3600000;
      if (hours > 0 && hours < 720) responseTimes.push(hours); // cap at 30 days
    }
  }
  const avgResponseHours = responseTimes.length ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : null;
  const typicalResponseDays = avgResponseHours ? avgResponseHours / 24 : null;

  // Engagement score (0-100)
  let engagement = 50;
  if (emails.length > 20) engagement += 15;
  else if (emails.length > 10) engagement += 10;
  else if (emails.length > 5) engagement += 5;
  if (received.length > sent.length) engagement += 10; // They initiate more
  if (daysSinceLast < 7) engagement += 15;
  else if (daysSinceLast < 14) engagement += 5;
  else if (daysSinceLast > 30) engagement -= 15;
  else if (daysSinceLast > 60) engagement -= 25;
  engagement = Math.max(0, Math.min(100, engagement));

  // Staleness score (0-100, higher = more stale)
  let staleness = 0;
  if (typicalResponseDays && daysSinceLast > typicalResponseDays * 2) staleness = 60;
  if (daysSinceLast > 30) staleness = Math.min(100, staleness + 20);
  if (daysSinceLast > 60) staleness = 90;
  if (daysSinceLast > 90) staleness = 100;

  // Momentum: compare recent 30 days vs prior 30 days
  const thirtyDaysAgo = new Date(now - 30 * 86400000);
  const sixtyDaysAgo = new Date(now - 60 * 86400000);
  const recentEmails = emails.filter(e => new Date(e.date) > thirtyDaysAgo).length;
  const priorEmails = emails.filter(e => new Date(e.date) > sixtyDaysAgo && new Date(e.date) <= thirtyDaysAgo).length;
  let momentum = 'stable';
  if (recentEmails > priorEmails * 1.5) momentum = 'rising';
  else if (recentEmails < priorEmails * 0.5 && priorEmails > 0) momentum = 'declining';
  else if (daysSinceLast > 45) momentum = 'cold';

  // Relationship health (0-100)
  let health = engagement;
  if (momentum === 'rising') health = Math.min(100, health + 10);
  if (momentum === 'declining') health = Math.max(0, health - 15);
  if (momentum === 'cold') health = Math.max(0, health - 25);
  // Reciprocity bonus: both sides initiating
  if (sent.length > 0 && received.length > 0) {
    const ratio = Math.min(sent.length, received.length) / Math.max(sent.length, received.length);
    health = Math.min(100, health + Math.floor(ratio * 10));
  }

  // Tone trend from intelligence data
  const recentIntel = emails.slice(-5).map(e => e.intelligence?.sentiment).filter(Boolean);
  let toneTrend = 'neutral';
  const posCount = recentIntel.filter(s => s === 'positive').length;
  const negCount = recentIntel.filter(s => s === 'negative').length;
  if (posCount > negCount + 1) toneTrend = 'warming';
  if (negCount > posCount + 1) toneTrend = 'cooling';

  // Follow-up recommendation
  let nextFollowup = null, followupReason = null;
  if (staleness > 50) {
    nextFollowup = new Date().toISOString();
    followupReason = `${daysSinceLast} days since last contact — relationship at risk`;
  } else if (momentum === 'declining') {
    nextFollowup = new Date(now.getTime() + 3 * 86400000).toISOString();
    followupReason = 'Communication declining — proactive re-engagement recommended';
  } else if (sent.length > received.length + 3) {
    followupReason = 'One-sided communication — they owe a response';
  }

  // Extract contact name from email header
  const fromHeader = received[0]?.from_address || '';
  const nameMatch = fromHeader.match(/^([^<]+)</);
  const contactName = nameMatch ? nameMatch[1].trim() : contactEmail;

  // Action items from recent emails
  const actionItems = emails.slice(-3)
    .flatMap(e => e.intelligence?.action_items || [])
    .slice(0, 5);

  const score = {
    org_id: ORG_ID, user_email: userEmail, contact_email: contactEmail,
    contact_name: contactName,
    total_emails: emails.length, sent_count: sent.length, received_count: received.length,
    avg_response_hours: avgResponseHours, typical_response_days: typicalResponseDays,
    last_contact_date: lastEmail?.date, first_contact_date: firstEmail?.date,
    days_since_last_contact: daysSinceLast,
    relationship_health: health, engagement_score: engagement,
    staleness_score: staleness, momentum, tone_trend: toneTrend,
    next_followup_recommended: nextFollowup, followup_reason: followupReason,
    last_action_items: actionItems,
    last_analysed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };

  await supabase.from('email_scores').upsert(score, { onConflict: 'user_email,contact_email' });
  return score;
}

// Process batch of unanalysed emails
export async function processUnanalysedEmails(userEmail, limit = 20) {
  const { data: emails } = await supabase.from('emails')
    .select('*')
    .eq('user_email', userEmail)
    .or('intelligence.is.null,intelligence.eq.{}')
    .order('date', { ascending: false })
    .limit(limit);

  if (!emails?.length) return { processed: 0 };

  let processed = 0;
  const contactsToScore = new Set();
  for (const email of emails) {
    const intel = await analyseEmail(email);
    if (intel) {
      await supabase.from('emails').update({ intelligence: intel }).eq('id', email.id);
      processed++;
      // Track unique contacts for scoring
      const fromAddr = (email.from_address || '').match(/<([^>]+)>/)?.[1] || email.from_address || '';
      if (fromAddr && !fromAddr.includes(userEmail)) contactsToScore.add(fromAddr.toLowerCase());
      for (const to of (email.to_addresses || [])) {
        const addr = to.match(/<([^>]+)>/)?.[1] || to;
        if (addr && !addr.includes(userEmail)) contactsToScore.add(addr.toLowerCase());
      }
    }
  }

  // Update scores for all involved contacts
  let scored = 0;
  for (const contact of contactsToScore) {
    await updateContactScore(userEmail, contact);
    scored++;
  }

  return { processed, scored, contacts: contactsToScore.size };
}

// API handler — callable via POST /api/email-intelligence
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { action, email: userEmail = 'sunny@vanhawke.com', limit = 20, contactEmail } = req.body;

  if (action === 'process') {
    // Process unanalysed emails
    const result = await processUnanalysedEmails(userEmail, limit);
    return res.json(result);
  }

  if (action === 'score' && contactEmail) {
    // Score a specific contact
    const score = await updateContactScore(userEmail, contactEmail);
    return res.json(score || { error: 'No emails found' });
  }

  if (action === 'stale') {
    // Get stale contacts needing follow-up
    const { data } = await supabase.from('email_scores')
      .select('*')
      .eq('user_email', userEmail)
      .gt('staleness_score', 40)
      .order('staleness_score', { ascending: false })
      .limit(20);
    return res.json({ stale: data || [] });
  }

  if (action === 'dashboard') {
    // Summary stats
    const { data: scores } = await supabase.from('email_scores')
      .select('*').eq('user_email', userEmail);
    if (!scores?.length) return res.json({ total: 0 });
    const rising = scores.filter(s => s.momentum === 'rising').length;
    const declining = scores.filter(s => s.momentum === 'declining').length;
    const cold = scores.filter(s => s.momentum === 'cold').length;
    const needsFollowup = scores.filter(s => s.staleness_score > 50).length;
    const avgHealth = Math.round(scores.reduce((a, s) => a + s.relationship_health, 0) / scores.length);
    return res.json({ total: scores.length, rising, declining, cold, needsFollowup, avgHealth });
  }

  return res.status(400).json({ error: 'action required: process|score|stale|dashboard' });
}
