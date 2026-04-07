// api/lib/email-format.js — Global email rendering + voice + signature
// Helvetica 12 / line-height 1.5 / #000000 / signature injection based on contact status
// Loads voice profile learned from user's actual sent emails

export function wrapEmailBody(body, { contactStatus = 'cold', signature = '', coldSignature = '' } = {}) {
  const cleanBody = (body || '')
    .replace(/Best regards,?\s*Sunny\s*(Sidhu)?/gi, '')
    .replace(/Kind regards,?\s*Sunny\s*(Sidhu)?/gi, '')
    .replace(/Regards,?\s*Sunny\s*(Sidhu)?/gi, '')
    .replace(/Sincerely,?\s*Sunny\s*(Sidhu)?/gi, '')
    .replace(/\n\s*Van Hawke.*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const htmlBody = cleanBody
    .split('\n\n')
    .map(p => `<p style="margin:0 0 12px 0">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
  const sigToUse = contactStatus === 'cold'
    ? (coldSignature || stripLogoFromSignature(signature) || DEFAULT_COLD_SIG)
    : (signature || DEFAULT_WARM_SIG);
  const wrapped = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:400;line-height:1.5;color:#000000">${htmlBody}${sigToUse ? `<div style="margin-top:20px">${sigToUse}</div>` : ''}</div>`;
  const plainText = `${cleanBody}\n\n${stripHtml(sigToUse)}`.trim();
  return { html: wrapped, text: plainText };
}

function stripLogoFromSignature(sig) {
  if (!sig) return '';
  return sig.replace(/<img[^>]*>/gi, '').replace(/\s{2,}/g, ' ').trim();
}

function stripHtml(html) {
  return (html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const DEFAULT_COLD_SIG = `—<br><strong>Sunny</strong><br>Founder &amp; CEO<br>Van Hawke<br><a href="mailto:sunny@vanhawke.com">sunny@vanhawke.com</a><br><a href="https://www.vanhawke.com">www.vanhawke.com</a>`;
const DEFAULT_WARM_SIG = `${DEFAULT_COLD_SIG}<br>(786) 828-6126`;

export async function loadUserSignatures(sbFetch, userId) {
  try {
    const uf = userId ? `&user_id=eq.${userId}` : '';
    const rows = await sbFetch(`kiko_user_config?select=email_signature_html,email_signature_cold_html${uf}&limit=1`);
    if (rows?.[0]) {
      return {
        signature: rows[0].email_signature_html || DEFAULT_WARM_SIG,
        coldSignature: rows[0].email_signature_cold_html || DEFAULT_COLD_SIG,
      };
    }
  } catch {}
  return { signature: DEFAULT_WARM_SIG, coldSignature: DEFAULT_COLD_SIG };
}

export async function loadVoiceProfile(sbFetch, userId) {
  try {
    const uf = userId ? `&user_id=eq.${userId}` : '';
    const rows = await sbFetch(`kiko_user_config?select=email_voice_profile,voice_last_learned${uf}&limit=1`);
    if (rows?.[0]?.email_voice_profile && Object.keys(rows[0].email_voice_profile).length > 0) {
      return rows[0].email_voice_profile;
    }
  } catch {}
  return null;
}

export function voiceProfileToPrompt(profile) {
  if (!profile) return '';
  const lines = ['USER VOICE PROFILE (match exactly when drafting — this was learned from their real sent emails):'];
  if (profile.formality) lines.push(`- Formality: ${profile.formality}`);
  if (profile.tone) lines.push(`- Tone: ${profile.tone}`);
  if (profile.avg_length) lines.push(`- Length: ${profile.avg_length}`);
  if (profile.opening_patterns?.length) lines.push(`- Opening style: ${profile.opening_patterns.slice(0, 3).join(' / ')}`);
  if (profile.closing_patterns?.length) lines.push(`- Closing style: ${profile.closing_patterns.slice(0, 3).join(' / ')}`);
  if (profile.preferred_phrases?.length) lines.push(`- Preferred phrases: ${profile.preferred_phrases.slice(0, 8).join(', ')}`);
  if (profile.forbidden_phrases?.length) lines.push(`- NEVER use: ${profile.forbidden_phrases.slice(0, 8).join(', ')}`);
  if (profile.sentence_structure) lines.push(`- Sentence structure: ${profile.sentence_structure}`);
  if (profile.signature_style) lines.push(`- Sign-off style: ${profile.signature_style}`);
  return lines.join('\n');
}
