// api/vela-code.js — Code editor backend: file tree, file content, AI code chat, deploy
import Anthropic from '@anthropic-ai/sdk';

export const config = { supportsResponseStreaming: true };

const GH_REPO = 'VanHawke/vela-platform';
const GH_API = `https://api.github.com/repos/${GH_REPO}`;

async function ghFetch(path, options = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN not configured');
  const res = await fetch(`${GH_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      ...options.headers,
    },
  });
  return res;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  const action = req.query?.action || req.body?.action;

  try {
    // GET file tree
    if (action === 'files') {
      const ghRes = await ghFetch('/git/trees/main?recursive=1');
      const data = await ghRes.json();
      if (!ghRes.ok) return res.status(ghRes.status).json(data);
      const tree = (data.tree || [])
        .filter(t => !t.path.startsWith('.') && !t.path.startsWith('node_modules') && !t.path.startsWith('dist'))
        .map(t => ({ path: t.path, type: t.type, size: t.size }));
      return res.status(200).json({ tree });
    }

    // GET file content
    if (action === 'file') {
      const path = req.query?.path;
      if (!path) return res.status(400).json({ error: 'path required' });
      const ghRes = await ghFetch(`/contents/${path}`, {
        headers: { Accept: 'application/vnd.github.v3.raw' },
      });
      if (!ghRes.ok) return res.status(ghRes.status).json({ error: `File not found: ${path}` });
      const content = await ghRes.text();
      return res.status(200).json({ content, path });
    }

    // POST — AI code chat (streaming)
    if (action === 'ai') {
      const { message, file_path, file_content, history } = req.body;
      if (!message) return res.status(400).json({ error: 'message required' });

      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

      const systemPrompt = `You are Kiko in developer mode, working on the Vela Platform codebase.
${file_path ? `Current file: ${file_path}` : 'No file selected.'}
Stack: React 19 + Vite, Vercel Serverless, Supabase, Anthropic SDK, OpenAI SDK
When suggesting code changes: output the COMPLETE modified file content in a single code block, ready to save.
Be precise. Never break Kiko's streaming architecture or SSE handler.
Keep files under 400 lines.`;

      const messages = [
        ...(history || []).map(m => ({ role: m.role, content: m.content })),
        {
          role: 'user',
          content: file_content
            ? `File: ${file_path}\n\`\`\`\n${file_content.slice(0, 15000)}\n\`\`\`\n\n${message}`
            : message,
        },
      ];

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      const stream = anthropic.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: systemPrompt,
        messages,
      });

      stream.on('text', (text) => {
        res.write(`data: ${JSON.stringify({ delta: text })}\n\n`);
      });

      await stream.finalMessage();
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    // POST — Save file to GitHub
    if (action === 'save') {
      const { path, content } = req.body;
      if (!path || content === undefined) return res.status(400).json({ error: 'path and content required' });

      // Get current file SHA
      const getRes = await ghFetch(`/contents/${path}`);
      const existing = await getRes.json();
      const sha = existing.sha;

      // Update file
      const updateRes = await ghFetch(`/contents/${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Vela Code: update ${path}`,
          content: Buffer.from(content).toString('base64'),
          sha,
          branch: 'main',
        }),
      });

      if (!updateRes.ok) {
        const err = await updateRes.json();
        return res.status(updateRes.status).json({ error: err.message || 'GitHub update failed' });
      }

      // Trigger deploy if hook is configured
      let deployed = false;
      const deployHook = process.env.VERCEL_DEPLOY_HOOK;
      if (deployHook) {
        try {
          await fetch(deployHook, { method: 'POST' });
          deployed = true;
        } catch {}
      }

      return res.status(200).json({ ok: true, deployed });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('[VelaCode] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
