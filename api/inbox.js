// api/inbox.js — Unified reply inbox API
// Lists all sequence replies, fetches Gmail threads, generates AI reply suggestions.
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

async function getGoogleAccessToken(userEmail) {
  const { data } = await supabase
    .from('user_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_email', userEmail)
    .eq('provider', 'google')
    .maybeSingle();
  if (!data?.access_token) throw new Error('No Google token');
  // If expired, refresh
  if (data.expires_at && new Date(data.expires_at) < new Date() && data.refresh_token) {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: data.refresh_token,
        grant_type: 'refresh_token',
      }),
    });
    const j = await r.json();
    if (j.access_token) {
      await supabase.from('user_tokens').update({
        access_token: j.access_token,
        expires_at: new Date(Date.now() + (j.expires_in || 3600) * 1000).toISOString(),
      }).eq('user_email', userEmail).eq('provider', 'google');
      return j.access_token;
    }
  }
  return data.access_token;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const action = req.query.action || 'list';

      if (action === 'list') {
        // List all replies — joined with enrollment + sequence + contact info
        const { data, error } = await supabase
          .from('kiko_outreach_queue')
          .select('id, to_name, to_email, company, subject, sent_at, reply_received_at, reply_snippet, reply_handled, gmail_thread_id, enrollment_id, step_number, body_plain, kiko_sequence_enrollments(sequence_id, status, kiko_sequences(name))')
          .not('reply_received_at', 'is', null)
          .order('reply_received_at', { ascending: false })
          .limit(100);
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ replies: data || [] });
      }

      if (action === 'thread') {
        // Fetch full Gmail thread for a given outreach queue row
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'id required' });
        const { data: row } = await supabase
          .from('kiko_outreach_queue')
          .select('gmail_thread_id, to_email, subject, body_plain')
          .eq('id', id)
          .single();
        if (!row?.gmail_thread_id) return res.status(404).json({ error: 'no thread id' });
        const token = await getGoogleAccessToken('sunny@vanhawke.com');
        const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${row.gmail_thread_id}?format=full`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const thread = await r.json();
        if (thread.error) return res.status(500).json({ error: thread.error.message });
        // Extract messages with from/date/snippet/body
        const messages = (thread.messages || []).map(m => {
          const headers = (m.payload?.headers || []).reduce((acc, h) => { acc[h.name.toLowerCase()] = h.value; return acc; }, {});
          let bodyText = '';
          const parts = m.payload?.parts || [m.payload];
          for (const p of parts) {
            if (p?.mimeType === 'text/plain' && p.body?.data) {
              bodyText += Buffer.from(p.body.data, 'base64').toString('utf-8');
            }
          }
          return {
            id: m.id,
            from: headers.from,
            date: headers.date,
            subject: headers.subject,
            snippet: m.snippet,
            body: bodyText.slice(0, 5000),
          };
        });
        return res.status(200).json({ messages });
      }

      if (action === 'suggest') {
        // Generate Haiku-suggested reply for a given outreach queue row
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'id required' });
        const { data: row } = await supabase
          .from('kiko_outreach_queue')
          .select('to_name, to_email, company, subject, body_plain, reply_snippet, gmail_thread_id, kiko_sequence_enrollments(kiko_sequences(name, target_persona))')
          .eq('id', id)
          .single();
        if (!row) return res.status(404).json({ error: 'not found' });
        const seqName = row.kiko_sequence_enrollments?.kiko_sequences?.name || 'outreach';
        const persona = row.kiko_sequence_enrollments?.kiko_sequences?.target_persona || '';
        const prompt = `You are Sunny Sidhu, CEO of Van Hawke Group (F1/Formula E sponsorship advisory). A prospect replied to your outreach. Draft a SHORT, executive-toned reply (2-3 sentences max, no fluff, no "I hope this finds you well", no signature).

Original outreach (you sent):
Subject: ${row.subject}
${(row.body_plain || '').slice(0, 1500)}

Their reply:
${row.reply_snippet || '(snippet not available)'}

Context: This is from the "${seqName}" campaign targeting ${persona}. Draft your reply.`;
        const result = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514', // Sonnet — inbox understanding
          max_tokens: 400,
          messages: [{ role: 'user', content: prompt }],
        });
        const suggestion = result.content[0]?.text?.trim() || '';
        return res.status(200).json({ suggestion });
      }

      return res.status(400).json({ error: 'invalid action' });
    }

    if (req.method === 'POST') {
      const { id, action } = req.body;
      if (action === 'mark_handled') {
        await supabase.from('kiko_outreach_queue').update({ reply_handled: true }).eq('id', id);
        return res.status(200).json({ ok: true });
      }
      if (action === 'send_reply') {
        const { reply_text } = req.body;
        const { data: row } = await supabase
          .from('kiko_outreach_queue')
          .select('to_email, to_name, subject, gmail_thread_id, gmail_message_id')
          .eq('id', id)
          .single();
        if (!row) return res.status(404).json({ error: 'not found' });
        const token = await getGoogleAccessToken('sunny@vanhawke.com');
        const subject = row.subject?.startsWith('Re:') ? row.subject : `Re: ${row.subject}`;
        const raw = [
          `To: ${row.to_email}`,
          `Subject: ${subject}`,
          `Content-Type: text/plain; charset=UTF-8`,
          row.gmail_message_id ? `In-Reply-To: ${row.gmail_message_id}` : '',
          row.gmail_message_id ? `References: ${row.gmail_message_id}` : '',
          '',
          reply_text,
        ].filter(Boolean).join('\r\n');
        const encoded = Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw: encoded, threadId: row.gmail_thread_id }),
        });
        const j = await r.json();
        if (j.error) return res.status(500).json({ error: j.error.message });
        await supabase.from('kiko_outreach_queue').update({ reply_handled: true }).eq('id', id);
        return res.status(200).json({ ok: true, message_id: j.id });
      }
      return res.status(400).json({ error: 'invalid action' });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('[Inbox] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
