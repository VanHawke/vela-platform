// api/tool.js — lightweight tool executor for Voice Realtime API function calls

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { tool, input, userEmail } = req.body;
  if (!tool) return res.status(400).json({ error: 'tool name required' });

  console.log(`[Tool] Executing: ${tool}`, JSON.stringify(input).slice(0, 200));

  try {
    let result;

    switch (tool) {
      case 'get_realtime_data': {
        if (input.type === 'weather') {
          const loc = input.location || input.query || 'Weybridge,UK';
          const key = process.env.OPENWEATHER_API_KEY;
          if (!key) return res.status(200).json({ error: 'Weather API key not configured' });
          const weatherRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(loc)}&appid=${key}&units=metric`);
          result = await weatherRes.json();
        } else if (input.type === 'time') {
          result = { time: new Date().toISOString(), timezone: 'UTC' };
        } else {
          result = { info: `Realtime ${input.type} not yet implemented` };
        }
        break;
      }

      case 'search_web': {
        const { default: OpenAI } = await import('openai');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Web search timed out after 12s')), 12000)
        );

        const searchPromise = openai.responses.create({
          model: 'gpt-4o-mini',
          tools: [{ type: 'web_search', search_context_size: 'low' }],
          input: input.query,
        });

        const response = await Promise.race([searchPromise, timeoutPromise]);
        const text = response.output_text || '';
        console.log(`[Tool] search_web: got ${text.length} chars`);
        result = { results: text || 'No results found.' };
        break;
      }

      default:
        result = { error: `Unknown tool: ${tool}` };
    }

    console.log(`[Tool] ${tool} completed`);
    return res.status(200).json(result);
  } catch (err) {
    console.error(`[Tool] ${tool} error:`, err.message);
    return res.status(200).json({ error: err.message });
  }
}
