// api/gmail-watch-register.js — Register Gmail push notifications for all users
import { registerGmailWatch } from './gmail-webhook.js';

const WATCHED_EMAILS = ['sunny@vanhawke.com', 'matt.smith@vanhawke.com'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const topicName = process.env.GMAIL_PUBSUB_TOPIC;
  if (!topicName) return res.status(500).json({ error: 'GMAIL_PUBSUB_TOPIC not set in env' });

  const results = [];
  for (const email of WATCHED_EMAILS) {
    try {
      const result = await registerGmailWatch(email, topicName);
      results.push({ email, ok: !result.error, ...result });
    } catch (e) {
      results.push({ email, ok: false, error: e.message });
    }
  }

  return res.json({ ok: true, results });
}
