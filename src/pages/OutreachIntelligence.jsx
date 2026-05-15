// OutreachIntelligence.jsx — Command Centre
// Master-detail: LEFT = grouped priority list. RIGHT = Kiko brief pane on select.
// Hot Replies band stays on top. Real data from deals / tasks / kiko_alerts.

import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { showToast } from '@/components/ui/Toast'
import { useKikoLive } from '@/contexts/KikoLiveContext'
import PageHeader from '@/components/layout/PageHeader'
import {
  Mail, Linkedin, MessageSquare, CheckSquare, Square, AlertTriangle,
  Zap, TrendingUp, Clock, RefreshCw, Inbox, Send, ExternalLink, Calendar
} from 'lucide-react'
import './OutreachIntelligence.css'
import EmailDraft, { isEmailDraft } from '@/components/kiko/EmailDraft'

// Simple markdown → HTML for Kiko brief responses
// Strip draft email section from brief (to avoid showing it twice when EmailDraft renders)
function stripDraftFromBrief(text) {
  if (!text) return text
  // Remove everything from "4. DRAFT" or "DRAFT REPLY" or "DRAFT EMAIL" or "DRAFT OUTREACH" to end
  return text.replace(/\n*(?:#{1,4}\s*)?(?:\d+\.\s*)?(?:DRAFT\s*(?:REPLY|EMAIL|OUTREACH|FOLLOW.?UP))[:\s—\-]*[\s\S]*/i, '\n').trim()
}

// Strip tool calls, tool responses, Kiko's internal narration, and em dashes from brief text
function stripToolCalls(text) {
  if (!text) return text
  return text
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
    .replace(/<tool_response>[\s\S]*?<\/tool_response>/g, '')
    // Strip open-ended tool tags during streaming (closing tag not yet arrived)
    .replace(/<tool_response>[\s\S]*/g, '')
    .replace(/<tool_call>[\s\S]*/g, '')
    // Strip raw JSON blocks that leak from tool responses
    .replace(/\{"success"\s*:\s*true[\s\S]*?\}\s*/g, '')
    .replace(/\{"emails"\s*:[\s\S]*?\}\s*/g, '')
    // Strip narration about tool use
    .replace(/I'll pull.*?(?:now|first)\.?\s*/gi, '')
    .replace(/Let me (?:look up|search|check|find|pull|retrieve).*?(?:\.|$)/gim, '')
    .replace(/Reading email (?:history|thread).*?(?:\.|$)/gim, '')
    .replace(/I now have everything.*?(?:\.|$)/gim, '')
    .replace(/\s*—\s*/g, '. ')
    .replace(/\s*–\s*/g, '. ')
    .replace(/\.\.\s/g, '. ')
    .replace(/^>\s?/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function parseBriefMarkdown(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Split inline bullet runs (•) into proper line-separated bullets
    .replace(/•\s*/g, '\n• ')
    .replace(/^### (.+)$/gm, '<h4 style="margin:16px 0 6px;font-size:13px;font-weight:600;color:#0A0A0A;font-family:Inter,system-ui,sans-serif">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="margin:18px 0 8px;font-size:14px;font-weight:600;color:#0A0A0A;font-family:Inter,system-ui,sans-serif">$1</h3>')
    .replace(/^# (.+)$/gm, '<h3 style="margin:18px 0 8px;font-size:15px;font-weight:600;color:#0A0A0A;font-family:Inter,system-ui,sans-serif">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#0A0A0A">$1</strong>')
    .replace(/^[•\-\*] (.+)$/gm, '<div style="padding:3px 0 3px 16px;position:relative"><span style="position:absolute;left:0;color:#A0A0A0">·</span>$1</div>')
    .replace(/^(\d+)\. (.+)$/gm, '<div style="padding:3px 0 3px 22px;position:relative"><span style="position:absolute;left:0;color:#6B6B6B;font-weight:500">$1.</span>$2</div>')
    .replace(/\n{2,}/g, '<div style="height:10px"></div>')
    .replace(/\n/g, '<br/>')
}

// Clean raw markdown from titles for list display
function cleanTitle(text) {
  if (!text) return ''
  return text.replace(/\*\*/g, '').replace(/•/g, ' · ').replace(/\s+/g, ' ').trim()
}

const STAGE_PROB = {
  'To revisit': 10, 'Contact made': 20, 'Qualified': 35,
  'In Dialogue': 50, 'Meeting arranged (brand x RH)': 55,
  'Proposal Sent': 60, 'Negotiation': 70, 'Verbal Agreement': 85, 'Contract Review': 92,
}

function fmtCurrency(n) {
  if (!n || isNaN(n)) return '$0'
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}m`
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`
  return `$${n}`
}
function relativeTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
// Task rows have no 'title' field — reconstruct a useful label from type/contact/company.
function taskLabel(task) {
  const d = task.data || {}
  if (d.title) return d.title
  if (d.name) return d.name
  const who = d.contact || d.company
  if (d.type && who) return `${d.type} — ${who}`
  if (d.type) return d.type
  if (d.notes) return d.notes.slice(0, 80)
  return 'Task'
}
function taskSub(task) {
  const d = task.data || {}
  const parts = []
  if (d.company && d.contact) parts.push(`${d.contact} · ${d.company}`)
  else if (d.company) parts.push(d.company)
  else if (d.contact) parts.push(d.contact)
  return parts.join(' · ')
}

function dueLabel(iso) {
  if (!iso) return ''
  const due = new Date(iso)
  const now = new Date()
  const diffDays = Math.ceil((due - now) / 86400000)
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`
  if (diffDays === 0) return 'Due today'
  if (diffDays === 1) return 'Due tomorrow'
  if (diffDays <= 7) return `Due in ${diffDays}d`
  return `Due ${due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
}

// ─── Enrich selected item with live Supabase data ───
// Pulls the real company row, recent deals, contact record, and recent emails for the
// entity attached to this task/deal/reply — then builds a dense fact-packed prompt.
// Returns a string. Falls back to buildBriefPrompt() if no enrichment data found.
async function enrichSelectedForBrief(sel) {
  const basePrompt = buildBriefPrompt(sel)
  try {
    const p = sel?.payload || {}
    const d = p.data || {}
    // Extract company/contact from data fields, meta line, OR parse from the task/deal title
    const titleParts = (sel?.title || '').split(/\s*[—–-]\s*/)
    const titleSuffix = titleParts.length > 1 ? titleParts[titleParts.length - 1].trim() : null
    const companyName = d.company || p.company || sel?.meta?.split('·')?.[0]?.trim() || p.entity_name || titleSuffix || null
    const contactName = d.contact || p.contact || p.contactName || null
    if (!companyName && !contactName) return basePrompt

    const facts = []
    // Fetch company row (+ last touchpoint hint)
    if (companyName) {
      const { data: companies } = await supabase
        .from('companies').select('id, data')
      const needle = companyName.toLowerCase().trim()
      const match = (companies || []).find(c => (c.data?.name || '').toLowerCase().trim() === needle)
        || (companies || []).find(c => { const n = (c.data?.name || '').toLowerCase().trim(); return n && (n.startsWith(needle) || needle.startsWith(n)) })
      if (match) {
        const cd = match.data || {}
        const companyFacts = [cd.industry, cd.country, cd.size && `~${cd.size} employees`, cd.website].filter(Boolean).join(' · ')
        if (companyFacts) facts.push(`COMPANY: ${cd.name} — ${companyFacts}`)
        if (cd.description) facts.push(`ABOUT: ${String(cd.description).slice(0, 400)}`)
        // Recent deals for this company
        const { data: deals } = await supabase
          .from('deals').select('id, data, updated_at').order('updated_at', { ascending: false }).limit(200)
        const related = (deals || []).filter(dl => ((dl.data?.company || '').toLowerCase().trim() === needle)).slice(0, 3)
        if (related.length) {
          facts.push(`OUR DEALS WITH THEM: ${related.map(r => `[${r.data?.stage || '?'}] ${r.data?.title || '(untitled)'} — ${r.data?.value ? '$' + r.data.value : 'no value'}`).join(' | ')}`)
        }
      }
    }
    // Contact row + history
    const contactSearch = contactName || titleSuffix
    if (contactSearch) {
      const { data: contacts } = await supabase
        .from('contacts').select('id, data')
      const needle = contactSearch.toLowerCase().trim()
      const match = (contacts || []).find(c => {
        const full = `${c.data?.firstName || ''} ${c.data?.lastName || ''}`.toLowerCase().trim()
        return full === needle
      }) || (contacts || []).find(c => {
        const full = `${c.data?.firstName || ''} ${c.data?.lastName || ''}`.toLowerCase().trim()
        return full.startsWith(needle) || needle.startsWith(full)
      })
      if (match) {
        const cd = match.data || {}
        const contactFacts = [cd.title, cd.email, cd.linkedinUrl && 'has LinkedIn'].filter(Boolean).join(' · ')
        if (contactFacts) facts.push(`CONTACT: ${cd.firstName || ''} ${cd.lastName || ''} — ${contactFacts}`)
        if (cd.notes) facts.push(`CONTACT NOTES: ${String(cd.notes).slice(0, 300)}`)
      }
    }
    // Recent activities for this entity
    if (companyName) {
      const { data: acts } = await supabase
        .from('activities').select('type, subject, direction, created_at')
        .ilike('entity_name', `%${companyName}%`)
        .order('created_at', { ascending: false }).limit(5)
      if (acts?.length) {
        facts.push(`RECENT ACTIVITY LOG:\n${acts.map(a => `  [${new Date(a.created_at).toLocaleDateString('en-GB', { day:'numeric',month:'short' })}] ${a.direction === 'inbound' ? '← IN' : '→ OUT'} ${a.type}: ${a.subject || '(no subject)'}`).join('\n')}`)
      }
    }
    // Relevant alerts/signals for this entity
    if (companyName) {
      const { data: alerts } = await supabase
        .from('kiko_alerts').select('title, detail, created_at')
        .ilike('entity_name', `%${companyName}%`)
        .order('created_at', { ascending: false }).limit(3)
      if (alerts?.length) {
        facts.push(`RECENT SIGNALS/ALERTS:\n${alerts.map(a => `  [${new Date(a.created_at).toLocaleDateString('en-GB', { day:'numeric',month:'short' })}] ${a.title}`).join('\n')}`)
      }
    }
    // ── REASONING CHAIN — check for existing cognitive analysis to ensure consistency ──
    const entityName = companyName || contactName || titleSuffix || ''
    if (entityName) {
      try {
        // Timeout: if chain lookup takes >5s, skip it — don't block the brief
        const chainPromise = (async () => {
          // Step 1: find event_ids where entity_name matches (classify/context steps have it in input)
          const { data: matchingSteps, error: err1 } = await supabase
            .from('kiko_reasoning_chains')
            .select('event_id')
            .filter('input->>entity_name', 'ilike', `%${entityName}%`)
            .order('created_at', { ascending: false })
            .limit(2)
          if (err1) { console.warn('[enrichBrief] chain step1 error:', err1.message); return null }
          if (!matchingSteps?.length) return null
          const eventIds = [...new Set(matchingSteps.map(s => s.event_id))]
          // Step 2: fetch ALL steps for those events (including psychology + action)
          const { data: chains, error: err2 } = await supabase
            .from('kiko_reasoning_chains')
            .select('step_type, output, created_at')
            .in('event_id', eventIds)
            .order('created_at', { ascending: false })
          if (err2) { console.warn('[enrichBrief] chain step2 error:', err2.message); return null }
          return chains
        })()
        const chains = await Promise.race([
          chainPromise,
          new Promise(resolve => setTimeout(() => resolve(null), 5000))
        ])
          if (chains?.length) {
            const psychologyStep = chains.find(c => c.step_type === 'psychology')
            const actionStep = chains.find(c => c.step_type === 'action')
            const classifyStep = chains.find(c => c.step_type === 'classify')
            const parts = []
            if (classifyStep?.output) parts.push(`Classification: ${JSON.stringify(classifyStep.output).slice(0, 300)}`)
            if (psychologyStep?.output) parts.push(`Psychology analysis: ${JSON.stringify(psychologyStep.output).slice(0, 800)}`)
            if (actionStep?.output) parts.push(`Recommended actions: ${JSON.stringify(actionStep.output).slice(0, 500)}`)
            if (parts.length >= 2) {
              facts.push(`\n--- KIKO'S EXISTING ANALYSIS (from cognitive reasoning chain, generated ${new Date(chains[0].created_at).toLocaleDateString('en-GB')}) ---\n${parts.join('\n')}\n--- END EXISTING ANALYSIS ---\nCRITICAL: Use the above analysis as your definitive recommendation. Do NOT contradict it. The cognitive engine has already analysed this signal. Your brief must be consistent with its conclusion. If suggesting timing (e.g. follow up in X weeks), use the SAME timing as the analysis above.`)
            }
          }
      } catch (e) { console.error('[enrichBrief] reasoning chain lookup:', e) }
    }
    
    if (facts.length === 0) {
      // No CRM data found — tell Kiko to web search the entity
      const entityName = companyName || contactSearch || titleSuffix || sel?.title || ''
      return `${basePrompt}\n\n---\nNO CRM DATA FOUND for "${entityName}". Use web_search to research this company/person before responding. Search for: "${entityName}" to find their website, LinkedIn, recent news, funding, and key people. Then give a comprehensive brief based on what you find.`
    }
    return `${basePrompt}\n\n---\nLIVE CONTEXT (from CRM) — ALL THE DATA YOU NEED IS HERE:\n${facts.join('\n')}\n---\nCRITICAL INSTRUCTIONS:\n1. You already have all the relevant CRM data above. DO NOT call pipeline overview tools, deal summary tools, or any tool that returns data about OTHER entities.\n2. If you must use a tool, ONLY search for more information about the SPECIFIC entity mentioned above.\n3. Your response must be EXCLUSIVELY about this entity. Do NOT mention other deals, other tasks, or pipeline health.\n4. Do NOT give a pipeline overview, pipeline health assessment, or mention how many overdue tasks exist.\n5. Structure your response as: WHO they are → DEAL STATUS → WHAT TO DO NEXT → DRAFT EMAIL.`
  } catch {
    return basePrompt
  }
}

// ─── Build the /api/kiko prompt from a selected item ───
// Kiko's command-centre page-role prompt handles the rest — this just wraps
// the selected entity so she knows what to brief on.
// Van Hawke email voice — learned from 115 real sent emails. MUST be included in every draft.
const VH_EMAIL_VOICE = `
EMAIL VOICE RULES (MANDATORY — learned from 115 real sent emails, match EXACTLY):
- Opening: ALWAYS match the greeting style of the existing thread. If they wrote "Hi Matt" then reply "Hi [Name]". If the thread uses "Dear", use "Dear". When no thread exists, default to "Dear [First name],".
- Tone: Match the formality of the prospect's last message. If they're casual, be casual. If formal, be formal.
- Replies: SHORT. 2-4 paragraphs max. Each paragraph often a single sentence. Standalone one-line paragraphs for emphasis.
- Closing: "Kind regards," for formal. "Best," for warm. ALWAYS followed by signature block.
- NEVER use em dashes (—). Use commas or full stops instead. No dashes of any kind mid-sentence.
- Short declarative statements. Then a longer explanatory clause in a new sentence.
- NEVER use: "hope this finds you well", "just wanted to reach out", "circle back", "touch base", "synergy", "I think", "maybe", "hopefully", "excited to", "please don't hesitate", "don't hesitate to reach out", "I'd love to", "thrilled", "delighted"
- PREFERRED phrases: "at this level", "in practice", "while the category remains open", "long-term positioning", "happy to work around whatever is easiest", "much appreciated"
- NO AI FILLER. No corporate pleasantries. No "genuinely helpful" or "appreciate the candour". Every word earns its place.
- Write like a senior dealmaker who respects the reader's time, not a chatbot being polite.
`

function buildBriefPrompt(sel) {
  if (!sel) return 'Brief me.'
  const p = sel.payload || {}
  const titleParts = (sel?.title || '').split(/\s*[—–-]\s*/)
  const titleSuffix = titleParts.length > 1 ? titleParts[titleParts.length - 1].trim() : null
  if (sel.kind === 'reply') {
    const snippet = (p.detail || '').includes('Snippet:') ? p.detail.split('Snippet:')[1]?.trim() : (p.detail || '')
    const emailSubject = p.metadata?.subject || sel.title
    return `REPLY BRIEF — ${p.entity_name || 'prospect'} replied.

THEIR FULL REPLY (show this verbatim): "${snippet}"
Email thread subject: "${emailSubject}". Arrived ${relativeTime(p.created_at)}.

IMPORTANT: Do NOT show tool calls, tool responses, or internal reasoning. Present ONLY the clean brief.

Use Gmail search to find the LAST EMAIL WE SENT to ${p.entity_name || 'this person'} — show it for context.

Respond with ONLY these sections:
1. CONTEXT — ${p.entity_name || 'This person'}: role, company, where we stand. 2-3 lines.
2. OUR LAST EMAIL — the most recent email WE sent to them. Show the subject and key lines so the user knows what triggered this reply.
3. THEIR REPLY IN FULL — reproduce their complete reply text above. Do not truncate or summarise it.
4. DEFINITIVE NEXT STEP — EXACTLY what to do: who, when, what channel, what to achieve. One action, no hedging. EXPLAIN THE PSYCHOLOGY: why this approach works on this type of prospect at this stage (e.g. commitment-consistency, loss aversion, tactical empathy, scarcity). This is what makes your advice valuable.

Do NOT write a draft email. The draft will be generated separately.

${VH_EMAIL_VOICE}`
  }
  if (sel.kind === 'task') {
    const d = p.data || {}
    const bits = [`Task: "${sel.title}"`]
    if (d.type) bits.push(`Type: ${d.type}`)
    if (d.company) bits.push(`Company: ${d.company}`)
    if (d.contact) bits.push(`Contact: ${d.contact}`)
    if (d.dueDate) bits.push(`Due: ${d.dueDate}`)
    if (d.notes) bits.push(`Notes: ${d.notes}`)
    return `Brief on ${d.contact || titleSuffix || 'the contact'} at ${d.company || 'their company'}.\n\n${bits.join('\n')}\n\nIMPORTANT: Do NOT show tool calls, tool responses, or internal reasoning. Present ONLY the clean brief.\n\nCRITICAL: "${d.contact || titleSuffix}" is a PERSON'S NAME, not a company. Address the email "Hi ${(d.contact || titleSuffix || '').split(' ')[0]}," — NEVER "Hi ${d.company || ''},". The contact field is ALWAYS a person.\n\nRESPOND WITH ONLY THESE 4 SECTIONS:\n1. CONTEXT — ${d.contact || titleSuffix || 'This person'}: role, company, one line on where we stand. 2-3 lines max.\n2. LAST COMMS — search Gmail for the last email we sent or received from ${d.contact || 'this person'}. Show the subject line and key content of just the most recent email for context.\n3. DEFINITIVE NEXT STEP — EXACTLY what to do: who, when, what channel, what the message should achieve. One action, no hedging.\n4. DRAFT EMAIL — Address "Hi ${(d.contact || titleSuffix || '').split(' ')[0]}," (the person, NOT the company). Subject: line, then greeting, body, sign-off. No em dashes.\n\nThis is about ${d.contact || d.company || sel.title} ONLY. Keep it short and actionable.\n\n${VH_EMAIL_VOICE}`
  }
  if (sel.kind === 'deal') {
    return `FOCUS: Brief me ONLY on this specific deal. Do NOT give a general pipeline review.\n\nDeal: ${p.company || p.title}\nStage: ${p.stage}\nValue: ${p.value ? '$' + p.value : 'n/a'}\nDays since activity: ${p.daysSince}\n\nRespond with ONLY:\n1. ACCOUNT STATUS — where we are with ${p.company || p.title} specifically, what's happened, key contacts\n2. NEXT MOVE — the single best action to progress this deal\n3. MARKET SIGNALS — any recent news or signals on this company\n4. DRAFT EMAIL — format with Subject: on its own line, then Dear [Name], body, Kind regards\n\nStay focused on ${p.company || p.title} ONLY. Senior sales voice, specific names and dates.\n\n${VH_EMAIL_VOICE}`
  }
  if (sel.kind === 'signal') {
    return `SPONSORSHIP NEWS ANALYSIS — "${sel.title}"

Entity: ${p.entity_name || 'unknown'}
Detail: "${p.detail || ''}"

Look up ${p.entity_name || 'this entity'} in our CRM and partnership matrix.

Give me:
1. WHAT HAPPENED — full breakdown of this announcement/deal
2. COMMERCIAL IMPACT — what this means for Van Hawke's pipeline and competitive position
3. ACTION REQUIRED — should we act on this, and if so, specific next step
4. DRAFT OUTREACH — if there's an opportunity, a draft email to the relevant contact`
  }
  if (sel.kind === 'followup') {
    return `I need a re-engagement brief for ${p.recipient_name || p.recipient_email} at ${p.company || 'their company'}.\n\nOriginal email subject: "${p.subject || ''}"\nSent: ${p.sent_at ? new Date(p.sent_at).toLocaleDateString('en-GB') : 'unknown'}\nFollow-up due: ${p.follow_up_due_at ? new Date(p.follow_up_due_at).toLocaleDateString('en-GB') : 'unknown'}\nStatus: ${p.status}\n\nGive me:\n1. LAST CORRESPONDENCE — search Gmail for our full email thread with ${p.recipient_name || p.recipient_email}. Show the last email WE sent (full text) and any reply received. Include dates.\n2. WHY NO REPLY — psychological analysis of why they haven't responded, based on their role, company stage, and timing\n3. DEFINITIVE NEXT STEP — tell me EXACTLY what to do: when to send, what angle to use, what channel. One clear action. No hedging.\n4. DRAFT FOLLOW-UP EMAIL — Subject: line, Dear [Name], body, Kind regards. Use a completely different angle from the original — don't just "check in."\n\n${VH_EMAIL_VOICE}`
  }
  if (sel.kind === 'campaign') {
    return `Brief me on campaign prospect: ${p.contact_name || 'Unknown'} at ${p.company || 'their company'}.\n\nCurrent step: ${p.current_step}\nNext send scheduled: ${p.next_send_at ? new Date(p.next_send_at).toLocaleDateString('en-GB') : 'pending'}\n\nGive me: (1) company background, (2) where they are in the sequence, (3) whether we should continue, pause, or escalate this prospect.`
  }
  return `Brief me on: ${sel.title}.`
}

export default function OutreachIntelligence({ user }) {
  const nav = useNavigate()
  const [loading, setLoading] = useState(true)
  const [deals, setDeals] = useState([])
  const [hotReplies, setHotReplies] = useState([])
  const [signals, setSignals] = useState([])
  const [campaignActivity, setCampaignActivity] = useState([])
  const [mainTab, setMainTab] = useState('followups')
  const [intelTab, setIntelTab] = useState('f1')
  const [taskFilter, setTaskFilter] = useState('overdue')
  const [showNewTask, setShowNewTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskCompany, setNewTaskCompany] = useState('')
  const [newTaskDue, setNewTaskDue] = useState('')

  // Shared live state — tasks, followUps, actions all from context
  const live = useKikoLive()
  const tasks = live.tasks
  const followUps = live.followUps

  // Selected item state — drives right pane
  const [selected, setSelected] = useState(null) // { kind, id, title, meta, payload }
  const [brief, setBrief] = useState('')
  const [briefLoading, setBriefLoading] = useState(false)
  const briefAbortRef = useRef(null)
  const [showDraft, setShowDraft] = useState(false)
  const [draftSubject, setDraftSubject] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [draftTone, setDraftTone] = useState('advisory')
  const [separateDraft, setSeparateDraft] = useState('')
  const [draftGenerating, setDraftGenerating] = useState(false)

  const isSuperAdmin = user?.app_metadata?.role === 'super_admin'

  const loadData = async () => {
    setLoading(true)
    try {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const signalTypes = ['partnership_detected', 'new_partnership', 'competitive_change', 'company_signal', 'proactive_intel', 'prediction', 'cognitive_analysis', 'cognitive_synthesis', 'convergence', 'proactive_recommendation', 'follow_up_overdue']
      const [dealsRes, hotRes, signalRes, campaignRes] = await Promise.all([
        supabase.from('deals').select('id, data, updated_at')
          .not('data->>status', 'in', '("won","lost")')
          .order('updated_at', { ascending: false }),
        supabase.from('kiko_alerts')
          .select('id, type, title, detail, entity_name, entity_id, metadata, created_at')
          .eq('dismissed', false)
          .or('type.like.reply_from%,type.eq.linkedin_reply,type.eq.email_reply,type.eq.email_reply_manual,type.eq.linkedin_connection_accepted,type.like.linkedin_connection%')
          .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
          .order('created_at', { ascending: false })
          .limit(20),
        supabase.from('kiko_alerts')
          .select('id, type, severity, title, detail, entity_name, created_at')
          .in('type', signalTypes)
          .eq('dismissed', false)
          .in('severity', ['high', 'critical', 'medium'])
          .gte('created_at', weekAgo)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase.from('kiko_sequence_enrollments')
          .select('id, contact_name, company, status, current_step, next_send_at, sequence_id, updated_at')
          .eq('status', 'active')
          .order('next_send_at', { ascending: true })
          .limit(15),
      ])
      setDeals(dealsRes.data || [])
      setHotReplies((() => {
        const raw = hotRes.data || []
        // Deduplicate: prefer email_reply_manual (has snippet) over email_reply (no snippet) for same entity
        const seen = new Map()
        for (const r of raw) {
          const key = (r.entity_name || '').toLowerCase()
          const existing = seen.get(key)
          if (!existing || (r.type === 'email_reply_manual' && existing.type !== 'email_reply_manual')) {
            seen.set(key, r)
          }
        }
        return [...seen.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      })())
      setSignals((signalRes.data || []).filter(s => {
        const text = `${s.title} ${s.detail} ${s.entity_name}`.toLowerCase()
        // Permanently exclude eyewear/fashion/non-sports content
        if (/eyewear|gentle.?monster|kering|luxottica|essilor|sunglass|optical|lens.?craft|safilo|marchon|maui.?jim/i.test(text)) return false
        // ONLY show actual sports sponsorship/partnership content — not competitor intelligence
        const isSportsSponsorship = /sponsor|partner|naming.?rights|title.?sponsor|team.?deal|paddock|grid|race.?week|category.?exclusive/i.test(text)
          && /\bf1\b|formula.?1|formula.?e|fe\b|motogp|wec|le mans|indycar|nascar|rally|endurance|motorsport/i.test(text)
        const isAgencySignal = s.title?.includes('[AGENCY]')
        const isPartnership = s.type === 'partnership_detected' || s.type === 'new_partnership'
        return isSportsSponsorship || isAgencySignal || isPartnership
      }))
      setCampaignActivity(campaignRes.data || [])
    } catch (err) {
      console.error('[CommandCentre] load', err)
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const completeTask = async (task, e) => {
    e?.stopPropagation()
    if (selected?.kind === 'task' && selected.id === task.id) setSelected(null)
    live.completeTask(task)
    showToast('Task completed', 'success')
  }

  const markFollowUpDone = async (fu, e) => {
    e?.stopPropagation()
    if (selected?.kind === 'followup' && selected.id === fu.id) setSelected(null)
    live.clearFollowUp(fu)
    showToast('Follow-up cleared', 'success')
  }

  const selectFollowUp = (fu) => setSelected({
    kind: 'followup', id: fu.id,
    title: `${fu.recipient_name || fu.recipient_email} — ${fu.company || ''}`,
    meta: `${fu.subject || '(no subject)'} · Sent ${relativeTime(fu.sent_at)} · Due ${dueLabel(fu.follow_up_due_at)}`,
    payload: fu,
  })

  const selectCampaign = (c) => setSelected({
    kind: 'campaign', id: c.id,
    title: `${c.contact_name || 'Unknown'} — ${c.company || ''}`,
    meta: `Step ${c.current_step} · Next send ${c.next_send_at ? relativeTime(c.next_send_at) : 'pending'}`,
    payload: c,
  })

  const handleClearAllOverdue = async () => {
    if (selected?.kind === 'task') setSelected(null)
    live.clearAllOverdue()
    showToast('Overdue tasks cleared', 'success')
  }

  const createTask = async () => {
    if (!newTaskTitle.trim()) return
    const taskData = {
      title: newTaskTitle.trim(),
      type: 'follow_up',
      company: newTaskCompany.trim() || null,
      dueDate: newTaskDue || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      completed: false,
      source: 'manual',
    }
    const { data, error } = await supabase.from('tasks').insert({ data: taskData, updated_at: new Date().toISOString() }).select('id').single()
    if (!error && data) {
      setTasks(prev => [{ id: data.id, data: taskData, updated_at: new Date().toISOString() }, ...prev])
      setNewTaskTitle(''); setNewTaskCompany(''); setNewTaskDue(''); setShowNewTask(false)
      showToast('Task created', 'success')
    }
  }

  // ── Derived groupings ──
  const weightedPipeline = useMemo(
    () => deals.reduce((s, d) => s + ((parseFloat(d.data?.value) || 0) * ((STAGE_PROB[d.data?.stage] || 10) / 100)), 0),
    [deals]
  )
  const now = Date.now()
  const overdueTasks = useMemo(
    () => tasks.filter(t => t.data?.dueDate && new Date(t.data.dueDate) < new Date()),
    [tasks]
  )
  const thisWeekTasks = useMemo(
    () => tasks.filter(t => {
      if (!t.data?.dueDate) return false
      const due = new Date(t.data.dueDate)
      if (due < new Date()) return false
      return (due - now) / 86400000 <= 7
    }).sort((a, b) => new Date(a.data.dueDate) - new Date(b.data.dueDate)),
    [tasks, now]
  )
  const staleDeals = useMemo(() => {
    return deals
      .map(d => {
        const lastAct = d.data?.lastActivity ? new Date(d.data.lastActivity).getTime() : 0
        const updatedAt = d.updated_at ? new Date(d.updated_at).getTime() : 0
        const mostRecent = Math.max(lastAct, updatedAt)
        const days = mostRecent ? Math.floor((now - mostRecent) / 86400000) : 999
        const stage = d.data?.stage
        const prob = (STAGE_PROB[stage] || 10) / 100
        return { ...d.data, _id: d.id, daysSince: days, stage, weighted: (parseFloat(d.data?.value) || 0) * prob }
      })
      // Only show deals with genuine activity that went stale (30-180 days)
      // Exclude "never touched" deals (999d) — those aren't stale, they're untouched
      .filter(x => x.daysSince > 30 && x.daysSince < 365)
      .sort((a, b) => b.weighted - a.weighted)
      .slice(0, 8)
  }, [deals, now])

  // ── Kiko brief loader (SSE streaming from /api/kiko) ──
  // Pre-fetches relevant deal/contact/email context for the selected item and stuffs it
  // directly into the message string — this is a workaround because /api/kiko isn't
  // consuming `pageContext.selectedItem` for command-centre task detail, which caused
  // briefs to come back generic with no company/contact context attached.
  useEffect(() => {
    if (!selected) { setBrief(''); setSeparateDraft(''); return }
    if (briefAbortRef.current) briefAbortRef.current.abort()
    const controller = new AbortController()
    briefAbortRef.current = controller
    setBrief('')
    setBriefLoading(true)
    ;(async () => {
      try {
        // Enrich the prompt with live data from Supabase for task/deal/reply
        const enriched = await enrichSelectedForBrief(selected)
        const res = await fetch('https://api.vanhawke.agency/api/kiko', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: enriched,
            userEmail: user?.email || 'sunny@vanhawke.com',
            currentPage: 'command-centre',
            pageContext: { selectedItem: selected },
          }),
          signal: controller.signal,
        })
        if (!res.body) { setBriefLoading(false); return }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          let idx
          while ((idx = buf.indexOf('\n\n')) !== -1) {
            const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2)
            chunk.split('\n').forEach(line => {
              if (!line.startsWith('data:')) return
              const raw = line.slice(5).trim()
              if (!raw || raw === '[DONE]') return
              try {
                const evt = JSON.parse(raw)
                if (evt.error || evt.type === 'error') {
                  setBrief('Kiko is temporarily unavailable. Please try again in a moment.')
                  return
                }
                const chunk = evt.delta || evt.text
                if (chunk) {
                  // Catch raw error JSON in the text stream
                  if (chunk.includes('"overloaded_error"') || chunk.includes('"type":"error"')) {
                    setBrief('Kiko is temporarily busy. Click the item again to retry.')
                    return
                  }
                  setBrief(prev => prev + chunk)
                }
              } catch {}
            })
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') console.error('[CommandCentre] brief', err)
      }
      setBriefLoading(false)
      
      // ── SEPARATE DRAFT GENERATION — lightweight draftOnly path, no tools ──
      if (selected?.kind === 'reply' || selected?.kind === 'task' || selected?.kind === 'followup') {
        // Small delay to ensure brief SSE connection is fully closed before draft fetch
        await new Promise(r => setTimeout(r, 500))
        const p = selected.payload || {}
        const entityName = p.entity_name || selected.title?.split('—')?.[1]?.trim() || ''
        const firstName = entityName.split(' ')[0] || 'there'
        const snippet = (p.detail || '').includes('Snippet:') ? p.detail.split('Snippet:')[1]?.trim() : (p.detail || '')
        const prospectEmail = p.prospect_email || p.email || p.metadata?.from || ''
        
        // Get the REAL email subject from the thread — not the alert title
        let subjectLine = (p.metadata?.subject || '').replace(/^Re:\s*/gi, '').trim()
        if (!subjectLine) {
          // Look up from email tracking (most recent sent email to this entity)
          try {
            const { data: tracked } = await supabase
              .from('kiko_outreach_queue')
              .select('subject')
              .ilike('to_email', `%${entityName.split(' ').pop().toLowerCase()}%`)
              .order('created_at', { ascending: false })
              .limit(1)
            if (tracked?.[0]?.subject) subjectLine = tracked[0].subject
          } catch {}
        }
        if (!subjectLine) {
          // Try email tracking table
          try {
            const { data: tracking } = await supabase
              .from('kiko_email_tracking')
              .select('subject')
              .ilike('recipient_email', `%${entityName.split(' ').pop()}%`)
              .order('sent_at', { ascending: false })
              .limit(1)
            if (tracking?.[0]?.subject) subjectLine = tracking[0].subject
          } catch {}
        }
        if (!subjectLine) subjectLine = (selected.title || '').replace(/^Re:\s*/i, '').replace(/^Reply from\s+/i, '').replace(/[!.]+$/, '')
        // Use the brief we just generated as context for the draft
        const briefRef = document.querySelector('.cc-detail-section-body')
        const briefContext = briefRef ? briefRef.innerText.slice(0, 1500) : ''
        setSeparateDraft('')
        setDraftGenerating(true)
        const draftController = new AbortController()
        console.log('[CC] Starting draft generation for', entityName, 'draftOnly=true')
        try {
          const safeContext = (briefContext || '').replace(/[^\x20-\x7E\n]/g, ' ').slice(0, 800)
          const draftRes = await fetch('https://api.vanhawke.agency/api/kiko', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              draftOnly: true,
              message: `Write a reply email to ${entityName}${prospectEmail ? ` (${prospectEmail})` : ''}.

Subject: Re: ${subjectLine}
${prospectEmail ? `To: ${prospectEmail}` : `To: [use their email if you know it]`}

Their message: "${snippet?.slice(0, 500)}"

${safeContext ? `Brief context from our analysis:\n${safeContext}` : ''}

Write the email now. Start with "Subject: Re: ${subjectLine}" then "To:" then greeting "Hi ${firstName}," then 2-3 paragraphs then "Best," sign-off.`,
              userEmail: user?.email || 'sunny@vanhawke.com',
            }),
            signal: draftController.signal,
          })
          if (draftRes.body) {
            const dr = draftRes.body.getReader()
            const dd = new TextDecoder()
            let dbuf = ''
            while (true) {
              const { done, value } = await dr.read()
              if (done) break
              dbuf += dd.decode(value, { stream: true })
              let didx
              while ((didx = dbuf.indexOf('\n\n')) !== -1) {
                const dchunk = dbuf.slice(0, didx); dbuf = dbuf.slice(didx + 2)
                dchunk.split('\n').forEach(line => {
                  if (!line.startsWith('data:')) return
                  const raw = line.slice(5).trim()
                  if (!raw || raw === '[DONE]') return
                  try {
                    const evt = JSON.parse(raw)
                    const txt = evt.delta || evt.text
                    if (txt) setSeparateDraft(prev => prev + txt)
                  } catch {}
                })
              }
            }
          }
        } catch (e) { if (e.name !== 'AbortError') console.error('[CC] draft gen error:', e) }
        setDraftGenerating(false)
      }
    })()
    return () => controller.abort()
  }, [selected, user?.email])

  // Channel helpers for Hot Reply cards
  const channelOf = (r) => r.type === 'email_bounced' ? 'bounce' : r.type?.includes('linkedin') ? 'linkedin' : r.type?.includes('email') ? 'email' : 'reply'
  const channelIcon = (ch) => ch === 'linkedin' ? <Linkedin size={11} /> : ch === 'bounce' ? <AlertTriangle size={11} /> : ch === 'email' ? <Mail size={11} /> : <MessageSquare size={11} />

  // Select helpers — translate each row into a common 'selected' shape
  const selectReply = (r) => setSelected({
    kind: 'reply', id: r.id,
    title: r.title || '(reply)',
    meta: `${r.entity_name || 'Unknown'} · ${relativeTime(r.created_at)}`,
    payload: r,
  })
  const selectTask = (t) => setSelected({
    kind: 'task', id: t.id,
    title: taskLabel(t),
    meta: [taskSub(t), t.data?.dueDate ? dueLabel(t.data.dueDate) : 'no due date'].filter(Boolean).join(' · '),
    payload: t,
  })
  const selectDeal = (d) => setSelected({
    kind: 'deal', id: d._id,
    title: d.company || d.title || 'Untitled',
    meta: `${d.stage || 'Unknown'} · ${fmtCurrency(parseFloat(d.value) || 0)} · ${d.daysSince}d since activity`,
    payload: d,
  })
  const selectSignal = (s) => setSelected({
    kind: 'signal', id: s.id,
    title: cleanTitle(s.title),
    meta: `${s.entity_name || ''} · ${relativeTime(s.created_at)}`.trim().replace(/^· /, ''),
    payload: s,
  })

  const isSelected = (kind, id) => selected?.kind === kind && selected?.id === id

  return (
    <div className="cc">
      <PageHeader
        eyebrowCategory="TODAY"
        eyebrowSuffix="Command Centre"
        title="Command Centre"
        stats={[
          { value: deals.length, label: 'Active deals' },
          { value: fmtCurrency(weightedPipeline), label: 'Weighted' },
          { value: hotReplies.length, label: 'Replies' },
          { value: followUps.length, label: 'Awaiting reply' },
          { value: tasks.length, label: 'Open tasks' },
        ]}
        toolbar={
          <button onClick={loadData} className="cc-refresh-btn" disabled={loading}>
            <RefreshCw size={12} className={loading ? 'spinning' : ''} />
            Refresh
          </button>
        }
      />

      <div className="cc-body">
        {/* HOT REPLIES BAND */}
        <div className="cc-hot-band">
          <div className="cc-hot-h">
            <h3><MessageSquare size={13} /> Alerts — Immediate Action</h3>
            {hotReplies.length > 0 && <span className="cc-hot-h-count">{hotReplies.length} new</span>}
            <span className="cc-hot-h-meta">last 24h</span>
          </div>
          {loading ? (
            <div className="cc-empty-row">Loading…</div>
          ) : hotReplies.length === 0 ? (
            <div className="cc-empty-row">No replies in last 24h · email replies, LinkedIn messages & connection acceptances land here when they arrive</div>
          ) : (
            <div className="cc-hot-scroll">
              {hotReplies.map(r => {
                const ch = channelOf(r)
                return (
                  <div
                    key={r.id}
                    className={`cc-hot-card ${isSelected('reply', r.id) ? 'selected' : ''}`}
                    onClick={() => selectReply(r)}
                  >
                    <div className="cc-hot-card-row1">
                      <div className={`cc-hot-card-channel ${ch}`}>{channelIcon(ch)}</div>
                      <div className="cc-hot-card-from">{r.entity_name || 'Unknown'}</div>
                      <div className="cc-hot-card-when">{relativeTime(r.created_at)}</div>
                      <button onClick={async (e) => { e.stopPropagation(); await supabase.from('kiko_alerts').update({ dismissed: true }).eq('id', r.id); await supabase.from('activities').insert({ type: 'alert_dismissed', entity_name: r.entity_name || r.title, subject: `Dismissed: ${r.title}`, status: 'completed' }).catch(() => {}); setHotReplies(prev => prev.filter(x => x.id !== r.id)); showToast('Alert cleared', 'success') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A0A0A0', fontSize: 13, padding: '0 2px', marginLeft: 4, lineHeight: 1 }} title="Dismiss">×</button>
                    </div>
                    <div className="cc-hot-card-title">
                      {r.type?.includes('connection') && <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 4, background: 'rgba(6,214,160,0.12)', color: '#06a87d', fontSize: 10, fontWeight: 600, marginRight: 6, verticalAlign: 'middle' }}>CONNECTED</span>}
                      {r.title || '(no subject)'}
                    </div>
                    {r.detail && r.detail.includes('Snippet:') && (
                      <div style={{ fontSize: 11, color: '#6B6B6B', marginTop: 3, fontStyle: 'italic', lineHeight: 1.4 }}>
                        "{(() => { const el = document.createElement('div'); el.innerHTML = r.detail.split('Snippet:')[1]?.trim().slice(0, 120); return el.textContent })()}…"
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* SECTION TABS */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(0,0,0,0.08)', marginBottom: 16, marginTop: 8 }}>
          {[
            { id: 'followups', label: 'Follow-ups' },
            { id: 'campaign', label: 'Campaign Activity' },
            { id: 'stale', label: 'Stale Deals' },
            { id: 'intel', label: 'Sponsorship News' },
          ].map(t => (
            <button key={t.id} onClick={() => { setMainTab(t.id); setSelected(null) }} style={{
              padding: '10px 18px', fontSize: 13, fontWeight: mainTab === t.id ? 600 : 400,
              color: mainTab === t.id ? '#0A0A0A' : '#6B6B6B',
              borderBottom: mainTab === t.id ? '2px solid #0A0A0A' : '2px solid transparent',
              background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
              cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif',
            }}>{t.label}</button>
          ))}
        </div>

        {/* MASTER-DETAIL GRID — hidden when intel tab active */}
        <div className="cc-grid">
          {/* LEFT: Grouped priority list */}
          <div className="cc-list">
            {mainTab === 'followups' && (<>
            {/* TASK FILTER TABS */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(0,0,0,0.06)', marginBottom: 8, alignItems: 'center' }}>
              {[
                { id: 'overdue', label: 'Overdue', count: overdueTasks.length },
                { id: 'week', label: 'This week', count: thisWeekTasks.length },
                { id: 'all', label: 'All', count: tasks.length },
              ].map(tab => (
                <button key={tab.id} onClick={() => setTaskFilter(tab.id)} style={{
                  padding: '8px 14px', fontSize: 12, fontWeight: taskFilter === tab.id ? 600 : 400,
                  color: taskFilter === tab.id ? '#0A0A0A' : '#6B6B6B',
                  borderBottom: taskFilter === tab.id ? '2px solid #0A0A0A' : '2px solid transparent',
                  background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                  cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif',
                }}>
                  {tab.label} <span style={{ color: '#A0A0A0', marginLeft: 4 }}>{tab.count}</span>
                </button>
              ))}
              <button onClick={() => setShowNewTask(!showNewTask)} style={{ marginLeft: 'auto', width: 28, height: 28, borderRadius: 6, border: '1px solid rgba(0,0,0,0.10)', background: 'none', cursor: 'pointer', fontSize: 14, color: '#6B6B6B', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Create task">+</button>
            </div>

            {/* INLINE TASK CREATION */}
            {showNewTask && (
              <div style={{ padding: '10px 12px', marginBottom: 8, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, background: '#FAFAF7', fontFamily: 'Inter, system-ui, sans-serif' }}>
                <input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} placeholder="Task title..." style={{ width: '100%', padding: '6px 8px', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 4, fontSize: 13, marginBottom: 6, fontFamily: 'Inter, system-ui, sans-serif' }} onKeyDown={e => e.key === 'Enter' && createTask()} autoFocus />
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={newTaskCompany} onChange={e => setNewTaskCompany(e.target.value)} placeholder="Company (optional)" style={{ flex: 1, padding: '5px 8px', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 4, fontSize: 12, fontFamily: 'Inter, system-ui, sans-serif' }} />
                  <input type="date" value={newTaskDue} onChange={e => setNewTaskDue(e.target.value)} style={{ padding: '5px 8px', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 4, fontSize: 12, fontFamily: 'Inter, system-ui, sans-serif' }} />
                  <button onClick={createTask} disabled={!newTaskTitle.trim()} style={{ padding: '5px 12px', background: '#0A0A0A', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif', opacity: newTaskTitle.trim() ? 1 : 0.4 }}>Add</button>
                </div>
              </div>
            )}

            {/* FILTERED TASKS */}
            <div className="cc-group">
              <div className="cc-group-h">
                <h3><AlertTriangle size={10} />{taskFilter === 'overdue' ? 'Overdue' : taskFilter === 'week' ? 'This week' : 'All tasks'}</h3>
                <span className="cc-group-count">{(taskFilter === 'overdue' ? overdueTasks : taskFilter === 'week' ? thisWeekTasks : tasks).length}</span>
                {taskFilter === 'overdue' && overdueTasks.length > 0 && (
                  <button onClick={handleClearAllOverdue} style={{ marginLeft: 'auto', padding: '3px 10px', borderRadius: 6, background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.12)', color: '#dc2626', fontSize: 11, fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 500, cursor: 'pointer' }}>Clear all overdue</button>
                )}
              </div>
              {(() => {
                const filtered = taskFilter === 'overdue' ? overdueTasks : taskFilter === 'week' ? thisWeekTasks : tasks
                return filtered.length === 0 ? (
                  <div className="cc-empty-row">{taskFilter === 'overdue' ? 'Nothing overdue' : taskFilter === 'week' ? 'No tasks this week' : 'No open tasks'}</div>
                ) : filtered.map(t => (
                  <div
                    key={t.id}
                    className={`cc-row ${isSelected('task', t.id) ? 'selected' : ''}`}
                    onClick={() => selectTask(t)}
                  >
                    <button className="cc-row-icon terra" onClick={e => completeTask(t, e)} title="Mark done">
                      <Square size={10} />
                    </button>
                    <div className="cc-row-body">
                      <div className="cc-row-title">{taskLabel(t)}</div>
                      <div className="cc-row-meta">
                        {taskSub(t) && <>{taskSub(t)} · </>}
                        {dueLabel(t.data?.dueDate)}
                        {t.data?.dueDate && new Date(t.data.dueDate) < new Date() && <span className="cc-row-tag overdue">OVERDUE</span>}
                      </div>
                    </div>
                  </div>
                ))
              })()}
            </div>

            </>)}
            {mainTab === 'stale' && (<>
            {/* STALE DEALS */}
            <div className="cc-group">
              <div className="cc-group-h">
                <h3><Clock size={10} />Stale deals</h3>
                <span className="cc-group-count">{staleDeals.length}</span>
              </div>
              {staleDeals.length === 0 ? (
                <div className="cc-empty-row">All deals active</div>
              ) : staleDeals.slice(0, 6).map(d => (
                <div
                  key={d._id}
                  className={`cc-row ${isSelected('deal', d._id) ? 'selected' : ''}`}
                  onClick={() => selectDeal(d)}
                >
                  <div className="cc-row-icon amber"><TrendingUp size={10} /></div>
                  <div className="cc-row-body">
                    <div className="cc-row-title">{d.company || d.title || 'Untitled'}</div>
                    <div className="cc-row-meta">
                      {d.stage} · {fmtCurrency(parseFloat(d.value) || 0)} · {d.daysSince}d idle
                    </div>
                  </div>
                </div>
              ))}
            </div>

            </>)}
            {mainTab === 'followups' && (<>
            {/* FOLLOW-UP TRACKER */}
            {followUps.length > 0 && (
              <div className="cc-group">
                <div className="cc-group-h">
                  <h3><Send size={10} />Awaiting replies</h3>
                  <span className="cc-group-count">{followUps.length}</span>
                </div>
                {followUps.map(fu => {
                  const isOverdue = fu.follow_up_due_at && new Date(fu.follow_up_due_at) < new Date()
                  return (
                    <div
                      key={fu.id}
                      className={`cc-row ${isSelected('followup', fu.id) ? 'selected' : ''}`}
                      onClick={() => selectFollowUp(fu)}
                    >
                      <button className="cc-row-icon sage" onClick={e => markFollowUpDone(fu, e)} title="Mark done">
                        <CheckSquare size={10} />
                      </button>
                      <div className="cc-row-body">
                        <div className="cc-row-title">{fu.recipient_name || fu.recipient_email}</div>
                        <div className="cc-row-meta">
                          {fu.company && <>{fu.company} · </>}
                          {fu.subject && <>{fu.subject.slice(0, 40)} · </>}
                          {dueLabel(fu.follow_up_due_at)}
                          {isOverdue && <span className="cc-row-tag overdue">OVERDUE</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            </>)}
            {mainTab === 'campaign' && (<>
            {/* CAMPAIGN ACTIVITY */}
            {campaignActivity.length > 0 && (
              <div className="cc-group">
                <div className="cc-group-h">
                  <h3><Zap size={10} />Active sequences</h3>
                  <span className="cc-group-count">{campaignActivity.length}</span>
                </div>
                {campaignActivity.slice(0, 8).map(c => (
                  <div
                    key={c.id}
                    className={`cc-row ${isSelected('campaign', c.id) ? 'selected' : ''}`}
                    onClick={() => selectCampaign(c)}
                  >
                    <div className="cc-row-icon purple"><Send size={10} /></div>
                    <div className="cc-row-body">
                      <div className="cc-row-title">{c.contact_name || 'Unknown'}</div>
                      <div className="cc-row-meta">
                        {c.company && <>{c.company} · </>}
                        Step {c.current_step} · {c.next_send_at ? `Next: ${relativeTime(c.next_send_at)}` : 'pending'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            </>)}
            {mainTab === 'followups' && (<>
            {/* THIS WEEK TASKS */}
            <div className="cc-group">
              <div className="cc-group-h">
                <h3><Calendar size={10} />Due this week</h3>
                <span className="cc-group-count">{thisWeekTasks.length}</span>
              </div>
              {thisWeekTasks.length === 0 ? (
                <div className="cc-empty-row">Nothing due this week</div>
              ) : thisWeekTasks.slice(0, 8).map(t => (
                <div
                  key={t.id}
                  className={`cc-row ${isSelected('task', t.id) ? 'selected' : ''}`}
                  onClick={() => selectTask(t)}
                >
                  <button className="cc-row-icon sage" onClick={e => completeTask(t, e)} title="Mark done">
                    <Square size={10} />
                  </button>
                  <div className="cc-row-body">
                    <div className="cc-row-title">{taskLabel(t)}</div>
                    <div className="cc-row-meta">
                      {taskSub(t) && <>{taskSub(t)} · </>}
                      {dueLabel(t.data?.dueDate)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            </>)}
            {mainTab === 'intel' && (<>
            {/* SPONSORSHIP NEWS with series sub-tabs */}
            <div className="cc-group">
              <div className="cc-group-h">
                <h3><Zap size={10} />Sponsorship News</h3>
                <span className="cc-group-count">{signals.length}</span>
              </div>
              <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(0,0,0,0.06)', padding: '0 16px' }}>
                {[
                  { id: 'f1', label: 'F1', match: /formula.?1|f1|\bhaas\b|\balpine\b|\bmclaren\b|\bferrari\b|\bredbull\b|\bred bull\b|\bmercedes\b|\bwilliams\b|\baston martin\b|\bkick sauber\b|\bracing bulls\b|\bcadillac\b/i },
                  { id: 'fe', label: 'Formula E', match: /formula.?e|\bfe\b|\bjaguar tcs\b|\bds penske\b|\bmahindra\b/i },
                  { id: 'wec', label: 'WEC', match: /\bwec\b|\ble mans\b|\bendurance\b|\bhypercar\b/i },
                  { id: 'motogp', label: 'MotoGP', match: /motogp|\bmoto.?gp\b|\bducati\b|\baprilia\b/i },
                  { id: 'all', label: 'All' },
                ].map(tab => {
                  const count = tab.id === 'all' ? signals.length : signals.filter(s => tab.match?.test(`${s.title} ${s.detail} ${s.entity_name}`)).length
                  return (
                    <button key={tab.id} onClick={() => setIntelTab(tab.id)} style={{
                      padding: '8px 14px', fontSize: 12, fontWeight: intelTab === tab.id ? 600 : 400,
                      color: intelTab === tab.id ? '#0A0A0A' : '#6B6B6B',
                      borderBottom: intelTab === tab.id ? '2px solid #0A0A0A' : '2px solid transparent',
                      background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                      cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif',
                    }}>
                      {tab.label} <span style={{ color: '#A0A0A0', marginLeft: 3 }}>{count}</span>
                    </button>
                  )
                })}
              </div>
              {(() => {
                const tabs = { f1: /formula.?1|f1|\bhaas\b|\balpine\b|\bmclaren\b|\bferrari\b|\bredbull\b|\bred bull\b|\bmercedes\b|\bcadillac\b|\baston martin\b|\bwilliams\b/i, fe: /formula.?e|\bfe\b|\bjaguar tcs\b|\bds penske\b|\bmahindra\b/i, wec: /\bwec\b|\ble mans\b|\bendurance\b|\bhypercar\b/i, motogp: /motogp|\bmoto.?gp\b|\bducati\b|\baprilia\b/i }
                const filtered = intelTab === 'all' ? signals : signals.filter(s => tabs[intelTab]?.test(`${s.title} ${s.detail} ${s.entity_name}`))
                return filtered.length === 0 ? (
                  <div className="cc-empty-row">No sponsorship news{intelTab !== 'all' ? ` for ${intelTab.toUpperCase()}` : ''} this week</div>
                ) : filtered.slice(0, 15).map(s => (
                  <div key={s.id} className={`cc-row ${isSelected('signal', s.id) ? 'selected' : ''}`} onClick={() => selectSignal(s)} style={{ cursor: 'pointer' }}>
                    <div className="cc-row-icon purple"><Zap size={10} /></div>
                    <div className="cc-row-body">
                      <div className="cc-row-title">{cleanTitle(s.title)}</div>
                      <div className="cc-row-meta">
                        {s.entity_name && <>{s.entity_name} · </>}
                        {relativeTime(s.created_at)}
                      </div>
                    </div>
                  </div>
                ))
              })()}
            </div>
            </>)}
          </div>

          {/* RIGHT: Detail pane with Kiko brief */}
          <aside className="cc-detail">
            {!selected ? (
              <div className="cc-detail-empty">
                <div className="cc-detail-empty-icon"><Inbox size={22} /></div>
                <h3>Select an item</h3>
                <p>Click any priority item on the left and Kiko will brief you — where we are, what happens next, market context, and a draft if needed.</p>
              </div>
            ) : (
              <>
                <div className="cc-detail-h">
                  <div className="cc-detail-eyebrow">
                    {selected.kind === 'reply' && <><MessageSquare size={10} /> REPLY</>}
                    {selected.kind === 'task' && <><CheckSquare size={10} /> TASK</>}
                    {selected.kind === 'deal' && <><TrendingUp size={10} /> DEAL</>}
                    {selected.kind === 'signal' && <><Zap size={10} /> SIGNAL</>}
                    {selected.kind === 'followup' && <><Send size={10} /> FOLLOW-UP</>}
                    {selected.kind === 'campaign' && <><Zap size={10} /> CAMPAIGN</>}
                  </div>
                  <h2 className="cc-detail-title">{selected.title}</h2>
                  <div className="cc-detail-sub">{selected.meta}</div>
                </div>
                <div className="cc-detail-body">
                  {brief ? (
                    <div className="cc-detail-section-body" style={{ lineHeight: 1.65, fontSize: 13.5, color: '#2A2A2A', fontFamily: 'Inter, system-ui, sans-serif' }} dangerouslySetInnerHTML={{ __html: parseBriefMarkdown(stripToolCalls(isEmailDraft(brief) ? stripDraftFromBrief(brief) : brief)) }} />
                  ) : briefLoading ? (
                    <div className="cc-detail-loading">
                      <span className="dot" /><span className="dot" /><span className="dot" />
                      Kiko is briefing you…
                    </div>
                  ) : null}

                  {/* EMAIL DRAFT — generated as a separate API call, not parsed from brief */}
                  {draftGenerating && (
                    <div style={{ marginTop: 14, padding: 16, background: 'rgba(0,0,0,0.02)', borderRadius: 8 }}>
                      <span className="dot" /><span className="dot" /><span className="dot" /> Drafting reply...
                    </div>
                  )}
                  {!draftGenerating && separateDraft && isEmailDraft(separateDraft) && (
                    <div style={{ marginTop: 14 }}>
                      <EmailDraft key={'draft-' + separateDraft.length} text={separateDraft} defaultSender={selected?.kind === 'reply' || selected?.kind === 'task' || selected?.kind === 'followup' ? 'matt' : null} defaultTo={selected?.payload?.metadata?.from || selected?.payload?.prospect_email || selected?.payload?.email || ''} />
                    </div>
                  )}

                  {/* ACTION BUTTONS — below the composer */}
                  {!briefLoading && brief && (
                    <div className="cc-detail-actions" style={{ marginTop: 14 }}>
                      {selected.kind === 'task' && (
                        <button className="cc-detail-btn primary" onClick={e => completeTask(selected.payload, e)}>
                          Mark complete <CheckSquare size={11} />
                        </button>
                      )}
                      {selected.kind === 'deal' && (
                        <button className="cc-detail-btn primary" onClick={() => nav('/pipeline')}>
                          Open in Pipeline <ExternalLink size={11} />
                        </button>
                      )}
                      {selected.kind === 'reply' && selected.payload?.entity_id && (
                        <button className="cc-detail-btn primary" onClick={() => nav(`/contacts/${selected.payload.entity_id}`)}>
                          Open contact <ExternalLink size={11} />
                        </button>
                      )}
                      {selected.kind === 'followup' && (
                        <button className="cc-detail-btn primary" onClick={e => markFollowUpDone(selected.payload, e)}>
                          Mark cleared <CheckSquare size={11} />
                        </button>
                      )}
                      {selected.kind === 'signal' && (
                        <button className="cc-detail-btn primary" onClick={() => nav('/campaigns')}>
                          Generate campaign <Zap size={11} />
                        </button>
                      )}
                      {selected.kind === 'campaign' && (
                        <button className="cc-detail-btn primary" onClick={() => selected.payload?.sequence_id && nav(`/campaigns/${selected.payload.sequence_id}`)}>
                          Open campaign <ExternalLink size={11} />
                        </button>
                      )}
                      <button className="cc-detail-btn secondary" onClick={() => setSelected(null)}>Close</button>
                    </div>
                  )}
                </div>
              </>
            )}
          </aside>
        </div>

      </div>
    </div>
  )
}
