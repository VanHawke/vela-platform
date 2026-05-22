// api/meeting-transcripts.js — Fetch Google Meet transcripts and smart notes
// Pulls completed meeting artifacts, processes via Haiku, stores in kiko_knowledge
import { getGoogleToken } from './google-token.js';
import { sbFetch } from './kiko-tools.js';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
const MEET_API = 'https://meet.googleapis.com/v2';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { email = 'sunny@vanhawke.com', days = 7 } = req.body || {};

  try {
    const token = await getGoogleToken(email);
    if (!token) return res.status(401).json({ error: 'No Google token — re-authenticate in Settings' });

    // Step 1: Get recent conference records (meetings that happened in the last N days)
    const cutoff = new Date(Date.now() - days * 86400000).toISOString()
    const spacesRes = await fetch(
      `${MEET_API}/conferenceRecords?filter=end_time>="${cutoff}"&pageSize=20`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    if (!spacesRes.ok) {
      const err = await spacesRes.text()
      console.error('[meeting-transcripts] Meet API error:', spacesRes.status, err)
      // If 403/401, the Meet scope hasn't been granted yet
      if (spacesRes.status === 401 || spacesRes.status === 403) {
        return res.json({ error: 'Google Meet scope not yet granted. Go to Settings → Accounts → Reconnect Google to grant meeting access.', needsReauth: true })
      }
      return res.status(spacesRes.status).json({ error: 'Meet API failed', detail: err })
    }

    const spacesData = await spacesRes.json()
    const conferences = spacesData.conferenceRecords || []

    if (conferences.length === 0) {
      return res.json({ message: 'No meetings found in the last ' + days + ' days', processed: 0 })
    }

    let processed = 0
    const results = []

    // Step 2: For each conference, fetch transcripts
    for (const conf of conferences.slice(0, 10)) {
      const confName = conf.name // e.g. "conferenceRecords/abc123"
      try {
        // Get transcript entries
        const transcriptRes = await fetch(
          `${MEET_API}/${confName}/transcripts`,
          { headers: { Authorization: `Bearer ${token}` } }
        )

        if (!transcriptRes.ok) { results.push({ conf: confName, error: 'No transcripts' }); continue }
        const transcriptData = await transcriptRes.json()
        const transcripts = transcriptData.transcripts || []

        for (const transcript of transcripts) {
          const transcriptName = transcript.name // e.g. "conferenceRecords/abc123/transcripts/def456"

          // Get transcript entries (the actual text)
          const entriesRes = await fetch(
            `${MEET_API}/${transcriptName}/entries?pageSize=100`,
            { headers: { Authorization: `Bearer ${token}` } }
          )
          if (!entriesRes.ok) continue
          const entriesData = await entriesRes.json()
          const entries = entriesData.transcriptEntries || []

          if (entries.length === 0) continue

          // Build readable transcript
          const fullTranscript = entries.map(e => {
            const speaker = e.participant?.displayName || 'Unknown'
            const text = e.text || ''
            const time = e.startTime ? new Date(e.startTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''
            return `[${time}] ${speaker}: ${text}`
          }).join('\n')

          // Step 3: Extract action items and key decisions via Haiku
          const extraction = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001', max_tokens: 500,
            messages: [{ role: 'user', content: `Meeting transcript:\n${fullTranscript.slice(0, 8000)}\n\nExtract: (1) Key decisions made, (2) Action items with owners, (3) Open questions or unresolved topics, (4) One-paragraph summary. Return JSON: { "summary": "...", "decisions": ["..."], "action_items": [{"action": "...", "owner": "..."}], "open_questions": ["..."], "attendees": ["..."] }` }]
          })
          const raw = (extraction.content[0]?.text || '{}').replace(/```json|```/g, '').trim()
          let parsed = {}
          try { parsed = JSON.parse(raw) } catch { parsed = { summary: raw } }

          // Step 4: Store in kiko_knowledge
          const meetingTitle = conf.space?.meetingUri ? `Meeting ${new Date(conf.startTime).toLocaleDateString('en-GB')}` : confName
          await sbFetch('kiko_knowledge', {
            method: 'POST',
            body: JSON.stringify({
              domain: 'meeting-transcripts',
              content: `MEETING: ${meetingTitle}\nATTENDEES: ${(parsed.attendees || []).join(', ')}\nDATE: ${conf.startTime || 'unknown'}\n\nSUMMARY: ${parsed.summary || 'No summary'}\n\nDECISIONS:\n${(parsed.decisions || []).map(d => '• ' + d).join('\n')}\n\nACTION ITEMS:\n${(parsed.action_items || []).map(a => '• ' + a.action + (a.owner ? ' (@' + a.owner + ')' : '')).join('\n')}\n\nOPEN QUESTIONS:\n${(parsed.open_questions || []).map(q => '• ' + q).join('\n')}`,
              source: 'google_meet_transcript',
              researched_at: new Date().toISOString(),
            })
          })

          // Step 5: Auto-create tasks from action items
          for (const item of (parsed.action_items || []).slice(0, 5)) {
            if (item.action && item.action.length > 5) {
              await sbFetch('tasks', { method: 'POST', body: JSON.stringify({
                data: {
                  type: 'follow_up',
                  notes: `[Meeting] ${item.action}`,
                  contact: item.owner || '',
                  source: 'meeting_transcript',
                  due_date: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
                  completed: false,
                },
                created_at: new Date().toISOString(),
              })})
            }
          }

          processed++
          results.push({ conf: confName, title: meetingTitle, summary: (parsed.summary || '').slice(0, 200), actions: (parsed.action_items || []).length, decisions: (parsed.decisions || []).length })
        }
      } catch (err) {
        console.error('[meeting-transcripts] Error processing', confName, err.message)
        results.push({ conf: confName, error: err.message })
      }
    }

    res.json({ processed, total: conferences.length, results })
  } catch (err) {
    console.error('[meeting-transcripts] Error:', err.message)
    res.status(500).json({ error: err.message })
  }
}
