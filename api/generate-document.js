// api/generate-document.js — Document generation pipeline
// Researches a topic via Claude + web search, then generates branded PDF or PPTX
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

// ═══ VAN HAWKE BRAND SYSTEM ═══
const BRAND = {
  colors: {
    purple: '#7C5CFC',
    dark: '#0A0A0C',
    darkGrey: '#1A1A1E',
    midGrey: '#5A6470',
    lightGrey: '#F5F5F3',
    white: '#FFFFFF',
    teal: '#00D4AA',
    accent: '#7C5CFC',
  },
  fonts: {
    heading: 'Georgia',
    body: 'Calibri',
    accent: 'Arial Black',
  },
  company: {
    group: 'Van Hawke Group',
    agency: 'Van Hawke Agency',
    maison: 'Van Hawke Maison, Inc.',
  },
};

async function sbFetch(path, opts = {}) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...opts.headers },
  });
  if (!res.ok) return [];
  return res.json().catch(() => []);
}

// Step 1: Research the topic deeply
async function researchTopic(topic, division, purpose) {
  const divContext = division === 'agency' 
    ? 'Van Hawke Agency — F1 sponsorship advisory. Primary client: Haas F1 Team (TGR Haas). Positions as the authority-led boutique challenging CAA/WME/Octagon.'
    : division === 'maison'
    ? 'Van Hawke Maison, Inc. — luxury eyewear brand. Category: "Cultural Performance Eyewear." Positions at intersection of precision engineering, cultural capital, and scarcity-driven design.'
    : 'Van Hawke Group — multi-entity holding company spanning sport, fashion, and technology.';

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001', max_tokens: 4000,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [{ role: 'user', content: `You are creating a ${purpose} for ${divContext}

Topic: "${topic}"

Research this topic deeply. Find:
- Current market data, statistics, trends with specific numbers
- Relevant case studies and examples
- Competitive landscape details
- Strategic implications for Van Hawke specifically

Return your research as detailed prose with specific data points, names, and numbers. This will be used to generate a professional document.` }],
  });

  return res.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
}

// Step 2: Generate structured document content
async function generateStructuredContent(research, topic, division, purpose, docType) {
  const structurePrompt = docType === 'pptx' 
    ? `Create a professional slide deck structure. Return ONLY valid JSON:
{
  "title": "Deck title",
  "subtitle": "Subtitle or tagline",
  "slides": [
    {
      "title": "Slide title",
      "layout": "title|content|two-column|stats|quote|conclusion",
      "content": "Main text content for this slide",
      "bullets": ["bullet 1", "bullet 2"],
      "stats": [{"number": "$2.1B", "label": "Market Size"}],
      "notes": "Speaker notes"
    }
  ]
}
8-12 slides. Include a title slide, executive summary, 6-8 content slides, and a conclusion/next steps slide.`
    : `Create a professional document structure. Return ONLY valid JSON:
{
  "title": "Document title",
  "subtitle": "Subtitle",
  "date": "${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}",
  "sections": [
    {
      "heading": "Section title",
      "content": "Detailed prose content for this section — 2-3 paragraphs minimum",
      "highlights": ["Key point 1", "Key point 2"],
      "data": [{"label": "Metric name", "value": "$2.1B"}]
    }
  ],
  "conclusion": "Closing statement and recommended next steps"
}
5-8 sections. Each section should have substantive content, not bullet lists.`;

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 8000,
    system: `You are a senior consultant creating a ${purpose} for Van Hawke. Write with authority — no hedging, no generic statements. Every claim must be specific. Use the research provided. The tone should be: direct, confident, board-level, premium. Return ONLY valid JSON — no markdown fences, no preamble, no explanation.`,
    messages: [{ role: 'user', content: `Topic: "${topic}"\nDivision: ${division}\n\nResearch:\n${research.slice(0, 6000)}\n\n${structurePrompt}` }],
  });

  const text = res.content[0]?.text || '';
  // Robust JSON extraction — handles markdown fences, truncation, partial responses
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*"(?:sections|slides)"[\s\S]*)/);
  if (!jsonMatch) throw new Error('Failed to generate document structure — no JSON found');
  let raw = (jsonMatch[1] || jsonMatch[0]).trim();
  // Fix truncated JSON — find last complete object
  try { return JSON.parse(raw); } catch {
    // Try to repair: close open arrays and objects
    const lastBrace = raw.lastIndexOf('}');
    if (lastBrace > 0) {
      let attempt = raw.slice(0, lastBrace + 1);
      // Count open brackets and close them
      const opens = (attempt.match(/\[/g) || []).length;
      const closes = (attempt.match(/\]/g) || []).length;
      for (let i = 0; i < opens - closes; i++) attempt += ']';
      const openBraces = (attempt.match(/\{/g) || []).length;
      const closeBraces = (attempt.match(/\}/g) || []).length;
      for (let i = 0; i < openBraces - closeBraces; i++) attempt += '}';
      try { return JSON.parse(attempt); } catch {}
    }
    throw new Error('Failed to parse document structure JSON');
  }
}

// Step 3a: Render to branded HTML (viewable + printable as PDF)
function renderHTML(structure, division) {
  const B = BRAND;
  const logo = division === 'maison' ? B.company.maison : division === 'agency' ? B.company.agency : B.company.group;
  
  let html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${structure.title}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Inter', sans-serif; color: ${B.colors.dark}; background: #fff; }
@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none; } @page { size: A4; margin: 0; } }
.cover { background: ${B.colors.dark}; color: white; min-height: 100vh; display: flex; flex-direction: column; justify-content: center; padding: 80px; page-break-after: always; }
.cover h1 { font-size: 48px; font-weight: 700; margin-bottom: 16px; letter-spacing: -1px; }
.cover .subtitle { font-size: 20px; font-weight: 300; color: ${B.colors.teal}; margin-bottom: 40px; }
.cover .meta { font-size: 14px; color: rgba(255,255,255,0.5); }
.cover .brand { position: absolute; bottom: 60px; left: 80px; font-size: 12px; color: ${B.colors.purple}; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; }
.section { padding: 60px 80px; page-break-inside: avoid; min-height: auto; }
.section:nth-child(even) { background: ${B.colors.lightGrey}; }
.section h2 { font-size: 28px; font-weight: 700; margin-bottom: 24px; color: ${B.colors.dark}; border-left: 4px solid ${B.colors.purple}; padding-left: 16px; }
.section .content { font-size: 15px; line-height: 1.8; color: ${B.colors.midGrey}; max-width: 680px; }
.section .content p { margin-bottom: 16px; }
.highlights { display: flex; flex-wrap: wrap; gap: 12px; margin: 24px 0; }
.highlight { background: white; border: 1px solid rgba(0,0,0,0.06); border-radius: 8px; padding: 14px 18px; font-size: 13px; flex: 1; min-width: 200px; }
.highlight::before { content: '→'; color: ${B.colors.purple}; font-weight: 700; margin-right: 8px; }
.stats-row { display: flex; gap: 24px; margin: 24px 0; }
.stat { text-align: center; flex: 1; }
.stat .number { font-size: 36px; font-weight: 700; color: ${B.colors.purple}; }
.stat .label { font-size: 12px; color: ${B.colors.midGrey}; margin-top: 4px; text-transform: uppercase; letter-spacing: 1px; }
.conclusion { background: ${B.colors.dark}; color: white; padding: 60px 80px; }
.conclusion h2 { color: ${B.colors.teal}; border-left-color: ${B.colors.teal}; }
.conclusion .content { color: rgba(255,255,255,0.7); }
.footer { text-align: center; padding: 20px; font-size: 11px; color: ${B.colors.midGrey}; }
</style></head><body>`;

  // Cover page
  html += `<div class="cover">
  <h1>${structure.title}</h1>
  <div class="subtitle">${structure.subtitle || ''}</div>
  <div class="meta">${structure.date || ''} | Confidential</div>
  <div class="brand">${logo}</div>
</div>`;

  // Content sections
  for (const sec of (structure.sections || [])) {
    html += `<div class="section">
  <h2>${sec.heading}</h2>
  <div class="content">${(sec.content || '').split('\n').map(p => `<p>${p}</p>`).join('')}</div>`;
    if (sec.highlights?.length) {
      html += `<div class="highlights">${sec.highlights.map(h => `<div class="highlight">${h}</div>`).join('')}</div>`;
    }
    if (sec.data?.length) {
      html += `<div class="stats-row">${sec.data.map(d => `<div class="stat"><div class="number">${d.value}</div><div class="label">${d.label}</div></div>`).join('')}</div>`;
    }
    html += `</div>`;
  }

  // Conclusion
  if (structure.conclusion) {
    html += `<div class="conclusion"><h2>Next Steps</h2><div class="content"><p>${structure.conclusion}</p></div></div>`;
  }

  html += `<div class="footer">${logo} | Confidential | ${structure.date || new Date().toLocaleDateString('en-GB')}</div>`;
  html += `</body></html>`;
  return html;
}

// Step 3b: Render to PPTX
async function renderPPTX(structure, division) {
  const pptxgenjs = (await import('pptxgenjs')).default;
  const pres = new pptxgenjs();
  const B = BRAND;
  const logo = division === 'maison' ? B.company.maison : division === 'agency' ? B.company.agency : B.company.group;

  pres.layout = 'LAYOUT_16x9';
  pres.author = logo;
  pres.title = structure.title;

  // Title slide
  const titleSlide = pres.addSlide();
  titleSlide.background = { color: B.colors.dark.replace('#', '') };
  titleSlide.addText(structure.title, { x: 0.8, y: 1.5, w: 8.4, h: 2, fontSize: 40, fontFace: B.fonts.heading, color: 'FFFFFF', bold: true });
  titleSlide.addText(structure.subtitle || '', { x: 0.8, y: 3.5, w: 8.4, h: 0.8, fontSize: 18, fontFace: B.fonts.body, color: B.colors.teal.replace('#', '') });
  titleSlide.addText(logo, { x: 0.8, y: 4.8, w: 4, h: 0.4, fontSize: 10, fontFace: B.fonts.body, color: B.colors.purple.replace('#', ''), charSpacing: 3 });

  // Content slides
  for (const slide of (structure.slides || [])) {
    const s = pres.addSlide();
    
    if (slide.layout === 'stats' && slide.stats?.length) {
      s.background = { color: B.colors.dark.replace('#', '') };
      s.addText(slide.title, { x: 0.8, y: 0.4, w: 8.4, h: 0.8, fontSize: 28, fontFace: B.fonts.heading, color: 'FFFFFF', bold: true });
      slide.stats.forEach((stat, i) => {
        const xPos = 0.8 + (i * 2.8);
        s.addText(stat.number, { x: xPos, y: 2, w: 2.4, h: 1.2, fontSize: 36, fontFace: B.fonts.accent, color: B.colors.purple.replace('#', ''), align: 'center' });
        s.addText(stat.label, { x: xPos, y: 3.2, w: 2.4, h: 0.6, fontSize: 11, fontFace: B.fonts.body, color: '999999', align: 'center' });
      });
    } else {
      s.background = { color: 'FFFFFF' };
      s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 0.15, h: 5.625, fill: { color: B.colors.purple.replace('#', '') } });
      s.addText(slide.title, { x: 0.8, y: 0.4, w: 8.4, h: 0.8, fontSize: 26, fontFace: B.fonts.heading, color: B.colors.dark.replace('#', ''), bold: true });
      
      if (slide.content) {
        s.addText(slide.content, { x: 0.8, y: 1.4, w: 8.4, h: 1.5, fontSize: 14, fontFace: B.fonts.body, color: B.colors.midGrey.replace('#', ''), lineSpacingMultiple: 1.5 });
      }
      if (slide.bullets?.length) {
        s.addText(slide.bullets.map(b => ({ text: b, options: { bullet: true, breakLine: true } })), { x: 0.8, y: 3, w: 8.4, h: 2.2, fontSize: 13, fontFace: B.fonts.body, color: B.colors.dark.replace('#', ''), lineSpacingMultiple: 1.4 });
      }
    }

    // Footer on every content slide
    s.addText(logo, { x: 0.8, y: 5.1, w: 4, h: 0.4, fontSize: 8, fontFace: B.fonts.body, color: 'BBBBBB' });
  }

  // Conclusion slide
  const endSlide = pres.addSlide();
  endSlide.background = { color: B.colors.dark.replace('#', '') };
  endSlide.addText('Next Steps', { x: 0.8, y: 1.5, w: 8.4, h: 1, fontSize: 36, fontFace: B.fonts.heading, color: B.colors.teal.replace('#', ''), bold: true });
  if (structure.slides?.[structure.slides.length - 1]?.content) {
    endSlide.addText(structure.slides[structure.slides.length - 1].content, { x: 0.8, y: 2.8, w: 8.4, h: 2, fontSize: 14, fontFace: B.fonts.body, color: 'AAAAAA', lineSpacingMultiple: 1.5 });
  }
  endSlide.addText(logo, { x: 0.8, y: 4.8, w: 4, h: 0.4, fontSize: 10, fontFace: B.fonts.body, color: B.colors.purple.replace('#', ''), charSpacing: 3 });

  return pres;
}

// Main handler
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { topic, documentType = 'pdf', division = 'agency', purpose = 'report' } = req.body;
  if (!topic) return res.status(400).json({ error: 'topic is required' });

  const startTime = Date.now();
  console.log(`[generate-document] Starting: "${topic}" (${documentType}, ${division}, ${purpose})`);

  try {
    // Step 1: Research
    const research = await researchTopic(topic, division, purpose);
    console.log(`[generate-document] Research: ${research.length} chars (${Date.now() - startTime}ms)`);

    // Step 2: Structure
    const structure = await generateStructuredContent(research, topic, division, purpose, documentType);
    console.log(`[generate-document] Structure: ${documentType === 'pptx' ? structure.slides?.length : structure.sections?.length} sections (${Date.now() - startTime}ms)`);

    // Step 3: Render
    const fs = await import('fs');
    const path = await import('path');
    const docsDir = '/home/kiko/kiko-worker/public/docs';
    
    // Ensure docs directory exists
    try { fs.mkdirSync(docsDir, { recursive: true }); } catch {}
    
    const timestamp = Date.now();
    const safeTopic = topic.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 40).toLowerCase();

    if (documentType === 'pptx') {
      const pres = await renderPPTX(structure, division);
      const filename = `${safeTopic}-${timestamp}.pptx`;
      const filepath = path.join(docsDir, filename);
      await pres.writeFile({ fileName: filepath });
      console.log(`[generate-document] PPTX created: ${filename} (${Date.now() - startTime}ms)`);
      return res.json({ ok: true, type: 'pptx', filename, url: `/docs/${filename}`, title: structure.title, slides: structure.slides?.length || 0, duration: Date.now() - startTime });
    } else {
      const html = renderHTML(structure, division);
      const filename = `${safeTopic}-${timestamp}.html`;
      const filepath = path.join(docsDir, filename);
      fs.writeFileSync(filepath, html, 'utf-8');
      console.log(`[generate-document] PDF/HTML created: ${filename} (${Date.now() - startTime}ms)`);
      return res.json({ ok: true, type: 'html', filename, url: `/docs/${filename}`, title: structure.title, sections: structure.sections?.length || 0, duration: Date.now() - startTime });
    }
  } catch (err) {
    console.error(`[generate-document] Error:`, err.message);
    return res.status(500).json({ error: err.message });
  }
}
