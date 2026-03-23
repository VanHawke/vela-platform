// api/generate-doc.js — Document generation for Kiko
// Generates docx, xlsx, pptx, csv files → uploads to Supabase Storage → returns download URL
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { format, filename, content, sheets } = req.body;
  if (!format || !filename) return res.status(400).json({ error: 'format and filename required' });

  try {
    let buffer, mimeType, ext;

    if (format === 'csv') {
      ext = 'csv';
      mimeType = 'text/csv';
      buffer = Buffer.from(content || '', 'utf-8');

    } else if (format === 'xlsx') {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Kiko — Van Hawke';
      workbook.created = new Date();

      const sheetData = sheets || [{ name: 'Sheet1', headers: [], rows: [] }];
      for (const sheet of sheetData) {
        const ws = workbook.addWorksheet(sheet.name);
        if (sheet.headers?.length) {
          ws.addRow(sheet.headers);
          const headerRow = ws.getRow(1);
          headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A2E' } };
          headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        }
        if (sheet.rows?.length) { for (const row of sheet.rows) ws.addRow(row); }
        ws.columns.forEach(col => {
          let maxLen = 10;
          col.eachCell({ includeEmpty: true }, cell => {
            const len = cell.value ? String(cell.value).length : 0;
            if (len > maxLen) maxLen = Math.min(len, 50);
          });
          col.width = maxLen + 2;
        });
      }
      buffer = Buffer.from(await workbook.xlsx.writeBuffer());
      ext = 'xlsx';
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    } else if (format === 'docx') {
      const docx = await import('docx');
      const { Document, Paragraph, TextRun, HeadingLevel, Packer } = docx;
      const paragraphs = [];
      const lines = (content || '').split('\n');
      for (const line of lines) {
        if (line.startsWith('### ')) { paragraphs.push(new Paragraph({ text: line.slice(4), heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 80 } })); }
        else if (line.startsWith('## ')) { paragraphs.push(new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 100 } })); }
        else if (line.startsWith('# ')) { paragraphs.push(new Paragraph({ text: line.slice(2), heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 150 } })); }
        else if (line.startsWith('- ') || line.startsWith('• ')) { paragraphs.push(new Paragraph({ children: [new TextRun({ text: line.slice(2), size: 22 })], bullet: { level: 0 }, spacing: { after: 60 } })); }
        else if (line.trim() === '') { paragraphs.push(new Paragraph({ text: '' })); }
        else {
          const parts = line.split(/(\*\*.*?\*\*)/g);
          const runs = parts.map(p => p.startsWith('**') && p.endsWith('**') ? new TextRun({ text: p.slice(2, -2), bold: true, size: 22 }) : new TextRun({ text: p, size: 22 }));
          paragraphs.push(new Paragraph({ children: runs, spacing: { after: 80 } }));
        }
      }
      const doc = new Document({ creator: 'Kiko — Van Hawke', sections: [{ properties: {}, children: paragraphs }] });
      buffer = Buffer.from(await Packer.toBuffer(doc));
      ext = 'docx';
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    } else if (format === 'pptx') {
      const PptxGenJS = (await import('pptxgenjs')).default;
      const pptx = new PptxGenJS();
      pptx.author = 'Kiko — Van Hawke';
      pptx.company = 'Van Hawke Group';
      const slides = Array.isArray(content) ? content : [{ title: filename, body: content || '' }];
      for (const s of slides) {
        const slide = pptx.addSlide();
        slide.background = { color: '0A0A0C' };
        if (s.title) slide.addText(s.title, { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 28, fontFace: 'Arial', color: 'FFFFFF', bold: true });
        if (s.body) slide.addText(s.body, { x: 0.5, y: 1.3, w: 9, h: 4.5, fontSize: 14, fontFace: 'Arial', color: 'CCCCCC', valign: 'top', lineSpacing: 22 });
      }
      buffer = Buffer.from(await pptx.write({ outputType: 'nodebuffer' }));
      ext = 'pptx';
      mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    } else {
      return res.status(400).json({ error: `Unsupported format: ${format}` });
    }

    // Upload to Supabase Storage
    const filePath = `${Date.now()}_${filename.replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('generated-files')
      .upload(filePath, buffer, { contentType: mimeType, upsert: true });
    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: urlData } = supabase.storage.from('generated-files').getPublicUrl(filePath);
    return res.status(200).json({ success: true, url: urlData?.publicUrl, filename: `${filename}.${ext}`, format: ext, size: buffer.length });
  } catch (err) {
    console.error('[generate-doc]', err);
    return res.status(500).json({ error: err.message });
  }
}
export const config = { maxDuration: 30 };
