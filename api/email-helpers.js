// api/email-helpers.js — Gmail message parsing and MIME building utilities

export function parseGmailMessage(msg) {
  const headers = msg.payload?.headers || [];
  const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
  const from = getHeader('From');
  const to = getHeader('To').split(',').map(s => s.trim()).filter(Boolean);
  const cc = getHeader('Cc').split(',').map(s => s.trim()).filter(Boolean);
  const subject = getHeader('Subject');
  const date = getHeader('Date');
  let bodyHtml = '', bodyText = '';
  extractBody(msg.payload, (html, text) => { bodyHtml = html; bodyText = text; });
  return {
    gmail_id: msg.id, thread_id: msg.threadId, from_address: from, to_addresses: to,
    cc_addresses: cc.length > 0 ? cc : null, subject, snippet: msg.snippet || '',
    body_html: bodyHtml, body_text: bodyText, labels: msg.labelIds || [],
    is_read: !(msg.labelIds || []).includes('UNREAD'),
    is_starred: (msg.labelIds || []).includes('STARRED'),
    date: date ? new Date(date).toISOString() : new Date().toISOString(),
    has_attachments: hasAttachments(msg.payload),
    attachments: extractAttachments(msg.payload, msg.id),
  };
}

function extractBody(part, cb) {
  if (!part) return;
  if (part.mimeType === 'text/html' && part.body?.data) { cb(base64UrlDecode(part.body.data), ''); return; }
  if (part.mimeType === 'text/plain' && part.body?.data) { cb('', base64UrlDecode(part.body.data)); return; }
  if (part.parts) {
    let html = '', text = '';
    for (const p of part.parts) { extractBody(p, (h, t) => { if (h) html = h; if (t) text = t; }); }
    cb(html, text);
  }
}

function hasAttachments(part) {
  if (!part) return false;
  if (part.filename && part.filename.length > 0) return true;
  if (part.parts) return part.parts.some(p => hasAttachments(p));
  return false;
}

function extractAttachments(part, msgId) {
  const atts = [];
  if (!part) return atts;
  if (part.filename && part.filename.length > 0 && part.body?.attachmentId) {
    atts.push({ id: part.body.attachmentId, filename: part.filename, mimeType: part.mimeType, size: part.body.size || 0, messageId: msgId });
  }
  if (part.parts) part.parts.forEach(p => atts.push(...extractAttachments(p, msgId)));
  return atts;
}

function base64UrlDecode(data) {
  try { return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8'); }
  catch { return ''; }
}

export function buildMimeMessage({ to, cc, bcc, subject, body_html, in_reply_to, attachments }) {
  const altBoundary = `alt_${Date.now()}`;
  const mixBoundary = `mix_${Date.now() + 1}`;
  const hasAtts = attachments && attachments.length > 0;
  let mime = `To: ${to}\r\n`;
  if (cc) mime += `Cc: ${cc}\r\n`;
  if (bcc) mime += `Bcc: ${bcc}\r\n`;
  mime += `Subject: ${subject}\r\nMIME-Version: 1.0\r\n`;
  if (in_reply_to) mime += `In-Reply-To: <${in_reply_to}>\r\nReferences: <${in_reply_to}>\r\n`;
  if (hasAtts) {
    mime += `Content-Type: multipart/mixed; boundary="${mixBoundary}"\r\n\r\n--${mixBoundary}\r\n`;
    mime += `Content-Type: multipart/alternative; boundary="${altBoundary}"\r\n\r\n`;
  } else {
    mime += `Content-Type: multipart/alternative; boundary="${altBoundary}"\r\n\r\n`;
  }
  const plain = (body_html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
  mime += `--${altBoundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${plain}\r\n`;
  mime += `--${altBoundary}\r\nContent-Type: text/html; charset="UTF-8"\r\n\r\n${body_html || ''}\r\n`;
  mime += `--${altBoundary}--\r\n`;
  if (hasAtts) {
    for (const att of attachments) {
      mime += `--${mixBoundary}\r\nContent-Type: ${att.type}; name="${att.name}"\r\n`;
      mime += `Content-Disposition: attachment; filename="${att.name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${att.base64}\r\n`;
    }
    mime += `--${mixBoundary}--`;
  }
  return Buffer.from(mime).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
