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
  Zap, TrendingUp, Clock, RefreshCw, Inbox, Send, ExternalLink, Calendar,
  Search
} from 'lucide-react'
import './OutreachIntelligence.css'
import EmailDraft, { isEmailDraft } from '@/components/kiko/EmailDraft'

// Simple markdown → HTML for Kiko brief responses
// Strip draft email section from brief (to avoid showing it twice when EmailDraft renders)
function stripDraftFromBrief(text) {
  if (!text) return text
  return text.replace(/\n*(?:#{1,4}\s*)?(?:\d+\.\s*)?(?:DRAFT\s*(?:REPLY|EMAIL|OUTREACH|FOLLOW.?UP))[:\s—\-]*[\s\S]*/i, '\n').trim()
}

function extractDraftFromBrief(text) {
  if (!text) return ''
  const match = text.match(/(?:#{1,4}\s*)?(?:\d+\.\s*)?(?:DRAFT\s*(?:REPLY|EMAIL|OUTREACH|FOLLOW.?UP))[:\s—\-]*([\s\S]*)/i)
  if (!match?.[1]) return ''
  let draft = match[1].trim()
  draft = draft.replace(/^\s*#+\s*/gm, '')
  return draft
}

function stripToolCalls(text) {
  if (!text) return text
  return text
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
    .replace(/<tool_response>[\s\S]*?<\/tool_response>/g, '')
    .replace(/<tool_response>[\s\S]*/g, '')
    .replace(/<tool_call>[\s\S]*/g, '')
    .replace(/\{"success"\s*:\s*true[\s\S]*?\}\s*/g, '')
    .replace(/\{"emails"\s*:[\s\S]*?\}\s*/g, '')
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
async function enrichSelectedForBrief(sel) {
  const basePrompt = buildBriefPrompt(sel)
  try {
    const p = sel?.payload || {}
    const d = p.data || {}
    const titleParts = (sel?.title || '').split(/\s*[—–-]\s*/)
    const titleSuffix = titleParts.length > 1 ? titleParts[titleParts.length - 1].trim() : null
    const companyName = d.company || p.company || sel?.meta?.split('·')?.[0]?.trim() || p.entity_name || titleSuffix || null
    const contactName = d.contact || p.contact || p.contactName || null
    if (!companyName && !contactName) return basePrompt

    const facts = []
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
        const { data: deals } = await supabase
          .from('deals').select('id, data, updated_at').order('updated_at', { ascending: false }).limit(200)
        const related = (deals || []).filter(dl => ((dl.data?.company || '').toLowerCase().trim() === needle)).slice(0, 3)
        if (related.length) {
          facts.push(`OUR DEALS WITH THEM: ${related.map(r => `[${r.data?.stage || '?'}] ${r.data?.title || '(untitled)'} — ${r.data?.value ? '$' + r.data.value : 'no value'}`).join(' | ')}`)
        }
      }
    }
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
    if (companyName) {
      const { data: acts } = await supabase
        .from('activities').select('type, subject, direction, created_at')
        .ilike('entity_name', `%${companyName}%`)
        .order('created_at', { ascending: false }).limit(5)
      if (acts?.length) {
        facts.push(`RECENT ACTIVITY LOG:\n${acts.map(a => `  [${new Date(a.created_at).toLocaleDateString('en-GB', { day:'numeric',month:'short' })}] ${a.direction === 'inbound' ? '← IN' : '→ OUT'} ${a.type}: ${a.subject || '(no subject)'}`).join('\n')}`)
      }
    }
    if (companyName) {
      const { data: alerts } = await supabase
        .from('kiko_alerts').select('title, detail, created_at')
        .ilike('entity_name', `%${companyName}%`)
        .order('created_at', { ascending: false }).limit(3)
      if (alerts?.length) {
        facts.push(`RECENT SIGNALS/ALERTS:\n${alerts.map(a => `  [${new Date(a.created_at).toLocaleDateString('en-GB', { day:'numeric',month:'short' })}] ${a.title}`).join('\n')}`)
      }
    }
    const entityName = companyName || contactName || titleSuffix || ''
    if (entityName) {
      try {
        const chainPromise = (async () => {
          const { data: matchingSteps, error: err1 } = await supabase
            .from('kiko_reasoning_chains')
            .select('event_id')
            .filter('input->>entity_name', 'ilike', `%${entityName}%`)
            .order('created_at', { ascending: false })
            .limit(2)
          if (err1) { console.warn('[enrichBrief] chain step1 error:', err1.message); return null }
          if (!matchingSteps?.length) return null
          const eventIds = [...new Set(matchingSteps.map(s => s.event_id))]
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
            facts.push(`\n--- KIKO'S EXISTING ANALYSIS (from cognitive reasoning chain, generated ${new Date(chains[0].created_at).toLocaleDateString('en-GB')}) ---\n${parts.join('\n')}\n--- END EXISTING ANALYSIS ---\nCRITICAL: Use the above analysis as your definitive recommendation. Do NOT contradict it.`)
          }
        }
      } catch (e) { console.error('[enrichBrief] reasoning chain lookup:', e) }
    }
    
    if (facts.length === 0) {
      const entityName = companyName || contactSearch || titleSuffix || sel?.title || ''
      return `${basePrompt}\n\n---\nNO CRM DATA FOUND for "${entityName}". Use web_search to research this company/person before responding.`
    }
    return `${basePrompt}\n\n---\nLIVE CONTEXT (from CRM) — ALL THE DATA YOU NEED IS HERE:\n${facts.join('\n')}\n---\nCRITICAL INSTRUCTIONS:\n1. You already have all the relevant CRM data above. DO NOT call pipeline overview tools.\n2. If you must use a tool, ONLY search for more about the SPECIFIC entity mentioned above.\n3. Your response must be EXCLUSIVELY about this entity.\n4. Structure: WHO they are → DEAL STATUS → WHAT TO DO NEXT → DRAFT EMAIL.`
  } catch {
    return basePrompt
  }
}

const VH_EMAIL_VOICE = `
EMAIL VOICE RULES (MANDATORY — learned from 115 real sent emails, match EXACTLY):
- Opening: ALWAYS match the greeting style of the existing thread. If they wrote "Hi Matt" then reply "Hi [Name]". If the thread uses "Dear", use "Dear". When no thread exists, default to "Dear [First name],".
- Tone: Match the formality of the prospect's last message.
- Replies: SHORT. 2-4 paragraphs max. Each paragraph often a single sentence.
- Closing: "Kind regards," for formal. "Best," for warm. ALWAYS followed by signature block.
- NEVER use em dashes (—). Use commas or full stops instead.
- NEVER use: "hope this finds you well", "just wanted to reach out", "circle back", "touch base", "synergy", "I think", "maybe", "hopefully", "excited to", "please don't hesitate", "I'd love to", "thrilled", "delighted"
- PREFERRED phrases: "at this level", "in practice", "while the category remains open", "long-term positioning", "happy to work around whatever is easiest", "much appreciated"
- NO AI FILLER. Every word earns its place.
- Write like a senior dealmaker who respects the reader's time.
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
2. OUR LAST EMAIL — the most recent email WE sent to them.
3. THEIR REPLY IN FULL — reproduce their complete reply text above.
4. DEFINITIVE NEXT STEP — EXACTLY what to do. EXPLAIN THE PSYCHOLOGY.

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
    return `Brief on ${d.contact || titleSuffix || 'the contact'} at ${d.company || 'their company'}.\n\n${bits.join('\n')}\n\nIMPORTANT: Do NOT show tool calls. Present ONLY the clean brief.\n\nCRITICAL: "${d.contact || titleSuffix}" is a PERSON'S NAME, not a company.\n\nRESPOND WITH ONLY:\n1. CONTEXT — 2-3 lines.\n2. LAST COMMS — search Gmail for the last email.\n3. DEFINITIVE NEXT STEP\n4. DRAFT EMAIL — Address "Hi ${(d.contact || titleSuffix || '').split(' ')[0]},"\n\n${VH_EMAIL_VOICE}`
  }
  if (sel.kind === 'deal') {
    return `FOCUS: Brief me ONLY on this specific deal.\n\nDeal: ${p.company || p.title}\nStage: ${p.stage}\nValue: ${p.value ? '$' + p.value : 'n/a'}\nDays since activity: ${p.daysSince}\n\nRespond with ONLY:\n1. ACCOUNT STATUS\n2. NEXT MOVE\n3. MARKET SIGNALS\n4. DRAFT EMAIL\n\n${VH_EMAIL_VOICE}`
  }
  if (sel.kind === 'signal') {
    return `SIGNAL ANALYSIS — "${sel.title}"\n\nEntity: ${p.entity_name || 'unknown'}\nType: ${p.type || 'unknown'}\nDetail: "${(p.detail || '').slice(0, 500)}"\n\nGive me:\n1. WHAT HAPPENED — full breakdown\n2. COMMERCIAL IMPACT — what this means for Van Hawke\n3. ACTION REQUIRED — should we act on this?\n4. DRAFT OUTREACH — if there's an opportunity`
  }
  if (sel.kind === 'followup') {
    const contactFirstName = (p.recipient_name || '').split(' ')[0] || 'there'
    return `Re-engagement brief for ${p.recipient_name || p.recipient_email} at ${p.company || 'their company'}.\n\nOriginal subject: "${p.subject || ''}"\nRecipient: ${p.recipient_email || 'unknown'}\nSent: ${p.sent_at ? new Date(p.sent_at).toLocaleDateString('en-GB') : 'unknown'}\nFollow-up due: ${p.follow_up_due_at ? new Date(p.follow_up_due_at).toLocaleDateString('en-GB') : 'unknown'}\n\nGive me:\n1. LAST CORRESPONDENCE — search Gmail\n2. WHY NO REPLY — psychological analysis\n3. DEFINITIVE NEXT STEP\n4. DRAFT FOLLOW-UP EMAIL — Hi ${contactFirstName},\n\n${VH_EMAIL_VOICE}`
  }
  if (sel.kind === 'campaign') {
    return `Brief me on campaign prospect: ${p.contact_name || 'Unknown'} at ${p.company || 'their company'}.\n\nCurrent step: ${p.current_step}\nNext send: ${p.next_send_at ? new Date(p.next_send_at).toLocaleDateString('en-GB') : 'pending'}\n\nGive me: (1) company background, (2) where they are in the sequence, (3) whether to continue, pause, or escalate.`
  }
  return `Brief me on: ${sel.title}.`
}

// ─── Badge logic for alert types ───
function alertBadge(alert) {
  const t = alert.type || ''
  const s = alert.severity || ''
  if (t === 'campaign_report') return { bg: '#FFF3E0', c: '#E65100', l: 'Campaign' }
  if (t === 'morning_briefing') return { bg: '#E6F1FB', c: '#185FA5', l: 'Briefing' }
  if (t === 'deal_stale' || t === 'high_value_stale') return { bg: '#FCEBEB', c: '#A32D2D', l: 'Stale deal' }
  if (t === 'new_contact') return { bg: '#E1F5EE', c: '#0F6E56', l: 'New contact' }
  if (t === 'follow_up_due') return { bg: '#FCEBEB', c: '#A32D2D', l: 'Overdue' }
  if (t === 'selfcheck_fail' || t === 'kiko_remediation') return { bg: '#F5F5F5', c: '#6B6B6B', l: 'System' }
  if (t === 'category_recommendation') return { bg: '#EEEDFE', c: '#534AB7', l: 'Category' }
  if (t === 'convergence') return { bg: '#FAEEDA', c: '#854F0B', l: 'Convergence' }
  if (t === 'data_quality') return { bg: '#F5F5F5', c: '#6B6B6B', l: 'Data' }
  if (t === 'proactive_heartbeat') return { bg: '#E6F1FB', c: '#185FA5', l: 'Heartbeat' }
  if (s === 'critical') return { bg: '#FCEBEB', c: '#A32D2D', l: 'Urgent' }
  return { bg: '#E6F1FB', c: '#185FA5', l: 'Signal' }
}

export default function OutreachIntelligence({ user }) {
  const nav = useNavigate()
  const [loading, setLoading] = useState(true)
  const [deals, setDeals] = useState([])
  const [hotReplies, setHotReplies] = useState([])
  const [signals, setSignals] = useState([])
  const [campaignActivity, setCampaignActivity] = useState([])
  const [mainTab, setMainTab] = useState('signals')
  const [intelTab, setIntelTab] = useState('f1')
  const [taskFilter, setTaskFilter] = useState('overdue')
  const [showNewTask, setShowNewTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskCompany, setNewTaskCompany] = useState('')
  const [newTaskDue, setNewTaskDue] = useState('')

  const live = useKikoLive()
  const tasks = live.tasks
  const followUps = live.followUps

  const [selected, setSelected] = useState(null)
  // ═══ Data for enhanced Command Centre tabs ═══
  const [draftActions, setDraftActions] = useState([])
  const [scheduledEmails, setScheduledEmails] = useState([])
  const [allAlerts, setAllAlerts] = useState([])
  const [enrollments, setEnrollments] = useState([])
  useEffect(() => {
    supabase.from('kiko_draft_actions').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(300).then(({ data }) => setDraftActions(data || []))
    supabase.from('kiko_scheduled_emails').select('*').order('scheduled_for', { ascending: true }).limit(30).then(({ data }) => setScheduledEmails(data || []))
    supabase.from('kiko_alerts').select('*').eq('dismissed', false).order('created_at', { ascending: false }).limit(200).then(({ data }) => setAllAlerts(data || []))
    supabase.from('kiko_sequence_enrollments').select('*').order('enrolled_at', { ascending: false }).limit(500).then(({ data }) => setEnrollments(data || []))
  }, [])
  const [brief, setBrief] = useState('')
  const [briefLoading, setBriefLoading] = useState(false)
  const briefAbortRef = useRef(null)
  const rawBriefRef = useRef('')
  const [showDraft, setShowDraft] = useState(false)
  const [draftSubject, setDraftSubject] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [draftTone, setDraftTone] = useState('advisory')
  const [separateDraft, setSeparateDraft] = useState('')
  const [draftGenerating, setDraftGenerating] = useState(false)
  const [resolvedEmail, setResolvedEmail] = useState('')

  const isSuperAdmin = user?.app_metadata?.role === 'super_admin'

  const loadData = async () => {
    setLoading(true)
    try {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const [dealsRes, hotRes] = await Promise.all([
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
      ])
      setDeals(dealsRes.data || [])
      setHotReplies((() => {
        const raw = hotRes.data || []
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
      // Refresh allAlerts + enrollments on manual refresh too
      supabase.from('kiko_alerts').select('*').eq('dismissed', false).order('created_at', { ascending: false }).limit(200).then(({ data }) => setAllAlerts(data || []))
      supabase.from('kiko_sequence_enrollments').select('*').order('enrolled_at', { ascending: false }).limit(500).then(({ data }) => setEnrollments(data || []))
      supabase.from('kiko_draft_actions').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(300).then(({ data }) => setDraftActions(data || []))
      supabase.from('kiko_scheduled_emails').select('*').order('scheduled_for', { ascending: true }).limit(30).then(({ data }) => setScheduledEmails(data || []))
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

  const selectFollowUp = (fu) => {
    setResolvedEmail(fu.recipient_email || '')
    setSelected({
      kind: 'followup', id: fu.id,
      title: `${fu.recipient_name || fu.recipient_email} — ${fu.company || ''}`,
      meta: `${fu.subject || '(no subject)'} · Sent ${relativeTime(fu.sent_at)} · Due ${dueLabel(fu.follow_up_due_at)}`,
      payload: fu,
    })
  }

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
      .filter(x => x.daysSince > 30 && x.daysSince < 365)
      .sort((a, b) => b.weighted - a.weighted)
      .slice(0, 8)
  }, [deals, now])

  // ── Campaigns: group enrollments by sequence_id ──
  const campaignGroups = useMemo(() => {
    const groups = {}
    for (const e of enrollments) {
      const sid = e.sequence_id || 'unknown'
      if (!groups[sid]) groups[sid] = { sequence_id: sid, enrollments: [] }
      groups[sid].enrollments.push(e)
    }
    return Object.values(groups).map(g => {
      const all = g.enrollments
      return {
        ...g,
        total: all.length,
        active: all.filter(e => e.status === 'active').length,
        paused: all.filter(e => e.status === 'paused').length,
        bounced: all.filter(e => e.status === 'bounced').length,
        completed: all.filter(e => e.status === 'completed').length,
        replied: all.filter(e => e.reply_detected_at).length,
        name: all[0]?.company_intel?.campaign_name || `Campaign ${g.sequence_id?.slice(0, 8) || ''}`,
        prospects: all.slice(0, 10),
      }
    }).sort((a, b) => b.total - a.total)
  }, [enrollments])

  // ── Schedule: merge scheduled emails + active enrollment next-sends ──
  const scheduleItems = useMemo(() => {
    const items = []
    for (const se of scheduledEmails) {
      items.push({
        id: se.id,
        time: se.scheduled_for,
        name: se.recipient_name || se.recipient_email || 'Unknown',
        company: '',
        subject: se.subject || '(no subject)',
        channel: 'email',
        source: 'scheduled',
        status: se.status,
      })
    }
    for (const en of enrollments.filter(e => e.status === 'active' && e.next_send_at)) {
      items.push({
        id: en.id,
        time: en.next_send_at,
        name: en.contact_name || en.contact_email || 'Unknown',
        company: en.company || '',
        subject: `Step ${en.current_step || '?'}`,
        channel: en.linkedin_url ? 'linkedin' : 'email',
        source: 'sequence',
        status: en.status,
      })
    }
    return items.sort((a, b) => new Date(a.time) - new Date(b.time))
  }, [scheduledEmails, enrollments])

  // ── Kiko brief loader (SSE streaming from /api/kiko) ──
  useEffect(() => {
    if (!selected) { setBrief(''); setSeparateDraft(''); return }
    if (briefAbortRef.current) briefAbortRef.current.abort()
    const controller = new AbortController()
    briefAbortRef.current = controller
    setBrief('')
    rawBriefRef.current = ''
    setSeparateDraft('')
    setBriefLoading(true)
    ;(async () => {
      try {
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
                  if (chunk.includes('"overloaded_error"') || chunk.includes('"type":"error"')) {
                    setBrief('Kiko is temporarily busy. Click the item again to retry.')
                    return
                  }
                  setBrief(prev => {
                    const updated = prev + chunk
                    rawBriefRef.current = updated
                    return updated
                  })
                }
              } catch {}
            })
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') console.error('[CommandCentre] brief', err)
      }
      setBriefLoading(false)
      const detailPanel = document.querySelector('.cc-detail-scroll')
      if (detailPanel) detailPanel.scrollTop = 0
      
      if (selected?.kind === 'reply' || selected?.kind === 'task' || selected?.kind === 'followup') {
        await new Promise(r => setTimeout(r, 300))
        const rawBrief = rawBriefRef.current || ''
        const extracted = extractDraftFromBrief(rawBrief)
        if (extracted && extracted.length > 30) {
          setSeparateDraft(extracted)
        }
        const p = selected.payload || {}
        const email = p.recipient_email || p.prospect_email || p.email || p.metadata?.from || ''
        if (email) setResolvedEmail(email)
      }
    })()
    return () => controller.abort()
  }, [selected, user?.email])

  const channelOf = (r) => r.type === 'email_bounced' ? 'bounce' : r.type?.includes('linkedin') ? 'linkedin' : r.type?.includes('email') ? 'email' : 'reply'
  const channelIcon = (ch) => ch === 'linkedin' ? <Linkedin size={11} /> : ch === 'bounce' ? <AlertTriangle size={11} /> : ch === 'email' ? <Mail size={11} /> : <MessageSquare size={11} />

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

  const dismissAlert = async (alert, e) => {
    e?.stopPropagation()
    await supabase.from('kiko_alerts').update({ dismissed: true }).eq('id', alert.id)
    setAllAlerts(prev => prev.filter(a => a.id !== alert.id))
    showToast('Alert dismissed', 'success')
  }

  const dismissDraft = async (draft, e) => {
    e?.stopPropagation()
    await supabase.from('kiko_draft_actions').update({ status: 'dismissed', reviewed_at: new Date().toISOString() }).eq('id', draft.id)
    setDraftActions(prev => prev.filter(d => d.id !== draft.id))
    showToast('Draft dismissed', 'success')
  }

  const isSelected = (kind, id) => selected?.kind === kind && selected?.id === id

  // ── Sort alerts: severity DESC then created_at DESC ──
  const sortedAlerts = useMemo(() => {
    const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 }
    return [...allAlerts].sort((a, b) => {
      const sa = sevOrder[a.severity] ?? 4
      const sb = sevOrder[b.severity] ?? 4
      if (sa !== sb) return sa - sb
      return new Date(b.created_at) - new Date(a.created_at)
    })
  }, [allAlerts])

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
                      <button onClick={async (e) => { e.stopPropagation(); await supabase.from('kiko_alerts').update({ dismissed: true }).eq('id', r.id); setHotReplies(prev => prev.filter(x => x.id !== r.id)); showToast('Alert cleared', 'success') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A0A0A0', fontSize: 13, padding: '0 2px', marginLeft: 4, lineHeight: 1 }} title="Dismiss">×</button>
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
            { id: 'signals', label: 'Signals', count: sortedAlerts.length },
            { id: 'outreach', label: 'Outreach', count: draftActions.length },
            { id: 'schedule', label: 'Schedule', count: scheduleItems.length },
            { id: 'followups', label: 'Follow-ups', count: tasks.length },
            { id: 'campaigns', label: 'Campaigns', count: enrollments.length },
            { id: 'discover', label: 'Discover' },
          ].map(t => (
            <button key={t.id} onClick={() => { setMainTab(t.id); setSelected(null) }} style={{
              padding: '10px 18px', fontSize: 13, fontWeight: mainTab === t.id ? 600 : 400,
              color: mainTab === t.id ? '#0A0A0A' : '#6B6B6B',
              borderBottom: mainTab === t.id ? '2px solid #0A0A0A' : '2px solid transparent',
              background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
              cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif',
            }}>
              {t.label}
              {t.count != null && <span style={{ color: '#A0A0A0', marginLeft: 6, fontSize: 11 }}>{t.count}</span>}
            </button>
          ))}
        </div>

        {/* MASTER-DETAIL GRID */}
        <div className="cc-grid">
          {/* LEFT: Grouped priority list */}
          <div className="cc-list">

        {/* ═══ SIGNALS TAB ═══ */}
        {mainTab === 'signals' && (
          <div style={{ padding: '0 4px' }}>
            {sortedAlerts.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: '#6B6B6B', fontSize: 14 }}>No active signals. Kiko monitors contacts, companies, and campaigns overnight.</div>
            ) : sortedAlerts.map((alert) => {
              const badge = alertBadge(alert)
              const initials = ((alert.entity_name || alert.title || '').split(' ').slice(0, 2).map(w => (w||'')[0]).join('').toUpperCase()) || '?'
              return (
                <div key={alert.id} className={`cc-row ${isSelected('signal', alert.id) ? 'selected' : ''}`} onClick={() => selectSignal(alert)} style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: '0.5px solid rgba(0,0,0,0.06)', cursor: 'pointer' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: badge.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500, color: badge.c, marginRight: 12, flexShrink: 0 }}>{initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#0A0A0A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cleanTitle(alert.title)}</div>
                    <div style={{ fontSize: 12, color: '#6B6B6B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(alert.detail || '').slice(0, 80)}</div>
                  </div>
                  <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, background: badge.bg, color: badge.c, padding: '3px 8px', borderRadius: 4, marginRight: 8, flexShrink: 0, fontWeight: 600 }}>{badge.l}</span>
                  <button onClick={(e) => { e.stopPropagation(); selectSignal(alert) }} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: '0.5px solid rgba(0,0,0,0.12)', background: '#fff', cursor: 'pointer', marginRight: 4 }}>Action</button>
                  <button onClick={(e) => dismissAlert(alert, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A0A0A0', fontSize: 15, padding: '0 4px', lineHeight: 1 }} title="Dismiss">×</button>
                </div>
              )
            })}
          </div>
        )}

        {/* ═══ OUTREACH TAB ═══ */}
        {mainTab === 'outreach' && (
          <div style={{ padding: '0 4px' }}>
            {draftActions.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: '#6B6B6B', fontSize: 14 }}>No suggested outreach yet. Kiko generates drafts when signals are detected.</div>
            ) : draftActions.map((draft) => {
              const payload = typeof draft.payload === 'string' ? (() => { try { return JSON.parse(draft.payload) } catch { return {} } })() : (draft.payload || {})
              const entity = payload.entity || payload.entity_name || draft.action_type || 'Suggested outreach'
              const draftText = payload.draft || payload.content || ''
              const context = payload.context || ''
              return (
                <div key={draft.id} style={{ border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: 20, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#0A0A0A' }}>{entity}</div>
                    <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, background: '#E6F1FB', color: '#185FA5', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>{draft.action_type || 'follow_up'}</span>
                  </div>
                  {context && <div style={{ fontSize: 12, color: '#6B6B6B', marginBottom: 10, lineHeight: 1.5 }}>{context.slice(0, 200)}</div>}
                  {draftText && (
                    <div style={{ background: '#FAFAFA', borderRadius: 8, padding: '14px 16px', fontSize: 13, lineHeight: 1.6, marginBottom: 14, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto', color: '#2A2A2A' }}>{draftText.slice(0, 800)}{draftText.length > 800 ? '…' : ''}</div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, background: '#0A0A0A', color: '#fff', border: 'none', cursor: 'pointer' }}>Schedule send</button>
                    <button style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, border: '0.5px solid rgba(0,0,0,0.12)', background: '#fff', cursor: 'pointer' }}>Edit</button>
                    <button onClick={(e) => dismissDraft(draft, e)} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, border: '0.5px solid rgba(0,0,0,0.12)', background: '#fff', cursor: 'pointer', color: '#6B6B6B' }}>Dismiss</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ═══ SCHEDULE TAB ═══ */}
        {mainTab === 'schedule' && (
          <div style={{ padding: '0 4px' }}>
            {scheduleItems.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: '#6B6B6B', fontSize: 14 }}>No messages scheduled. Use campaigns or ask Kiko to schedule outreach.</div>
            ) : scheduleItems.map((item) => {
              const time = item.time ? new Date(item.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '--:--'
              const date = item.time ? new Date(item.time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''
              const isLI = item.channel === 'linkedin'
              return (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
                  <div style={{ width: 70, flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#0A0A0A' }}>{time}</div>
                    <div style={{ fontSize: 10, color: '#A0A0A0' }}>{date}</div>
                  </div>
                  <div style={{ width: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: isLI ? '#185FA5' : '#6B6B6B' }}>
                    {isLI ? <Linkedin size={13} /> : <Mail size={13} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, marginLeft: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#0A0A0A' }}>{item.name}{item.company ? ` · ${item.company}` : ''}</div>
                    <div style={{ fontSize: 11, color: '#6B6B6B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.subject}</div>
                  </div>
                  <span style={{ fontSize: 10, textTransform: 'uppercase', background: isLI ? '#E6F1FB' : '#FAFAFA', color: isLI ? '#185FA5' : '#6B6B6B', padding: '3px 8px', borderRadius: 4, flexShrink: 0, fontWeight: 500 }}>{item.source === 'sequence' ? `Seq · ${isLI ? 'LI' : 'Email'}` : isLI ? 'LinkedIn' : 'Email'}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* ═══ FOLLOW-UPS TAB (PRESERVED AS-IS) ═══ */}
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

            {/* AWAITING REPLIES */}
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

        {/* ═══ CAMPAIGNS TAB ═══ */}
        {mainTab === 'campaigns' && (
          <div style={{ padding: '0 4px' }}>
            {campaignGroups.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: '#6B6B6B', fontSize: 14 }}>No campaign data. Enroll prospects via outreach sequences.</div>
            ) : campaignGroups.map((group) => {
              const replyRate = group.total > 0 ? Math.round((group.replied / group.total) * 100) : 0
              const bounceRate = group.total > 0 ? Math.round((group.bounced / group.total) * 100) : 0
              return (
                <div key={group.sequence_id} style={{ border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: 20, marginBottom: 16 }}>
                  {/* Campaign Header */}
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#0A0A0A', marginBottom: 12 }}>{group.name}</div>
                  
                  {/* Stats Row */}
                  <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                    {[
                      { label: 'Enrolled', value: group.total, bg: '#F5F5F5', c: '#0A0A0A' },
                      { label: 'Active', value: group.active, bg: '#E1F5EE', c: '#0F6E56' },
                      { label: 'Paused', value: group.paused, bg: '#FAEEDA', c: '#854F0B' },
                      { label: 'Bounced', value: group.bounced, bg: '#FCEBEB', c: '#A32D2D' },
                      { label: 'Completed', value: group.completed, bg: '#E6F1FB', c: '#185FA5' },
                    ].map(stat => (
                      <div key={stat.label} style={{ textAlign: 'center', minWidth: 60 }}>
                        <div style={{ fontSize: 18, fontWeight: 600, color: stat.c }}>{stat.value}</div>
                        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6B6B6B', marginTop: 2 }}>{stat.label}</div>
                      </div>
                    ))}
                    <div style={{ textAlign: 'center', minWidth: 60 }}>
                      <div style={{ fontSize: 18, fontWeight: 600, color: replyRate > 0 ? '#0F6E56' : '#6B6B6B' }}>{replyRate}%</div>
                      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6B6B6B', marginTop: 2 }}>Reply rate</div>
                    </div>
                    <div style={{ textAlign: 'center', minWidth: 60 }}>
                      <div style={{ fontSize: 18, fontWeight: 600, color: bounceRate > 10 ? '#A32D2D' : '#6B6B6B' }}>{bounceRate}%</div>
                      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6B6B6B', marginTop: 2 }}>Bounce rate</div>
                    </div>
                  </div>

                  {/* Top Prospects */}
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#A0A0A0', marginBottom: 8, fontWeight: 600 }}>Top prospects</div>
                  {group.prospects.map((p) => {
                    const statusColor = p.status === 'active' ? { bg: '#E1F5EE', c: '#0F6E56' } : p.status === 'paused' ? { bg: '#FAEEDA', c: '#854F0B' } : p.status === 'bounced' ? { bg: '#FCEBEB', c: '#A32D2D' } : { bg: '#E6F1FB', c: '#185FA5' }
                    return (
                      <div key={p.id} className={`cc-row ${isSelected('campaign', p.id) ? 'selected' : ''}`} onClick={() => selectCampaign(p)} style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: '0.5px solid rgba(0,0,0,0.04)', cursor: 'pointer' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#0A0A0A' }}>{p.contact_name || p.contact_email || 'Unknown'}</div>
                          <div style={{ fontSize: 11, color: '#6B6B6B' }}>{p.company || ''}{p.title ? ` · ${p.title}` : ''} · Step {p.current_step || '?'}</div>
                        </div>
                        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, background: statusColor.bg, color: statusColor.c, padding: '2px 6px', borderRadius: 4, fontWeight: 600, flexShrink: 0 }}>{p.status}</span>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}

        {/* ═══ DISCOVER TAB ═══ */}
        {mainTab === 'discover' && (
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: '#0A0A0A', marginBottom: 12 }}>Discover new prospects</div>
            <div style={{ maxWidth: 400, margin: '0 auto 20px', fontSize: 13, color: '#6B6B6B', lineHeight: 1.6 }}>Ask Kiko to find companies similar to your best prospects. She will analyse your pipeline and suggest new targets.</div>
            <div style={{ maxWidth: 380, margin: '0 auto', position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 12, top: 11, color: '#A0A0A0' }} />
              <input placeholder="Search companies, sectors, or ask Kiko..." style={{ width: '100%', padding: '10px 12px 10px 34px', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 8, fontSize: 13, fontFamily: 'Inter, system-ui, sans-serif', outline: 'none' }} />
            </div>
          </div>
        )}

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

                  {draftGenerating && (
                    <div style={{ marginTop: 14, padding: 16, background: 'rgba(0,0,0,0.02)', borderRadius: 8 }}>
                      <span className="dot" /><span className="dot" /><span className="dot" /> Drafting reply...
                    </div>
                  )}
                  {separateDraft && separateDraft.length > 30 && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 12, marginBottom: 8, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#A0A0A0' }}>Email Draft</div>
                      <EmailDraft key={'draft-' + separateDraft.length} text={separateDraft} defaultSender={selected?.kind === 'reply' || selected?.kind === 'task' || selected?.kind === 'followup' ? 'matt' : null} defaultTo={resolvedEmail || selected?.payload?.recipient_email || selected?.payload?.metadata?.from || selected?.payload?.prospect_email || selected?.payload?.email || selected?.payload?.data?.email || ''} />
                    </div>
                  )}

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
