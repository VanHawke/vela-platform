// api/fetch-url.js — URL reader for Kiko
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KikoBot/1.0; +https://vanhawke.agency)', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      redirect: 'follow', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    let content = text;
    if (contentType.includes('html')) {
      content = content.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<nav[\s\S]*?<\/nav>/gi, '').replace(/<footer[\s\S]*?<\/footer>/gi, '').replace(/<header[\s\S]*?<\/header>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, ' ').trim();
      const titleMatch = text.match(/<title[^>]*>(.*?)<\/title>/i);
      const descMatch = text.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
      return res.status(200).json({ success: true, url, title: titleMatch?.[1]?.trim() || '', description: descMatch?.[1]?.trim() || '', content: content.slice(0, 15000), contentLength: content.length, truncated: content.length > 15000 });
    }
    return res.status(200).json({ success: true, url, content: content.slice(0, 15000), contentType, contentLength: content.length, truncated: content.length > 15000 });
  } catch (err) {
    console.error('[fetch-url]', err);
    return res.status(500).json({ error: err.message });
  }
}
