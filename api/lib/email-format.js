// api/lib/email-format.js — Global email rendering + voice + signature
// Helvetica 12 / line-height 1.5 / #000000 / signature injection based on contact status
// Loads voice profile learned from user's actual sent emails

export function wrapEmailBody(body, { contactStatus = 'cold', signature = '', coldSignature = '' } = {}) {
  // Aggressive sign-off stripping. Drafts should NEVER include a name/title/sig
  // because the user's Gmail signature is auto-appended at send time. Multiple
  // layers because LLMs sometimes ignore the prompt instruction.
  let cleanBody = (body || '').trim();

  // Layer 1: cut at any sign-off opener line if found (everything after is signature block)
  // This catches the WHOLE sign-off block including all lines that follow
  const signOffOpener = /\n\s*(Best regards|Kind regards|Warm regards|Best wishes|Regards|Sincerely|Cheers|Thanks(?: again)?|Thank you|All the best|Yours sincerely|Yours truly|Speak soon|Talk soon|Best,|Cheers,)[\s,.]*(\n|$)/i;
  const m = cleanBody.match(signOffOpener);
  if (m) cleanBody = cleanBody.slice(0, m.index).trimEnd();

  // Layer 2: strip any trailing lines that look like name/title/company (defensive)
  // Iterate from the end, drop lines until we hit a real content line
  const lines = cleanBody.split('\n');
  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim();
    if (!last) { lines.pop(); continue; }  // empty trailing
    // Trailing line patterns to strip
    if (/^(sunny\s*sidhu|sunny\b)$/i.test(last)) { lines.pop(); continue; }
    if (/^(ceo|founder|founder\s*&\s*(principal|ceo)|principal|chief\s+\w+\s+officer)\s*[,.]?\s*van\s*hawke/i.test(last)) { lines.pop(); continue; }
    if (/^(ceo|founder|founder\s*&\s*(principal|ceo)|principal)\s*[,.]?\s*$/i.test(last)) { lines.pop(); continue; }
    if (/^van\s*hawke\b/i.test(last)) { lines.pop(); continue; }
    if (/^—+\s*sunny/i.test(last)) { lines.pop(); continue; }
    // No more match — stop trimming
    break;
  }
  cleanBody = lines.join('\n').trimEnd();

  // Layer 3: collapse triple newlines
  cleanBody = cleanBody.replace(/\n{3,}/g, '\n\n').trim();

  const htmlBody = cleanBody
    .split('\n\n')
    .map(p => `<p style="margin:0 0 12px 0">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
  // Normalize: if signature was pasted as plain text (no HTML tags), convert \n → <br>
  const sigToUse = contactStatus === 'cold'
    ? normalizeSig(coldSignature || stripLogoFromSignature(signature) || DEFAULT_COLD_SIG)
    : normalizeSig(signature || DEFAULT_WARM_SIG);
  const wrapped = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:400;line-height:1.5;color:#000000">${htmlBody}${sigToUse ? `<div style="margin-top:20px">${sigToUse}</div>` : ''}</div>`;
  const plainText = `${cleanBody}\n\n${stripHtml(sigToUse)}`.trim();
  return { html: wrapped, text: plainText };
}

// If signature has no HTML tags, treat as plain text and convert newlines to <br>
function normalizeSig(sig) {
  if (!sig) return '';
  const trimmed = sig.trim();
  if (!/<[a-z][\s\S]*>/i.test(trimmed)) {
    return trimmed.replace(/\n/g, '<br>');
  }
  return trimmed;
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

export async function loadUserSignatures(sbFetch, userId, accessToken = null, fromEmail = null) {
  // PRIORITY 1: Native Gmail signature via Gmail API (single source of truth)
  // Uses the user's actual Gmail signature configured at https://mail.google.com/mail/u/0/#settings/general
  if (accessToken) {
    try {
      const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (r.ok) {
        const data = await r.json();
        // Match by sendAsEmail when fromEmail provided (e.g. sunny@vanhawke.agency alias),
        // otherwise fall back to primary. This ensures the right signature for the right alias.
        const sendAsList = data.sendAs || [];
        const primary = (fromEmail && sendAsList.find(s => s.sendAsEmail?.toLowerCase() === fromEmail.toLowerCase()))
          || sendAsList.find(s => s.isPrimary)
          || sendAsList[0];
        if (primary?.signature) {
          // Gmail returns HTML signature with images embedded as cid: refs that resolve client-side
          // OR as https:// URLs if user uploaded via "Insert image from URL". Either way, use as-is.
          return {
            signature: primary.signature,
            coldSignature: stripLogoFromSignature(primary.signature) || primary.signature,
            source: 'gmail',
          };
        }
      }
    } catch (e) {
      console.warn('[email-format] Gmail signature fetch failed, falling back to Supabase:', e.message);
    }
  }

  // PRIORITY 2: Supabase stored signature (legacy fallback only)
  try {
    const uf = userId ? `&user_id=eq.${userId}` : '';
    const rows = await sbFetch(`kiko_user_config?select=email_signature_html,email_signature_cold_html${uf}&limit=1`);
    if (rows?.[0]) {
      return {
        signature: rows[0].email_signature_html || DEFAULT_WARM_SIG,
        coldSignature: rows[0].email_signature_cold_html || DEFAULT_COLD_SIG,
        source: 'supabase',
      };
    }
  } catch {}
  return { signature: DEFAULT_WARM_SIG, coldSignature: DEFAULT_COLD_SIG, source: 'default' };
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
