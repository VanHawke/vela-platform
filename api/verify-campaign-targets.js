// api/verify-campaign-targets.js — Live verification of campaign targets.
//
// For each unverified target in a campaign, runs a web_search to confirm:
//   - Is the person still at this company?
//   - Is their title still accurate?
//   - If they moved, where did they go?
//
// Updates both campaign_targets.verification_status AND contacts.last_verified_at
// so the contact verification persists across campaigns.
//
// Designed to run in parallel batches to keep wall time under 60s.
// Called manually from the campaign UI before activation, OR by activate-campaign
// before flipping live.
//
// POST { campaign_id }
// Returns { verified, moved, left, unreachable, total, duration_ms }

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { resolveEmailForPerson } from './resolve-email.js';


const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

const BATCH_SIZE = 5;  // Parallel verifications per batch

async function verifyOne(target) {
  const name = target.decision_maker_name;
  const company = target.company_name;
  const title = target.decision_maker_title;
  if (!name || !company) {
    return { ...target, _result: 'unreachable', _notes: 'Missing name or company' };
  }

  const prompt = `Verify whether ${name} is currently working at ${company} as ${title || 'a decision-maker'}. Search the web (LinkedIn, company website, recent news) for current status.

Return ONLY this JSON format, nothing else:
{
  "still_at_company": true | false | null,
  "current_title": "string or null",
  "current_company": "string or null",
  "notes": "brief 1-line summary of what you found",
  "confidence": "high" | "medium" | "low"
}

If you cannot determine status with reasonable confidence, return still_at_company=null. If they moved, set still_at_company=false and current_company to where they moved.`;

  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const cleaned = text.replace(/```json|```/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return { ...target, _result: 'unreachable', _notes: 'No JSON in verification response' };
    const parsed = JSON.parse(match[0]);

    let verResult;
    if (parsed.still_at_company === true) verResult = 'verified_at_company';
    else if (parsed.still_at_company === false) verResult = 'moved_company';
    else verResult = 'unreachable';

    // Resolve best-available email with explicit confidence — only if still in seat (Session 77)
    let _email = target.decision_maker_email || null, _emailConfidence = null, _emailSource = null;
    if (verResult === 'verified_at_company') {
      try {
        const domain = _email && _email.includes('@') ? _email.split('@')[1] : null;
        const er = await resolveEmailForPerson({
          name, company, title: parsed.current_title || title, domain,
          knownEmail: _email, knownVerified: target.source === 'crm',
        });
        _email = er.email || _email; _emailConfidence = er.confidence || null; _emailSource = er.source || null;
      } catch {}
    }
    return {
      ...target,
      _result: verResult,
      _notes: parsed.notes || '',
      _current_title: parsed.current_title || null,
      _current_company: parsed.current_company || null,
      _confidence: parsed.confidence || 'low',
      _email, _email_confidence: _emailConfidence, _email_source: _emailSource,
    };
  } catch (err) {
    return { ...target, _result: 'unreachable', _notes: `Verification error: ${err.message}` };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { campaign_id, sequence_id, force, shortlist_only, shortlist_size } = req.body || {};
  const id = campaign_id || sequence_id;
  if (!id) return res.status(400).json({ error: 'campaign_id required' });

  const startedAt = Date.now();

  try {
    // 1. Pull all targets for this campaign that need verification
    const filterStatus = force ? '' : '&verification_status=eq.unverified';
    const { data: targets, error: tErr } = await supabase
      .from('campaign_targets')
      .select('id, rank, company_name, decision_maker_name, decision_maker_title, decision_maker_email, source, contact_id, verification_status')
      .eq('campaign_id', id);
    if (tErr) throw tErr;

    let toVerify = (targets || []).filter(t => force || t.verification_status === 'unverified');
    if (shortlist_only) {
      const N = shortlist_size || 8;
      toVerify = toVerify.filter(t => (t.rank || 999) <= N);
    }
    if (toVerify.length === 0) {
      return res.status(200).json({
        ok: true,
        message: 'Nothing to verify — all targets already have a verification status',
        total: targets?.length || 0,
        verified: targets?.filter(t => t.verification_status === 'verified_at_company').length || 0,
        moved: targets?.filter(t => t.verification_status === 'moved_company').length || 0,
        unreachable: targets?.filter(t => t.verification_status === 'unreachable').length || 0,
      });
    }

    // 2. Process in parallel batches of BATCH_SIZE
    const verified = [];
    for (let i = 0; i < toVerify.length; i += BATCH_SIZE) {
      const batch = toVerify.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map(verifyOne));
      verified.push(...results);
    }

    // 3. Update each target row + propagate to contacts table
    let nVerified = 0, nMoved = 0, nUnreachable = 0;
    for (const v of verified) {
      const newStatus = v._result;
      const verifiedAt = new Date().toISOString();

      // Update campaign_targets row
      await supabase.from('campaign_targets').update({
        verification_status: newStatus,
        verified_at: verifiedAt,
        decision_maker_title: v._current_title || v.decision_maker_title,
        decision_maker_email: v._email || v.decision_maker_email,
        email_confidence: v._email_confidence || null,
        email_source: v._email_source || null,
      }).eq('id', v.id);

      // Propagate to contacts table if this target is linked to a contact
      if (v.contact_id) {
        await supabase.from('contacts').update({
          last_verified_at: verifiedAt,
          still_at_company: newStatus === 'verified_at_company',
          verified_title: v._current_title || null,
          verification_notes: v._notes || null,
          verification_source: 'web_search',
        }).eq('id', v.contact_id);
      }

      if (newStatus === 'verified_at_company') nVerified++;
      else if (newStatus === 'moved_company') nMoved++;
      else nUnreachable++;
    }

    return res.status(200).json({
      ok: true,
      campaign_id: id,
      total_processed: verified.length,
      verified: nVerified,
      moved: nMoved,
      unreachable: nUnreachable,
      duration_ms: Date.now() - startedAt,
      emails_verified: verified.filter(v => v._email_confidence === 'verified').length,
      emails_sourced: verified.filter(v => v._email_confidence === 'sourced').length,
      emails_inferred: verified.filter(v => v._email_confidence === 'inferred').length,
      shortlist: verified
        .filter(v => v._result === 'verified_at_company')
        .map(v => ({ rank: v.rank, name: v.decision_maker_name, title: v._current_title || v.decision_maker_title, company: v.company_name, email: v._email, email_confidence: v._email_confidence, email_source: v._email_source })),
      moved_details: verified
        .filter(v => v._result === 'moved_company')
        .map(v => ({ name: v.decision_maker_name, was_at: v.company_name, now_at: v._current_company, notes: v._notes })),
    });
  } catch (err) {
    console.error('[verify-campaign-targets] error:', err);
    return res.status(500).json({ error: err.message || 'verification failed' });
  }
}
