// Lightweight email draft endpoint — no tools, no reasoning, no system prompt overhead
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const MODEL = 'claude-sonnet-4-6';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const stream = await anthropic.messages.stream({
      model: MODEL,
      max_tokens: 1024,
      system: `You are a senior sponsorship executive drafting email replies. Rules:
- Output ONLY the email. No commentary, no analysis, no sections, no headers, no explanation.
- Format: Subject: line, then To: line, then blank line, then greeting, then body, then sign-off.
- Greeting: match their style (Hi/Hello/Dear). If they said "Hi Matt", reply "Hi Matthew" (never "Hi Matt" back).
- Body: 2-3 short paragraphs. Warm but professional. No em dashes (use commas or full stops). No exclamation marks.
- Always end with "Best," on its own line (not "Kind regards" unless replying to a formal email).
- Always include a forward-looking question or next step in the final paragraph.`,
      messages: [{ role: 'user', content: message }],
    });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        res.write(`data: ${JSON.stringify({ delta: event.delta.text })}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
  } catch (err) {
    console.error('[kiko-draft] Error:', err.message);
    res.write(`data: ${JSON.stringify({ delta: '[Draft generation error - please try again]' })}\n\n`);
    res.write('data: [DONE]\n\n');
  }
  return res.end();
}
