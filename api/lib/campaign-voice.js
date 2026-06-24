// api/lib/campaign-voice.js
//
// FIRM-LEVEL campaign voice. This is the house's category-ownership outreach register for cold
// CAMPAIGN BLASTS — NOT any operator's personal voice. It is deliberately separate from the
// per-operator {base, registers} profiles: who a blast sends AS (signature, From) is an identity
// concern; how a blast is WRITTEN is a firm concern. A personal 1:1 cold email uses an operator's
// registers.cold (register-neutral, no pitch) via resolveVoiceContext; a campaign blast uses THIS
// (the category framing is legitimate here, and only here).
//
// Sourced from the OUTREACH DOCTRINE in the brain system prompt. It carries the POSTURE and the
// forbidden/preferred phrase lists, but NOT a hardcoded scarcity sentence ("only N positions remain").
// How many positions, which category, and what status are PER-CAMPAIGN facts (template vars / company
// intel); a fixed scarcity line in the firm store would eventually assert something untrue for the
// campaign it is stamped onto. Posture in, specific claim out.
//
// Version-controlled on purpose: a change to the firm's outbound voice is a positioning decision and
// belongs in a commit with a diff, not a silent DB row edit. Promote to a row only if runtime tuning
// is ever genuinely needed.

export const CAMPAIGN_VOICE = {
  posture: [
    'Authority-led, board-level positioning. Write as a principal at a tier-1 advisory addressing a board member, never as a vendor or salesperson.',
    'Category control and scarcity by design: the firm structures category-exclusive partnerships; the value is the structural advantage of holding the category, not the activity itself.',
    'Long-term institutional positioning, not marketing spend.',
    'No pricing in early outreach. USD only. No attachments until a reply.',
    'Emails under 150 words; LinkedIn under 120 words; always a subject line. Reference something specific about the recipient or their sector position.',
  ],
  preferred: ['at this level', 'in practice', 'while the category remains open', 'long-term positioning', 'category-exclusive', 'structural advantage'],
  forbidden: ['hope this finds you well', 'just wanted to reach out', 'circle back', 'touch base', 'synergy', 'I think', 'maybe', 'hopefully', 'excited to', "please don't hesitate", "I'd love to", 'thrilled', 'delighted'],
  // Scarcity is a POSTURE here, never a fixed claim. The specific count / category / status of open
  // positions is supplied per-campaign, never hardcoded in this store.
};

// Renders the firm campaign voice as a prompt-injection block. Drop-in replacement for the per-operator
// voiceProfileToPrompt(...) the enqueue used to call — same role (extra system-prompt guidance), but
// firm-level and identical regardless of which operator's address the blast sends from.
export function campaignVoicePrompt() {
  const v = CAMPAIGN_VOICE;
  return [
    "FIRM CAMPAIGN VOICE (the house's outreach register — this is firm voice, not a personal voice):",
    ...v.posture.map(p => `- ${p}`),
    `- Preferred phrasings where they fit naturally: ${v.preferred.join(', ')}.`,
    `- Never use: ${v.forbidden.join(', ')}.`,
    '- Scarcity is a posture, not a fixed claim: state a specific number of open positions, a category, or a status ONLY if it is supplied for THIS campaign. Never invent or hardcode a count.',
    '- Never use em-dashes or en-dashes.',
  ].join('\n');
}

export default campaignVoicePrompt;
