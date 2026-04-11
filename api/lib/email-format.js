// api/lib/email-format.js — Global email rendering + voice + signature
// Helvetica 12 / line-height 1.5 / #000000 / signature injection based on contact status
// Loads voice profile learned from user's actual sent emails

export function wrapEmailBody(body, { contactStatus = 'cold', signature = '', coldSignature = '' } = {}) {
  // Strip sign-off NAME/TITLE block but KEEP the sign-off word itself.
  // Email body should look like: "...your CTA. Kind regards," then signature appended.
  // What we want to remove: "Sunny Sidhu / Founder & Principal / Van Hawke" lines that
  // Claude sometimes writes despite being told not to. The signature is added separately.
  let cleanBody = (body || '').trim();

  // First: strip any markdown sign-off Claude wrote with HIS name/title
  // Looks like: "Kind regards,\nSunny Sidhu\nFounder & Principal\nVan Hawke"
  // We want to KEEP "Kind regards," and strip the rest.
  const lines = cleanBody.split('\n');
  // Walk from the end backwards, drop lines that look like name/title/company
  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim();
    if (!last) { lines.pop(); continue; }  // empty trailing
    if (/^(sunny\s*sidhu|sunny|sidhu)$/i.test(last)) { lines.pop(); continue; }
    if (/^(founder|founder\s*&\s*(principal|ceo)|principal|ceo|chief\s+\w+\s+officer)\s*[,.]?\s*(van\s*hawke|group|inc\.?)?$/i.test(last)) { lines.pop(); continue; }
    if (/^van\s*hawke(\s*group)?(\s*inc\.?)?$/i.test(last)) { lines.pop(); continue; }
    if (/^—+\s*sunny/i.test(last)) { lines.pop(); continue; }
    if (/^\{?signature\}?$/i.test(last)) { lines.pop(); continue; }  // strip {signature} placeholder, we add real one
    // Stop trimming as soon as we hit a real content line OR a sign-off word
    break;
  }
  cleanBody = lines.join('\n').trimEnd();

  // ENSURE sign-off exists. If body doesn't end with one, add "Kind regards,"
  const signOffPattern = /\n\s*(Best regards|Kind regards|Warm regards|Best wishes|Regards|Sincerely|Cheers|Many thanks|Thanks|Thank you|All the best|Yours sincerely|Speak soon)\s*[,.]?\s*$/i;
  if (!signOffPattern.test(cleanBody)) {
    cleanBody = cleanBody + '\n\nKind regards,';
  }

  // ENSURE greeting exists. If body doesn't start with one, prepend "Dear {firstName},"
  const greetingPattern = /^\s*(Dear|Hi|Hello|Hey)\s+\{?[A-Za-z]/i;
  if (!greetingPattern.test(cleanBody)) {
    cleanBody = `Dear {firstName},\n\n${cleanBody}`;
  }

  // Collapse triple newlines
  cleanBody = cleanBody.replace(/\n{3,}/g, '\n\n').trim();

  const htmlBody = cleanBody
    .split('\n\n')
    .map(p => `<p style="margin:0 0 12px 0">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
  // Append the actual user signature after the sign-off line
  const sigToUse = contactStatus === 'cold'
    ? normalizeSig(coldSignature || stripLogoFromSignature(signature) || DEFAULT_COLD_SIG)
    : normalizeSig(signature || DEFAULT_WARM_SIG);
  const wrapped = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:400;line-height:1.5;color:#000000">${htmlBody}${sigToUse ? `<div style="margin-top:12px">${sigToUse}</div>` : ''}</div>`;
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
  if (accessToken) {
    try {
      const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (r.ok) {
        const data = await r.json();
        const sendAsList = data.sendAs || [];
        const primary = (fromEmail && sendAsList.find(s => s.sendAsEmail?.toLowerCase() === fromEmail.toLowerCase()))
          || sendAsList.find(s => s.isPrimary)
          || sendAsList[0];
        if (primary?.signature) {
          // Extract cid: refs and ensure they're cached. The actual MIME attachment
          // happens at send time in buildRawEmail (cron-sequence-sender + send-test-email).
          const cids = extractCidsFromHtml(primary.signature);
          let inlineImages = [];
          if (cids.length > 0 && fromEmail) {
            inlineImages = await ensureCidImagesCached(sbFetch, accessToken, fromEmail, cids);
          }
          return {
            signature: primary.signature,
            coldSignature: stripLogoFromSignature(primary.signature) || primary.signature,
            inlineImages,  // [{ cid, contentType, filename, dataBase64 }]
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

// ─────────────────────────────────────────────────────────────────────
// Gmail signature inline image extraction & caching
//
// Problem: Gmail returns the signature HTML with `<img src="cid:ii_xyz">` refs.
// These cid: refs only resolve when the outgoing email is constructed as
// multipart/related with the actual image bytes attached as parts that have
// matching `Content-ID: <ii_xyz>` headers. Otherwise the recipient sees a
// broken-image icon.
//
// Solution: extract the cid list from the signature HTML, then look at the
// user's recent sent messages (where Gmail itself attached the image bytes
// inline) and pull the bytes via the attachments API. Cache them in
// kiko_signature_images so we don't refetch on every send.
//
// On send, buildRawEmail() in cron-sequence-sender.js + send-test-email.js
// constructs the multipart/related body with these attachments.
// ─────────────────────────────────────────────────────────────────────

export function extractCidsFromHtml(html) {
  if (!html) return [];
  const cids = new Set();
  const regex = /src=["']cid:([^"'>]+)["']/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    if (m[1]) cids.add(m[1].trim());
  }
  return Array.from(cids);
}

export async function ensureCidImagesCached(sbFetch, accessToken, userEmail, cids) {
  if (!cids || cids.length === 0) return [];
  // Check cache first
  const cidList = cids.map(c => `"${c.replace(/"/g, '')}"`).join(',');
  const cached = await sbFetch(
    `kiko_signature_images?user_email=eq.${encodeURIComponent(userEmail)}&cid=in.(${cidList})&select=cid,content_type,filename,data_base64`
  );
  const cachedMap = new Map((cached || []).map(r => [r.cid, r]));

  const missing = cids.filter(c => !cachedMap.has(c));
  if (missing.length === 0) {
    return Array.from(cachedMap.values()).map(r => ({
      cid: r.cid, contentType: r.content_type, filename: r.filename, dataBase64: r.data_base64
    }));
  }

  // For each missing cid, find a sent message that contains it and extract the bytes
  // Search for sent emails by this user that have multipart/related (likely contain
  // signature images). Take the most recent 20 to scan.
  try {
    const listRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=from:me+has:attachment&maxResults=30',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!listRes.ok) {
      console.warn('[email-format] Gmail message list failed:', listRes.status);
      return Array.from(cachedMap.values()).map(r => ({
        cid: r.cid, contentType: r.content_type, filename: r.filename, dataBase64: r.data_base64
      }));
    }
    const listData = await listRes.json();
    const messageIds = (listData.messages || []).map(m => m.id).slice(0, 20);

    // Fetch each message in parallel and look for matching cid attachments
    const found = new Map();
    await Promise.all(messageIds.map(async (mid) => {
      try {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${mid}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!msgRes.ok) return;
        const msg = await msgRes.json();
        // Walk the payload tree looking for parts with Content-ID matching our cids
        const parts = flattenParts(msg.payload);
        for (const part of parts) {
          const cidHeader = (part.headers || []).find(h =>
            h.name?.toLowerCase() === 'content-id'
          );
          if (!cidHeader?.value) continue;
          // Header is like "<ii_xyz>" — strip angle brackets
          const partCid = cidHeader.value.replace(/^<|>$/g, '').trim();
          if (missing.includes(partCid) && !found.has(partCid) && part.body?.attachmentId) {
            // Fetch the attachment bytes
            const attRes = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${mid}/attachments/${part.body.attachmentId}`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            if (!attRes.ok) continue;
            const attData = await attRes.json();
            // Gmail returns base64url — convert to standard base64
            const dataBase64 = (attData.data || '').replace(/-/g, '+').replace(/_/g, '/');
            found.set(partCid, {
              cid: partCid,
              contentType: part.mimeType || 'image/png',
              filename: part.filename || `${partCid}.png`,
              dataBase64,
              sourceMessageId: mid,
            });
          }
        }
      } catch (e) {
        console.warn(`[email-format] Failed to scan message ${mid}:`, e.message);
      }
    }));

    // Persist found images to cache
    for (const img of found.values()) {
      try {
        await sbFetch('kiko_signature_images', {
          method: 'POST',
          headers: { 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify({
            user_email: userEmail,
            cid: img.cid,
            content_type: img.contentType,
            filename: img.filename,
            data_base64: img.dataBase64,
            size_bytes: Math.floor(img.dataBase64.length * 0.75),
            source_message_id: img.sourceMessageId,
          }),
        });
      } catch (e) {
        console.warn(`[email-format] Failed to cache cid ${img.cid}:`, e.message);
      }
    }

    // Combine cached + freshly found
    const all = [
      ...Array.from(cachedMap.values()).map(r => ({
        cid: r.cid, contentType: r.content_type, filename: r.filename, dataBase64: r.data_base64
      })),
      ...Array.from(found.values()).map(img => ({
        cid: img.cid, contentType: img.contentType, filename: img.filename, dataBase64: img.dataBase64
      })),
    ];
    return all;
  } catch (err) {
    console.error('[email-format] cid image extraction failed:', err.message);
    return Array.from(cachedMap.values()).map(r => ({
      cid: r.cid, contentType: r.content_type, filename: r.filename, dataBase64: r.data_base64
    }));
  }
}

function flattenParts(payload) {
  if (!payload) return [];
  const out = [];
  if (payload.body) out.push(payload);
  if (payload.parts) {
    for (const p of payload.parts) out.push(...flattenParts(p));
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// MIME builder for outgoing emails with inline signature images.
// Constructs a multipart/related body so cid: refs in the HTML resolve
// against the attached image parts. Use this in cron-sequence-sender +
// send-test-email instead of constructing MIME inline.
// ─────────────────────────────────────────────────────────────────────

export function buildMimeWithInlineImages({ from, to, subject, htmlBody, plainBody, threadId, inlineImages = [] }) {
  const boundaryAlt = `b_alt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const boundaryRel = `b_rel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  let mime = '';
  mime += `To: ${to}\r\n`;
  mime += `From: ${from}\r\n`;
  mime += `Subject: ${subject}\r\n`;
  if (threadId) mime += `In-Reply-To: <${threadId}>\r\nReferences: <${threadId}>\r\n`;
  mime += `MIME-Version: 1.0\r\n`;

  if (inlineImages && inlineImages.length > 0) {
    // multipart/related wraps multipart/alternative + image attachments
    mime += `Content-Type: multipart/related; boundary="${boundaryRel}"\r\n\r\n`;
    mime += `--${boundaryRel}\r\n`;
    mime += `Content-Type: multipart/alternative; boundary="${boundaryAlt}"\r\n\r\n`;
    mime += `--${boundaryAlt}\r\n`;
    mime += `Content-Type: text/plain; charset="UTF-8"\r\n`;
    mime += `Content-Transfer-Encoding: 7bit\r\n\r\n`;
    mime += `${plainBody || ''}\r\n\r\n`;
    mime += `--${boundaryAlt}\r\n`;
    mime += `Content-Type: text/html; charset="UTF-8"\r\n`;
    mime += `Content-Transfer-Encoding: 7bit\r\n\r\n`;
    mime += `${htmlBody || ''}\r\n\r\n`;
    mime += `--${boundaryAlt}--\r\n\r\n`;

    // Append each inline image as a related part with matching Content-ID
    for (const img of inlineImages) {
      mime += `--${boundaryRel}\r\n`;
      mime += `Content-Type: ${img.contentType || 'image/png'}; name="${img.filename || img.cid}"\r\n`;
      mime += `Content-Transfer-Encoding: base64\r\n`;
      mime += `Content-ID: <${img.cid}>\r\n`;
      mime += `Content-Disposition: inline; filename="${img.filename || img.cid}"\r\n\r\n`;
      // Wrap base64 at 76 chars per line per RFC 2045
      const wrapped = (img.dataBase64 || '').replace(/(.{76})/g, '$1\r\n');
      mime += `${wrapped}\r\n\r\n`;
    }
    mime += `--${boundaryRel}--`;
  } else {
    // No inline images — simple multipart/alternative
    mime += `Content-Type: multipart/alternative; boundary="${boundaryAlt}"\r\n\r\n`;
    mime += `--${boundaryAlt}\r\n`;
    mime += `Content-Type: text/plain; charset="UTF-8"\r\n\r\n`;
    mime += `${plainBody || ''}\r\n`;
    mime += `--${boundaryAlt}\r\n`;
    mime += `Content-Type: text/html; charset="UTF-8"\r\n\r\n`;
    mime += `${htmlBody || ''}\r\n`;
    mime += `--${boundaryAlt}--`;
  }

  // Encode to base64url for Gmail API
  return Buffer.from(mime).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
