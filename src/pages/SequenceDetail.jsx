// src/pages/SequenceDetail.jsx — Sequence builder + leads + performance
import { useState, useEffect } from 'react'
import { StepComposer } from '@/components/kiko/EmailDraft'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { setPageContext } from '@/lib/pageContext'
import PageHeader from '@/components/layout/PageHeader'
// Design tokens — hardcoded (matching Sequences.jsx)
const C = {
  bg: '#FEFEFC',
  card: '#FFFFFF',
  cardHover: '#F5F4F1',
  border: 'rgba(0,0,0,0.08)',
  borderHover: 'rgba(0,0,0,0.14)',
  text: '#0A0A0A',
  textSec: '#6B6B6B',
  textTer: '#A0A0A0',
  textMut: '#C0C0C0',
  purple: '#0A0A0A',
  teal: '#0A0A0A',
  green: '#7d8a64',
  red: '#B8643E',
  amber: '#B89C5C',
  blue: '#5a6470',
  linkedin: '#0077B5',
  font: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontDisplay: "'Source Serif 4', Georgia, serif",
  r: 10,
}
const glass = { background: C.card, border: `1px solid ${C.border}`, borderRadius: C.r, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', transition: 'all 0.15s ease' }
import { Mail, Linkedin, Plus, Clock, Trash2, Save, Sparkles, ArrowLeft, Search, UserPlus, X, ChevronRight, Eye, Reply, AlertTriangle, Send, GitBranch, Copy, MoreHorizontal, LayoutList, Workflow, RefreshCw } from 'lucide-react'
import SequenceFlowView from '@/components/campaigns/SequenceFlowView'

const APPROACHES = ['authority-led','scarcity-led','social-proof','reciprocity','data-led','intelligence-led','competitive-led','relationship-led']
const PSYCHOLOGY = ['reciprocity','scarcity','authority','social_proof','commitment','liking','strategic_withdrawal','pattern_interrupt']
const VARS = ['{firstName}','{companyName}','{category}','{revenue}','{ceo}','{raceWindow}','{recentNews}','{prevSubject}']
const CONDITIONS = [
  { value: 'no_reply', label: 'No reply after previous step' },
  { value: 'connection_accepted', label: 'LinkedIn connection accepted' },
  { value: 'has_linkedin', label: 'Lead has LinkedIn URL' },
  { value: 'has_email', label: 'Lead has verified email' },
  { value: 'email_opened', label: 'Email was opened (coming soon)' },
]

function timeAgo(d) {
  if (!d) return ''
  const diff = Math.floor((Date.now() - new Date(d)) / 1000)
  if (diff < 60) return 'now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function SequenceDetail({ user }) {
  const { id } = useParams()
  const nav = useNavigate()
  const isNew = id === 'new'
  const [seq, setSeq] = useState(isNew ? { name: '', target_persona: '', description: '' } : null)
  const [steps, setSteps] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [queue, setQueue] = useState([])
  const [selStep, setSelStep] = useState(0)
  const [tab, setTab] = useState('sequence')
  const [prospectPage, setProspectPage] = useState(1)
  const PROSPECTS_PER_PAGE = 50
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [showAddLeads, setShowAddLeads] = useState(false)
  const [leadSearch, setLeadSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [selectedLeads, setSelectedLeads] = useState([])
  const [searching, setSearching] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [showManualAdd, setShowManualAdd] = useState(false)
  const [manualLead, setManualLead] = useState({ firstName: '', lastName: '', email: '', company: '', title: '', linkedin: '' })
  const [manualAdding, setManualAdding] = useState(false)
  const [selectedLead, setSelectedLead] = useState(null)
  const [bulkIds, setBulkIds] = useState(new Set())
  const [activityFeed, setActivityFeed] = useState([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [bgSourcing, setBgSourcing] = useState(false)
  const [bgJobMsg, setBgJobMsg] = useState(null)
  const [leadActivity, setLeadActivity] = useState([])
  const [topPatterns, setTopPatterns] = useState([])
  const [conditions, setConditions] = useState([])
  const [showAddCondition, setShowAddCondition] = useState(false)
  const [viewMode, setViewMode] = useState('flow') // 'list' or 'flow' — default to flow (Lemlist-style)
  const [newCondition, setNewCondition] = useState({ condition_type: 'opened', operator: 'is', value: '', reference_step: 1, true_next_step: '', false_next_step: '', wait_hours: 0 })
  const [regenPrompt, setRegenPrompt] = useState(false)
  const [refineText, setRefineText] = useState('')  // feedback input for refine-with-feedback loop
  const [refining, setRefining] = useState(false)
  const [testSending, setTestSending] = useState(false)
  const [testSent, setTestSent] = useState(false)
  const [testModalOpen, setTestModalOpen] = useState(false)
  const [testModalStep, setTestModalStep] = useState(null)
  const [testRecipientMode, setTestRecipientMode] = useState('me')
  const [liTestOpen, setLiTestOpen] = useState(false)
  const [liTestUrl, setLiTestUrl] = useState('')
  const [liTestSent, setLiTestSent] = useState(false)
  const [liTestSending, setLiTestSending] = useState(false)
  const [orgMembers, setOrgMembers] = useState([])
  const [launching, setLaunching] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [showLaunchConfirm, setShowLaunchConfirm] = useState(false)

  useEffect(() => { if (!isNew) load() }, [id])
  useEffect(() => {
    // Load org members for send-from dropdown
    async function loadMembers() {
      // Try user prop first, then supabase auth as fallback
      let userId = user?.id
      if (!userId) {
        try {
          const { data } = await supabase.auth.getSession()
          userId = data?.session?.user?.id
        } catch {}
      }
      if (!userId) return
      try {
        const res = await fetch(`https://api.vanhawke.agency/api/team-list?user_id=${userId}`)
        if (res.ok) {
          const d = await res.json()
          if (d?.members?.length) setOrgMembers(d.members)
        }
      } catch {}
    }
    loadMembers()
  }, [user])

  // Activity tab — load when opened
  useEffect(() => {
    if (tab === 'activity' && enrollments.length) loadActivity()
  }, [tab, enrollments.length])

  // Load top-performing patterns once when Performance tab opens.
  // Returns empty array when no send data exists yet — card hidden in that case.
  useEffect(() => {
    if (tab !== 'performance') return
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase.rpc('get_top_email_patterns', { min_sample_size: 3, max_results: 3 })
        if (cancelled || error) return
        setTopPatterns(Array.isArray(data) ? data : [])
      } catch {}
    })()
    return () => { cancelled = true }
  }, [tab])

  // Load trigger conditions for this sequence (loaded once on sequence load)
  useEffect(() => {
    if (isNew || !id) return
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`https://api.vanhawke.agency/api/sequence-conditions?sequence_id=${id}`)
        const j = await r.json()
        if (!cancelled && Array.isArray(j.conditions)) setConditions(j.conditions)
      } catch {}
    })()
    return () => { cancelled = true }
  }, [id, isNew])

  async function addCondition() {
    try {
      const r = await fetch('https://api.vanhawke.agency/api/sequence-conditions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newCondition, sequence_id: id, step_number: selStep + 1 }),
      })
      const j = await r.json()
      if (j.condition) {
        setConditions([...conditions, j.condition])
        setShowAddCondition(false)
        setNewCondition({ condition_type: 'opened', operator: 'is', value: '', reference_step: 1, true_next_step: '', false_next_step: '', wait_hours: 0 })
      }
    } catch (e) { console.error(e) }
  }

  async function deleteCondition(condId) {
    try {
      await fetch(`https://api.vanhawke.agency/api/sequence-conditions?id=${condId}`, { method: 'DELETE' })
      setConditions(conditions.filter(c => c.id !== condId))
    } catch (e) { console.error(e) }
  }

  async function load() {
    const { data } = await supabase.from('kiko_sequences').select('*').eq('id', id).single()
    if (data) { setSeq(data); setSteps(data.steps || []) }
    const { data: e } = await supabase.from('kiko_sequence_enrollments').select('*').eq('sequence_id', id).order('created_at', { ascending: false })
    setEnrollments(e || [])
    const { data: q } = await supabase.from('kiko_outreach_queue').select('*').in('enrollment_id', (e || []).map(x => x.id)).order('scheduled_for')
    setQueue(q || [])
    setPageContext({ page: 'sequence_detail', summary: `Sequence: ${data?.name || 'New'}`, visibleItems: `${(e||[]).length} leads, ${(data?.steps||[]).length} steps` })
  }

  async function save() {
    setSaving(true)
    if (isNew) {
      const { data } = await supabase.from('kiko_sequences').insert({ name: seq.name || 'New Campaign', description: seq.description, target_persona: seq.target_persona, steps, is_active: false, send_from_user_id: seq.send_from_user_id || null, send_days: seq.send_days || ['mon','tue','wed','thu','fri'], send_window_start: seq.send_window_start || '09:00', send_window_end: seq.send_window_end || '17:00', auto_timezone: seq.auto_timezone !== false }).select().single()
      if (data) nav(`/sequences/${data.id}`, { replace: true })
    } else {
      await supabase.from('kiko_sequences').update({ name: seq.name, description: seq.description, target_persona: seq.target_persona, steps, send_from_user_id: seq.send_from_user_id || null, send_days: seq.send_days || ['mon','tue','wed','thu','fri'], send_window_start: seq.send_window_start || '09:00', send_window_end: seq.send_window_end || '17:00', auto_timezone: seq.auto_timezone !== false, updated_at: new Date().toISOString() }).eq('id', id)
    }
    setSaving(false); setDirty(false)
  }

  async function launchCampaign() {
    setLaunching(true)
    try {
      // Call the proper /api/activate-campaign endpoint that runs sanity checks
      // (no placeholder steps, all targets verified, no moved/left contacts)
      // before flipping the sequence + enrollments live.
      const res = await fetch('https://api.vanhawke.agency/api/activate-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: id }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        // Show the precise error from the activation guard
        let errMsg = json.error || 'Activation failed'
        if (json.message) errMsg += '\n\n' + json.message
        if (json.unverified_sample) errMsg += '\n\nFirst few unverified:\n' + json.unverified_sample.join('\n')
        if (json.moved_sample) errMsg += '\n\nMoved/left:\n' + json.moved_sample.join('\n')
        if (json.blank_step_count) errMsg += `\n\n${json.blank_step_count} of ${json.total_steps} steps still have placeholder content. Use the refine loop on each step.`
        alert(errMsg)
        setLaunching(false)
        return
      }
      // Success — sequence is now live, all paused enrollments flipped to active
      setSeq(prev => ({ ...prev, is_active: true }))
      alert(`Campaign activated.\n\n${json.enrollments_activated} enrollments will start sending at ${new Date(json.first_send_at).toLocaleString()}.`)
    } catch (err) {
      alert(`Activation failed: ${err.message}`)
    } finally {
      setShowLaunchConfirm(false)
      setLaunching(false)
    }
  }

  // ─── Verify all unverified targets via /api/verify-campaign-targets ───
  async function verifyTargets() {
    setVerifying(true)
    try {
      const res = await fetch('https://api.vanhawke.agency/api/verify-campaign-targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: id }),
      })
      const json = await res.json()
      if (!res.ok) {
        alert(`Verification failed: ${json.error || 'unknown error'}`)
        return
      }
      let msg = `Verification complete.\n\n${json.verified} verified at company\n${json.moved} moved companies\n${json.unreachable} unreachable\n\nDuration: ${(json.duration_ms / 1000).toFixed(1)}s`
      if (json.moved_details && json.moved_details.length > 0) {
        msg += '\n\nMoved contacts (will be excluded):\n' + json.moved_details.slice(0, 5).map(m => `${m.name}: ${m.was_at} → ${m.now_at || 'unknown'}`).join('\n')
      }
      alert(msg)
      // Refresh enrollments + sequence
      window.location.reload()
    } catch (err) {
      alert(`Verification failed: ${err.message}`)
    } finally {
      setVerifying(false)
    }
  }

  // ─── Enrich top companies with sports sponsorship history ───
  async function enrichSponsorship() {
    setEnriching(true)
    try {
      const res = await fetch('https://api.vanhawke.agency/api/enrich-campaign-sponsorship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: id, top_n: 10 }),
      })
      const json = await res.json()
      if (!res.ok) {
        alert(`Enrichment failed: ${json.error || 'unknown error'}`)
        return
      }
      let msg = `Sponsorship enrichment complete.\n\n${json.enriched_with_history} have sports sponsorship history\n${json.no_public_history} have none publicly disclosed\n${json.errors} errors\n\nDuration: ${(json.duration_ms / 1000).toFixed(1)}s`
      if (json.motorsport_matches && json.motorsport_matches.length > 0) {
        msg += '\n\n🏎 Companies with motorsport history:\n' + json.motorsport_matches.slice(0, 5).map(m => `${m.company} (fit ${m.f1_fit_score}/100): ${m.summary}`).join('\n')
      }
      alert(msg)
      window.location.reload()
    } catch (err) {
      alert(`Enrichment failed: ${err.message}`)
    } finally {
      setEnriching(false)
    }
  }

  const isDraft = seq && !seq.is_active

  async function duplicateCampaign() {
    if (!seq) return
    // v0.0.39: use /api/clone-campaign which also copies campaign_targets,
    // not just the bare sequence (steps/name/description). Old client-side
    // duplicate left clones with zero targets which forced a full rebuild.
    try {
      const r = await fetch('https://api.vanhawke.agency/api/clone-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequence_id: id }),
      })
      const data = await r.json()
      if (!r.ok || !data.ok) throw new Error(data.error || 'clone failed')
      // Tell the user how many targets came along
      if (data.target_count > 0) {
        console.log(`[duplicateCampaign] cloned ${data.target_count} targets`)
      }
      nav(`/sequences/${data.new_sequence_id}`)
    } catch (err) {
      // Fallback: bare client-side duplicate (steps only, no targets)
      console.warn('[duplicateCampaign] clone-campaign endpoint failed, falling back:', err.message)
      const { data } = await supabase.from('kiko_sequences').insert({
        name: `${seq.name} (copy)`, description: seq.description, target_persona: seq.target_persona,
        steps: seq.steps, is_active: false
      }).select().single()
      if (data) nav(`/sequences/${data.id}`)
    }
  }

  async function deleteCampaign() {
    if (!confirm(`Delete "${seq?.name}"? This cannot be undone.`)) return
    // Delete enrollments first, then queue items, then the sequence
    const enrollmentIds = enrollments.map(e => e.id)
    if (enrollmentIds.length) {
      for (const eid of enrollmentIds) {
        await supabase.from('kiko_outreach_queue').delete().eq('enrollment_id', eid)
      }
      await supabase.from('kiko_sequence_enrollments').delete().eq('sequence_id', id)
    }
    await supabase.from('kiko_sequences').delete().eq('id', id)
    nav('/campaigns')
  }

  function addStep(ch, insertAt = null) {
    const emailTemplate = 'Dear {firstName},\n\n\n\nKind regards,\n\n{signature}'
    const linkedinTemplate = 'Hi {firstName}, '
    let newStep = null
    if (ch === 'condition') {
      newStep = { step: 0, type: 'condition', delay_days: 3, condition_type: 'no_reply', condition_params: {}, yes_steps: [], no_steps: [] }
    } else if (ch === 'linkedin_connect') {
      newStep = { step: 0, delay_days: 3, channel: 'linkedin', action: 'invite', approach: 'authority-led', psychology: 'liking', template: linkedinTemplate }
    } else if (ch === 'linkedin_message') {
      newStep = { step: 0, delay_days: 3, channel: 'linkedin', action: 'message', approach: 'authority-led', psychology: 'reciprocity', template: linkedinTemplate }
    } else if (ch === 'linkedin_visit') {
      newStep = { step: 0, delay_days: 1, channel: 'linkedin', action: 'visit', approach: 'authority-led', template: '' }
    } else if (ch === 'condition_accepted') {
      newStep = { step: 0, type: 'condition', delay_days: 1, condition_type: 'connection_accepted', condition_params: {}, yes_steps: [], no_steps: [] }
    } else if (ch === 'email') {
      newStep = { step: 0, delay_days: steps.length === 0 ? 0 : 3, channel: 'email', approach: 'authority-led', psychology: 'reciprocity', subject: 'Haas F1 Team x {category}', template: emailTemplate }
    } else {
      newStep = { step: 0, delay_days: 3, channel: ch, approach: 'authority-led', psychology: 'reciprocity', subject: ch === 'email' ? 'Haas F1 Team x {category}' : '', template: ch === 'email' ? emailTemplate : linkedinTemplate }
    }
    if (insertAt !== null && insertAt <= steps.length) {
      const updated = [...steps.slice(0, insertAt), newStep, ...steps.slice(insertAt)].map((s, j) => ({ ...s, step: j + 1 }))
      setSteps(updated)
      setSelStep(insertAt)
    } else {
      setSteps([...steps, newStep].map((s, j) => ({ ...s, step: j + 1 })))
      setSelStep(steps.length)
    }
    setDirty(true)
  }
  function upd(i, k, v) { const u = [...steps]; u[i] = { ...u[i], [k]: v }; setSteps(u); setDirty(true) }
  function updAndRegen(i, k, v) { upd(i, k, v); setRegenPrompt(true) }
  function del(i) { setSteps(steps.filter((_, j) => j !== i).map((s, j) => ({ ...s, step: j + 1 }))); if (selStep >= steps.length - 1) setSelStep(Math.max(0, steps.length - 2)); setDirty(true) }

  async function generateMultichannel() {
    if (steps.length > 0 && !confirm('This will replace your current sequence with a new AI-generated multichannel flow. Continue?')) return
    setGenerating(true)
    try {
      const category = (seq?.name || '').includes(' - ') ? seq.name.split(' - ').slice(1).join(' - ') : seq?.name || 'Technology'
      const team = (seq?.name || '').includes('Haas') ? 'Haas F1 Team' : 'Haas F1 Team'
      const res = await fetch('https://api.vanhawke.agency/api/generate-sequence', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, team, persona: seq?.target_persona || `C-suite at ${category} companies`, numSteps: 7 }),
      })
      const data = await res.json()
      if (data.ok && data.sequence?.steps?.length) {
        // Map generated steps to include proper action types for LinkedIn
        const mapped = data.sequence.steps.map((s, i) => ({
          ...s, step: i + 1,
          action: s.channel === 'linkedin' ? (i <= 2 ? 'invite' : 'message') : undefined,
        }))
        setSteps(mapped)
        setDirty(true)
        setSelStep(0)
      } else {
        alert('Failed to generate: ' + (data.error || 'Unknown error'))
      }
    } catch (err) { alert('Error: ' + err.message) }
    setGenerating(false)
  }

  async function askKiko(i) {
    const s = steps[i]; if (!s) return; upd(i, 'template', '⏳ Kiko is writing...')
    try {
      const categoryName = seq?.name?.split(' - ')[1] || seq?.description || 'technology'
      const teamName = seq?.name?.split(' - ')[0] || 'the team'
      const stepContext = steps.map((st, idx) => `Step ${idx+1}: ${st.channel} — ${st.approach || st.action || 'outreach'}`).join('. ')
      
      const kikoPrompt = `Write a ${s.channel === 'email' ? 'outreach email' : 'LinkedIn ' + (s.action === 'invite' ? 'connection request note (300 chars max)' : 'message (300 chars max)')} for Step ${s.step} of a ${steps.length}-step sequence.

CONTEXT:
Category: ${categoryName}
Team: ${teamName}
Target persona: ${seq?.target_persona || 'C-suite'}
This step's approach: ${s.approach || 'authority-led'}
This step's psychology: ${s.psychology || 'authority'}
Sequence overview: ${stepContext}

CONTRACT SCALE: $3M-$40M annually. These are institutional category-exclusive partnerships. The decision-maker is a CEO or board member allocating strategic capital, not a marketing manager spending campaign budget.

YOU ARE: A principal at a tier-1 advisory firm who structures Formula One partnerships. You represent the team. You control access to a scarce institutional asset.

${s.channel === 'email' ? `EMAIL RULES:
- Start: "Dear {firstName},"
- End: "Kind regards,\\n\\n{signature}"
- 50-100 words MAXIMUM. Every word must earn its place.
- Complete sentences, short paragraphs (2-3 sentences each)
- Subject line: "${teamName} x ${categoryName}" format, no questions, no exclamation marks

WHAT GOOD LOOKS LIKE:
"Dear {firstName},

We work at principal level on the structuring of Formula One partnerships for teams and rights-holders. ${categoryName} operates inside ${teamName} as an active operational dependency, not a brand exercise.

The category remains unassigned. One organisation will hold it.

The relevant question at this stage is simply whether this is strategic from your perspective.

Kind regards,

{signature}"

WHAT BAD LOOKS LIKE (NEVER DO THIS):
- "Reply to this email and I will send it across within the hour" — desperate, aggressive
- "I have a precise 15-minute slot available" — arrogant SaaS cold email
- "I wanted to reach out because..." / "I am reaching out regarding..." — generic, passive. Lead with a STATEMENT not an introduction.
- "I will not continue to follow up" — threatening. Strategic withdrawal is respectful, not punitive.
- "Leveraging synergies between..." — corporate jargon
- Any dashes (— or –) anywhere in the body. Use commas or full stops.
- Any bullet points or lists
- "Exciting opportunity" / "game-changing" / "I believe" / "I think"
- Exclamation marks
- Questions in subject lines
- Subject lines with em dashes. Use x format: "${teamName} x ${categoryName}"` : `LINKEDIN RULES:
- 300 characters MAXIMUM
- NO dashes (em or en) anywhere. Use commas or full stops.
- Reference the preceding email specifically
- No pitch, no hard ask
- Warm, professional, human`}

Return ONLY the ${s.channel === 'email' ? 'email text (starting with Dear, ending with {signature})' : 'message text'}. Nothing else — no preamble, no explanation, no markdown.`

      const r = await fetch('https://api.vanhawke.agency/api/kiko', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: kikoPrompt,
          userEmail: 'sunny@vanhawke.com', currentPage: 'sequences', conversationHistory: []
        })
      })
      // /api/kiko is a streaming SSE endpoint — parse "data: {...}" lines and accumulate delta fields
      if (!r.ok || !r.body) { upd(i, 'template', `Error: ${r.status} ${r.statusText}`); return }
      const reader = r.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let accumulated = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const payload = JSON.parse(line.slice(6))
            if (typeof payload.delta === 'string') {
              accumulated += payload.delta
              upd(i, 'template', accumulated)  // live-stream into the textarea as it writes
            }
          } catch { /* ignore malformed chunk */ }
        }
      }
      if (!accumulated.trim()) upd(i, 'template', 'Kiko returned an empty response. Try again or adjust the approach.')
      else {
        // Strip Claude's internal reasoning preamble. Claude tends to write
        // "I need to check my memory..." / "Now I'll draft..." / "Let me check..."
        // before getting to the actual email. Cut everything before the first
        // 'Subject:' (for emails) or first 'Dear ' / 'Hi ' (for messages without subject).
        let cleaned = accumulated.trim()
        // Remove markdown code fences if Claude wrapped the response
        cleaned = cleaned.replace(/^```(?:email|markdown|text)?\s*/i, '').replace(/\s*```$/, '')
        // Find the first email-content marker
        const subjectIdx = cleaned.search(/(?:^|\n)\s*Subject:\s*/i)
        const dearIdx = cleaned.search(/(?:^|\n)\s*(?:Dear|Hi|Hello)\s+\{?[A-Za-z]/i)
        let cutAt = -1
        if (subjectIdx >= 0 && (dearIdx < 0 || subjectIdx < dearIdx)) cutAt = subjectIdx
        else if (dearIdx >= 0) cutAt = dearIdx
        if (cutAt > 0) cleaned = cleaned.slice(cutAt).trim()
        // Also strip any trailing "Sunny Sidhu / Founder & Principal" etc that Claude
        // sometimes writes despite being told not to. wrapEmailBody handles this on
        // send too but we want the preview to match what gets sent.
        cleaned = cleaned.replace(/\n\s*(Sunny\s*Sidhu|Founder\s*&\s*Principal|CEO\s*[,.]?\s*Van\s*Hawke).*$/gis, '').trim()
        // Strip any remaining dashes — em dash and en dash
        cleaned = cleaned.replace(/[—–]/g, ',')
        upd(i, 'template', cleaned)
      }
    } catch (err) {
      console.error('[askKiko] error:', err)
      upd(i, 'template', `Error generating: ${err.message || 'unknown'}`)
    }
  }

  // Refine current draft with user feedback — iterate back and forth with Kiko.
  // Preserves what the user liked, changes what they asked for.
  async function refineStep(i, feedback) {
    const s = steps[i]
    if (!s || !feedback?.trim()) return
    const currentDraft = s.template || ''
    if (!currentDraft.trim() || currentDraft.startsWith('⏳') || currentDraft.startsWith('Error')) {
      alert('Write or generate a draft first, then refine it with feedback.')
      return
    }
    setRefining(true)
    const originalDraft = currentDraft
    upd(i, 'template', '⏳ Kiko is refining...')
    try {
      const r = await fetch('https://api.vanhawke.agency/api/kiko', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Refine this ${s.channel === 'email' ? 'outreach email' : 'LinkedIn message'} based on my feedback.

CURRENT DRAFT:
"""
${originalDraft}
"""

MY FEEDBACK:
"""
${feedback.trim()}
"""

RULES:
- Apply the feedback. Do not start from scratch unless I explicitly asked you to.
- Preserve anything I did not ask you to change — structure, tone, specific phrases I kept.
- ${s.channel === 'email' ? 'Keep "Dear {firstName}," opener and "Kind regards,\\n\\n{signature}" closer' : 'Keep "Hi {firstName}," opener'}
- ${s.channel === 'email' ? '50-125 words for emails' : '300 chars max for LinkedIn'}
- No generic filler. No "I hope this finds you well". Principal/board level tone.
- Return ONLY the refined message text, nothing else. No preamble, no explanation, no quote marks around it.`,
          userEmail: 'sunny@vanhawke.com', currentPage: 'sequences', conversationHistory: []
        })
      })
      if (!r.ok || !r.body) {
        upd(i, 'template', originalDraft)  // restore on error
        alert(`Refine failed: ${r.status} ${r.statusText}`)
        return
      }
      const reader = r.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let accumulated = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const payload = JSON.parse(line.slice(6))
            if (typeof payload.delta === 'string') {
              accumulated += payload.delta
              upd(i, 'template', accumulated)
            }
          } catch { /* ignore malformed chunk */ }
        }
      }
      if (!accumulated.trim()) {
        upd(i, 'template', originalDraft)
        alert('Kiko returned an empty response. Your original draft is preserved.')
      } else {
        setRefineText('')  // clear feedback input on success
      }
    } catch (err) {
      console.error('[refineStep] error:', err)
      upd(i, 'template', originalDraft)
      alert(`Refine error: ${err.message || 'unknown'}`)
    } finally {
      setRefining(false)
    }
  }

  async function sendTest(i, toEmail = null) {
    const s = steps[i]; if (!s || s.channel !== 'email') return
    const category = seq?.name?.split(' - ')[1] || 'Category'
    const body = (s.template || '').replace(/\{firstName\}/g, 'Test').replace(/\{lastName\}/g, 'User').replace(/\{companyName\}/g, 'Test Company').replace(/\{category\}/g, category).replace(/\{revenue\}/g, '$1B').replace(/\{ceo\}/g, 'CEO Name').replace(/\{raceWindow\}/g, 'Miami Grand Prix').replace(/\{recentNews\}/g, 'recent development').replace(/\{prevSubject\}/g, 'Previous subject').replace(/\{signature\}/g, '').replace(/\n\n+$/, '')
    const subject = '[TEST] ' + (s.subject || 'Test').replace(/\{category\}/g, category)
    const recipient = toEmail || 'sunny@vanhawke.com'
    // Resolve sender email from send_from_user_id
    const senderMember = seq?.send_from_user_id ? orgMembers.find(m => m.user_id === seq.send_from_user_id) : null
    const senderEmail = senderMember?.email || null
    const r = await fetch('https://api.vanhawke.agency/api/gmail-draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: recipient, subject, body, send: true, contactStatus: 'cold', senderEmail }) })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.error || r.statusText)
    return data
  }

  async function searchContacts() {
    if (!leadSearch.trim()) return; setSearching(true)
    const { data } = await supabase.from('contacts').select('id,data').or(`data->>company.ilike.%${leadSearch}%,data->>title.ilike.%${leadSearch}%,data->>firstName.ilike.%${leadSearch}%,data->>lastName.ilike.%${leadSearch}%`).limit(30)
    const results = (data || []).map(c => ({ id: c.id, name: [c.data?.firstName, c.data?.lastName].filter(Boolean).join(' ') || 'Unknown', email: c.data?.email, company: c.data?.company, title: c.data?.title, linkedin: c.data?.linkedin })).filter(r => r.email)
    setSearchResults(results); setSearching(false)
  }

  async function autoSuggestLeads() {
    if (!seq?.name) return
    setLoadingSuggestions(true)
    try {
      // Parse category from sequence name "Team F1 - Category Name"
      const category = seq.name.split(' - ')[1] || seq.name
      // Map display name back to category id (lowercased + first word)
      const catId = category.toLowerCase().split(/[\s/&]+/)[0]
      const categoryMap = {
        cybersecurity: 'cybersecurity', cyber: 'cybersecurity',
        banking: 'banking', financial: 'banking', fintech: 'fintech',
        cloud: 'cloud', ai: 'ai_data', semiconductors: 'semiconductors',
        telecom: 'telecom', telecommunications: 'telecom',
        gaming: 'gaming', crypto: 'crypto',
        legal: 'legal', professional: 'legal',
        software: 'software', robotics: 'robotics',
      }
      const categoryId = categoryMap[catId] || catId

      // First try the CRM via direct query — fast path, no API call
      const enrolledEmails = new Set(enrollments.map(e => e.contact_email?.toLowerCase()))

      // Get all CRM contacts whose company is in the relevant industry
      // by joining via the companies table where data->>industry matches
      const industryWords = category.toLowerCase().split(/[\s/&]+/).filter(w => w.length > 3)
      const orQuery = industryWords.map(w => `data->>industry.ilike.%${w}%`).join(',')
      const { data: companies } = await supabase
        .from('companies')
        .select('data')
        .or(orQuery || `data->>industry.ilike.%${category}%`)
        .limit(100)
      const companyNames = new Set((companies || []).map(c => (c.data?.name || '').toLowerCase()).filter(Boolean))

      // Now fetch contacts at those companies
      let results = []
      if (companyNames.size > 0) {
        const namesList = [...companyNames].slice(0, 50)
        const orContacts = namesList.map(n => `data->>company.ilike.${n.replace(/'/g, '')}`).join(',')
        const { data: contacts } = await supabase.from('contacts').select('id,data').or(orContacts).limit(150)
        results = (contacts || []).map(c => ({
          id: c.id,
          name: [c.data?.firstName, c.data?.lastName].filter(Boolean).join(' ') || 'Unknown',
          email: c.data?.email,
          company: c.data?.company,
          title: c.data?.title,
          linkedin: c.data?.linkedin
        })).filter(r => r.email && !enrolledEmails.has(r.email.toLowerCase()))
      }

      // If CRM came up empty, fall back to the build-campaign endpoint
      if (results.length === 0) {
        const r = await fetch('https://api.vanhawke.agency/api/build-campaign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: categoryId, preferredTeam: (seq.name.split(' F1')[0] || '').toLowerCase() })
        })
        const data = await r.json()
        if (data.success && data.top_50) {
          results = data.top_50
            .filter(t => t.decision_maker_email && !enrolledEmails.has(t.decision_maker_email.toLowerCase()))
            .map(t => ({
              id: t.contact_id || `web-${t.rank}`,
              name: t.decision_maker_name || 'Unknown',
              email: t.decision_maker_email,
              company: t.company_name,
              title: t.decision_maker_title,
              linkedin: null,
            }))
        }
      }

      setSuggestions(results)
      if (results.length === 0) {
        // No CRM leads found — auto-trigger Kiko prospect sourcing
        setBgSourcing(true)
        try {
          const userId = '9f486437-4bf5-4111-abfe-fe19bfa76063'
          const res = await fetch(`https://api.vanhawke.agency/api/kiko-jobs?user_id=${userId}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              job_type: 'source_companies_bg',
              title: `Source contacts for "${seq?.name || 'campaign'}"`,
              params: { category, count: 15, sequence_id: id },
              related_entity_type: 'sequence', related_entity_id: id, user_id: userId,
            }),
          })
          const data = await res.json()
          if (data.ok) {
            setBgJobMsg('✅ No CRM matches found — Kiko is now sourcing prospects in the background. Contacts will auto-enroll within 10 minutes. Refresh the page to see new prospects.')
          } else {
            setBgJobMsg(`❌ ${data.error || 'Failed to queue sourcing job'}`)
          }
        } catch (e) { setBgJobMsg(`❌ ${e.message}`) }
        setBgSourcing(false)
      }
    } catch (err) {
      console.error('[autoSuggestLeads]', err)
      alert(`Find leads failed: ${err.message}`)
    } finally {
      setLoadingSuggestions(false)
    }
  }

  async function enrollSelected() {
    for (const lead of selectedLeads) {
      const firstStep = steps[0]
      await supabase.from('kiko_sequence_enrollments').insert({ sequence_id: id, contact_email: lead.email, contact_name: lead.name, company: lead.company, current_step: 1, status: 'active', next_send_at: new Date(Date.now() + (firstStep?.delay_days || 0) * 86400000).toISOString() })
    }
    setShowAddLeads(false); setSelectedLeads([]); setSearchResults([]); setLeadSearch(''); load()
  }

  async function addManualLead() {
    if (!manualLead.email.trim()) return
    setManualAdding(true)
    const name = [manualLead.firstName, manualLead.lastName].filter(Boolean).join(' ') || manualLead.email
    const firstStep = steps[0]
    await supabase.from('kiko_sequence_enrollments').insert({ sequence_id: id, contact_email: manualLead.email.trim(), contact_name: name, company: manualLead.company || null, current_step: 1, status: 'active', next_send_at: new Date(Date.now() + (firstStep?.delay_days || 0) * 86400000).toISOString() })
    setManualAdding(false); setShowManualAdd(false)
    setManualLead({ firstName: '', lastName: '', email: '', company: '', title: '', linkedin: '' })
    load()
  }

  async function selectLeadForTimeline(enrollment) {
    setSelectedLead(enrollment)
    const { data: q } = await supabase.from('kiko_outreach_queue').select('*').eq('enrollment_id', enrollment.id).order('scheduled_for', { ascending: true })
    setLeadActivity(q || [])
  }

  // Activity tab — chronological feed of all sends/opens/clicks/replies for this campaign
  async function loadActivity() {
    setActivityLoading(true)
    try {
      const enrIds = enrollments.map(e => e.id)
      if (!enrIds.length) { setActivityFeed([]); setActivityLoading(false); return }
      const { data } = await supabase.from('kiko_outreach_queue')
        .select('id, enrollment_id, to_email, to_name, company, subject, channel, step_number, status, sent_at, opened_at, last_opened_at, opens_count, clicked_at, clicks_count, reply_received_at, reply_snippet, reply_handled, error, created_at')
        .in('enrollment_id', enrIds)
        .order('created_at', { ascending: false })
        .limit(200)
      const events = []
      for (const r of (data || [])) {
        if (r.sent_at) events.push({ id: r.id + '-sent', ts: r.sent_at, type: 'sent', row: r })
        if (r.opened_at) events.push({ id: r.id + '-opened', ts: r.last_opened_at || r.opened_at, type: 'opened', row: r })
        if (r.clicked_at) events.push({ id: r.id + '-clicked', ts: r.clicked_at, type: 'clicked', row: r })
        if (r.reply_received_at) events.push({ id: r.id + '-replied', ts: r.reply_received_at, type: 'replied', row: r })
        if (r.error) events.push({ id: r.id + '-error', ts: r.created_at, type: 'error', row: r })
      }
      events.sort((a, b) => new Date(b.ts) - new Date(a.ts))
      setActivityFeed(events.slice(0, 100))
    } catch (e) { console.error('activity load failed', e) }
    setActivityLoading(false)
  }

  // Background sourcing — queues source_companies_bg job via /api/kiko-jobs
  async function queueBackgroundSource() {
    setBgSourcing(true); setBgJobMsg(null)
    try {
      const userId = '9f486437-4bf5-4111-abfe-fe19bfa76063'
      const category = seq?.target_persona || seq?.name || 'cybersecurity'
      const res = await fetch(`https://api.vanhawke.agency/api/kiko-jobs?user_id=${userId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_type: 'source_companies_bg',
          title: `Source contacts for "${seq?.name || 'campaign'}"`,
          params: { category, count: 15, sequence_id: id },
          related_entity_type: 'sequence',
          related_entity_id: id,
          user_id: userId,
        }),
      })
      const data = await res.json()
      if (data.ok) setBgJobMsg(`✅ Queued — Kiko will source contacts in the background. Worker runs every 5 min.`)
      else setBgJobMsg(`❌ ${data.error || 'queue failed'}`)
    } catch (e) { setBgJobMsg(`❌ ${e.message}`) }
    setBgSourcing(false)
    setTimeout(() => setBgJobMsg(null), 8000)
  }

  async function pauseEnr(eid) { await supabase.from('kiko_sequence_enrollments').update({ status: 'paused' }).eq('id', eid); await supabase.from('kiko_outreach_queue').update({ status: 'cancelled' }).eq('enrollment_id', eid).eq('status', 'queued'); load() }
  async function cancelEnr(eid) { await supabase.from('kiko_sequence_enrollments').update({ status: 'cancelled' }).eq('id', eid); await supabase.from('kiko_outreach_queue').update({ status: 'cancelled' }).eq('enrollment_id', eid).eq('status', 'queued'); load() }

  const cur = steps[selStep]
  const tabs = [{ id: 'sequence', label: 'Sequence' }, { id: 'prospects', label: 'Prospects', ct: enrollments.length }, { id: 'activity', label: 'Activity' }, { id: 'performance', label: 'Performance' }]
  const inputStyle = { width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#FAFAF7', color: C.text, fontSize: 13, fontFamily: C.font, outline: 'none', boxSizing: 'border-box' }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* Header — new style matching campaign drill-in */}
      <div style={{ padding: '16px 44px', borderBottom: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          <button onClick={() => nav('/campaigns')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}>
            <ArrowLeft size={18} stroke="#6B6B6B" />
          </button>
          <input value={seq?.name || ''} onChange={e => { setSeq({ ...seq, name: e.target.value }); setDirty(true) }} placeholder="Campaign name..." style={{ fontSize: 22, fontWeight: 300, background: 'none', border: 'none', color: C.text, fontFamily: "'Source Serif 4', Georgia, serif", letterSpacing: '-0.015em', outline: 'none', flex: 1, minWidth: 0 }} />
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          {dirty && <span style={{ fontSize: 11, color: '#B89C5C', fontWeight: 500 }}>Unsaved</span>}
          {!isNew && <button onClick={duplicateCampaign} title="Duplicate campaign" style={{ padding: '7px 8px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)', background: 'transparent', color: '#A0A0A0', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Copy size={12} /></button>}
          {!isNew && <button onClick={deleteCampaign} title="Delete campaign" style={{ padding: '7px 8px', borderRadius: 8, border: '1px solid rgba(184,100,62,0.15)', background: 'transparent', color: '#b8643e', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Trash2 size={12} /></button>}
          <button onClick={generateMultichannel} disabled={generating} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)', background: 'transparent', color: '#0A0A0A', fontSize: 12, fontWeight: 500, cursor: generating ? 'wait' : 'pointer', fontFamily: C.font, opacity: generating ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 5 }}><Sparkles size={12} />{generating ? 'Generating...' : 'Generate sequence'}</button>
          <button onClick={save} disabled={saving} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#0A0A0A', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font, opacity: saving ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 5 }}><Save size={12} />{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
      <div style={{ padding: '8px 44px 60px', fontFamily: C.font, color: C.text, maxWidth: 1300, margin: '0 auto', overflowY: 'auto', flex: 1, width: '100%', boxSizing: 'border-box' }}>
      {/* Metric tiles — Session 72 rebuild, render 1 */}
      {!isNew && (() => {
        const sentQ = queue.filter(q => q.status === 'sent')
        const openedU = new Set(queue.filter(q => q.opened_at).map(q => q.enrollment_id)).size
        const repliedN = enrollments.filter(e => e.reply_detected_at || e.status === 'replied').length
        const bouncedN = enrollments.filter(e => e.bounce_detected_at || e.status === 'bounced').length
        const pct = enrollments.length ? Math.round((openedU / enrollments.length) * 100) : 0
        const tiles = [['Enrolled', enrollments.length, ''], ['Sent', sentQ.length, ''], ['Opened', pct + '%', openedU ? openedU + ' unique' : ''], ['Replied', repliedN, enrollments.length && repliedN ? Math.round(repliedN / enrollments.length * 1000) / 10 + '%' : ''], ['Bounced', bouncedN, '']]
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
            {tiles.map(([k, v, d]) => (
              <div key={k} style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#A0A0A0', fontWeight: 500, marginBottom: 4 }}>{k}</div>
                <div style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 26, fontWeight: 400, color: '#0A0A0A' }}>{v}</div>
                {d ? <div style={{ fontSize: 11, color: '#A0A0A0', marginTop: 2 }}>{d}</div> : null}
              </div>
            ))}
          </div>
        )
      })()}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <input value={seq?.target_persona || ''} onChange={e => { setSeq({ ...seq, target_persona: e.target.value }); setDirty(true) }} placeholder="Target persona" style={{ ...inputStyle, flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: C.textTer, whiteSpace: 'nowrap' }}>Send from:</span>
          <select value={seq?.send_from_user_id || ''} onChange={e => { setSeq({ ...seq, send_from_user_id: e.target.value || null }); setDirty(true) }}
            style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#FAFAF7', color: C.text, fontSize: 13, fontFamily: C.font, outline: 'none', minWidth: 160 }}>
            <option value="">Default sender</option>
            {orgMembers.map(m => (
              <option key={m.user_id} value={m.user_id}>{m.display_name || m.email}{m.email ? ` (${m.email})` : ''}</option>
            ))}
          </select>
        </div>
        {/* Scheduling — send days and window */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: C.textTer, whiteSpace: 'nowrap' }}>Days:</span>
          <div style={{ display: 'flex', gap: 3 }}>
            {['mon','tue','wed','thu','fri','sat','sun'].map(day => {
              const days = seq?.send_days || ['mon','tue','wed','thu','fri']
              const active = days.includes(day)
              return <button key={day} onClick={() => {
                const newDays = active ? days.filter(d => d !== day) : [...days, day]
                setSeq({ ...seq, send_days: newDays }); setDirty(true)
              }} style={{ padding: '4px 8px', borderRadius: 4, border: `1px solid ${active ? 'rgba(125,138,100,0.4)' : C.border}`, background: active ? 'rgba(125,138,100,0.1)' : 'transparent', color: active ? '#7d8a64' : C.textTer, fontSize: 10, fontWeight: 500, cursor: 'pointer', fontFamily: C.font, textTransform: 'uppercase' }}>{day}</button>
            })}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: C.textTer, whiteSpace: 'nowrap' }}>Window:</span>
          <input type="time" value={seq?.send_window_start || '09:00'} onChange={e => { setSeq({ ...seq, send_window_start: e.target.value }); setDirty(true) }}
            style={{ padding: '5px 8px', borderRadius: 6, border: `1px solid ${C.border}`, background: '#FAFAF7', fontSize: 11, fontFamily: C.font, outline: 'none', color: C.text }} />
          <span style={{ fontSize: 11, color: C.textTer }}>to</span>
          <input type="time" value={seq?.send_window_end || '17:00'} onChange={e => { setSeq({ ...seq, send_window_end: e.target.value }); setDirty(true) }}
            style={{ padding: '5px 8px', borderRadius: 6, border: `1px solid ${C.border}`, background: '#FAFAF7', fontSize: 11, fontFamily: C.font, outline: 'none', color: C.text }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: C.textTer, cursor: 'pointer' }}>
            <input type="checkbox" checked={seq?.auto_timezone !== false} onChange={e => { setSeq({ ...seq, auto_timezone: e.target.checked }); setDirty(true) }} />
            Auto-timezone
          </label>
        </div>
      </div>
      {/* Draft/Live status banner */}
      {!isNew && isDraft && (
        <div style={{ padding: '10px 16px', borderRadius: 6, background: 'rgba(184,156,92,0.06)', border: '1px solid rgba(184,156,92,0.15)', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: C.amber, fontWeight: 500 }}>Draft</span>
            <span style={{ fontSize: 11, color: C.textTer }}>Build sequence → Add leads → Launch</span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['Sequence', 'Leads', 'Launch'].map((s, i) => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: (i === 0 && tab === 'sequence') ? 'rgba(0,0,0,0.08)' : 'transparent',
                  color: (i === 0 && tab === 'sequence') ? C.purple : C.textTer,
                  border: `1px solid ${(i === 0 && tab === 'sequence') ? 'rgba(0,0,0,0.10)' : C.border}`
                }}>{i + 1}</div>
                {i < 2 && <ChevronRight size={10} style={{ color: C.textMut }} />}
              </div>
            ))}
          </div>
        </div>
      )}
      {!isNew && !isDraft && (
        <div style={{ padding: '10px 16px', borderRadius: 6, background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.08)', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: C.teal, fontWeight: 500 }}>Live — emails sending Mon-Fri 8am-6pm, timed to prospect timezone</span>
          <button onClick={async () => { await supabase.from('kiko_sequences').update({ is_active: false }).eq('id', id); setSeq(prev => ({ ...prev, is_active: false })) }} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(184,100,62,0.2)', background: 'transparent', color: C.red, fontSize: 10, cursor: 'pointer', fontFamily: C.font }}>Pause campaign</button>
        </div>
      )}
      {/* Inline reply triage banner — when any enrollment has detected replies needing response */}
      {(() => {
        const repliedEnr = enrollments.filter(e => e.reply_detected_at || e.status === 'replied')
        if (repliedEnr.length === 0) return null
        return (
          <div style={{ padding: '12px 16px', borderRadius: 6, background: 'rgba(184,100,62,0.05)', border: '1px solid rgba(184,100,62,0.25)', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Reply size={14} style={{ color: C.red }} />
              <div>
                <div style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{repliedEnr.length} {repliedEnr.length === 1 ? 'reply' : 'replies'} need your response</div>
                <div style={{ fontSize: 11, color: C.textTer, marginTop: 1 }}>{repliedEnr.slice(0, 3).map(e => e.contact_name || e.contact_email).join(' · ')}{repliedEnr.length > 3 ? ` · +${repliedEnr.length - 3} more` : ''}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => { setTab('activity') }} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(184,100,62,0.30)', background: 'rgba(184,100,62,0.08)', color: C.red, fontSize: 11, cursor: 'pointer', fontFamily: C.font, fontWeight: 500 }}>Triage in Activity</button>
              <button onClick={() => nav('/command-centre')} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.textSec, fontSize: 11, cursor: 'pointer', fontFamily: C.font }}>Command Centre</button>
            </div>
          </div>
        )
      })()}
      <div style={{ display: 'flex', gap: 2, marginBottom: 14, padding: '4px 0' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setSelectedLead(null) }} style={{ padding: '6px 14px', borderRadius: 24, border: 'none', cursor: 'pointer', fontFamily: C.font, fontSize: 12, background: tab === t.id ? 'rgba(0,0,0,0.06)' : 'transparent', color: tab === t.id ? '#0A0A0A' : '#6B6B6B', fontWeight: tab === t.id ? 500 : 400, display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.12s' }}>
            {t.label}{t.ct !== undefined && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: tab === t.id ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.03)', color: '#6B6B6B' }}>{t.ct}</span>}
          </button>
        ))}
      </div>

      {/* ═══ SEQUENCE TAB ═══ */}
      {tab === 'sequence' && (
        <>
        {/* View mode toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, justifyContent: 'space-between' }}>
          <div style={{ fontSize: 11, color: C.textSec, fontFamily: C.font }}>{steps.length} steps · {steps.reduce((s, st) => s + (st.delay_days || 0), 0)} day sequence</div>
          <button onClick={async () => {
            if (!confirm('Regenerate all sequence steps with Kiko? This replaces the current steps with a fresh authority-led sequence.')) return
            const category = seq?.description || seq?.name || 'technology'
            const team = seq?.name?.split(' - ')[0] || 'Haas F1'
            const persona = seq?.target_persona || 'C-suite'
            try {
              const r = await fetch('https://api.vanhawke.agency/api/generate-sequence', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category, team, persona }),
              })
              const d = await r.json()
              if (d.ok && d.sequence?.steps) {
                setSteps(d.sequence.steps)
                setDirty(true)
              } else { alert('Generation failed: ' + (d.error || 'unknown')) }
            } catch (e) { alert('Error: ' + e.message) }
          }} style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid rgba(124,92,252,0.2)`, background: 'rgba(124,92,252,0.05)', color: '#7C5CFC', fontSize: 10, fontWeight: 500, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 4 }}>
            <RefreshCw size={10} /> Regenerate with Kiko
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 14, minHeight: 0 }}>
          {/* LEFT: Flow view */}
          <div style={{ ...glass, padding: 0, overflow: 'hidden', minWidth: 0 }}>
            <SequenceFlowView steps={steps} conditions={conditions} selectedStep={selStep} onSelectStep={(i) => { setSelStep(i) }} onAddStep={(type, pos) => { addStep(type, pos) }} onDeleteStep={(i) => { del(i) }} onUpdateDelay={(i, d) => { upd(i, 'delay_days', d) }} onUpdateStep={(updated) => { setSteps(updated); setDirty(true) }} />
          </div>
          <div style={{ ...glass, padding: 18 }}>
            {cur ? (
              <>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {cur.type === 'condition' ? <GitBranch size={14} style={{ color: C.amber }} /> : cur.channel === 'linkedin' ? <Linkedin size={14} style={{ color: '#0077B5' }} /> : <Mail size={14} style={{ color: C.purple }} />}
                  Step {selStep + 1} · {cur.type === 'condition' ? (cur.condition_type === 'connection_accepted' ? 'Connection Accepted?' : 'Condition (branch)') : cur.channel === 'email' ? 'Email' : cur.action === 'invite' ? 'Connection Request' : 'LinkedIn Message'}
                </div>
                {/* ═══ CONDITION STEP EDITOR ═══ */}
                {cur.type === 'condition' ? (
                  <>
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ fontSize: 10, color: C.textTer, marginBottom: 4, display: 'block' }}>Condition type</label>
                      <select value={cur.condition_type || 'no_reply'} onChange={e => upd(selStep, 'condition_type', e.target.value)} style={{ ...inputStyle, fontSize: 12 }}>
                        {CONDITIONS.map(c => <option key={c.value} value={c.value} style={{ background: '#FFFFFF' }}>{c.label}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                      {/* YES branch */}
                      <div style={{ padding: 12, borderRadius: 6, background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.08)' }}>
                        <div style={{ fontSize: 11, fontWeight: 500, color: C.teal, marginBottom: 8 }}>✅ YES branch</div>
                        <div style={{ fontSize: 10, color: C.textTer, marginBottom: 8 }}>
                          {cur.condition_type === 'no_reply' ? 'Lead did NOT reply' : cur.condition_type === 'has_linkedin' ? 'Has LinkedIn URL' : cur.condition_type === 'has_email' ? 'Has verified email' : 'Condition met'}
                        </div>
                        {(cur.yes_steps || []).map((ys, yi) => (
                          <div key={yi} style={{ padding: '6px 8px', borderRadius: 6, background: C.cardHover, border: `1px solid ${C.border}`, marginBottom: 4, fontSize: 10 }}>
                            <div style={{ color: C.textSec }}>{ys.channel === 'linkedin' ? '💼 LinkedIn' : '📧 Email'} — {ys.approach || 'authority-led'}</div>
                            {ys.subject && <div style={{ color: C.textTer, marginTop: 2 }}>{ys.subject}</div>}
                          </div>
                        ))}
                      </div>
                      {/* NO branch */}
                      <div style={{ padding: 12, borderRadius: 6, background: 'rgba(184,100,62,0.04)', border: '1px solid rgba(184,100,62,0.12)' }}>
                        <div style={{ fontSize: 11, fontWeight: 500, color: C.red, marginBottom: 8 }}>❌ NO branch</div>
                        <div style={{ fontSize: 10, color: C.textTer, marginBottom: 8 }}>
                          {cur.condition_type === 'no_reply' ? 'Lead DID reply (sequence stops)' : cur.condition_type === 'has_linkedin' ? 'No LinkedIn URL' : cur.condition_type === 'has_email' ? 'No verified email' : 'Condition not met'}
                        </div>
                        {(cur.no_steps || []).map((ns, ni) => (
                          <div key={ni} style={{ padding: '6px 8px', borderRadius: 6, background: C.cardHover, border: `1px solid ${C.border}`, marginBottom: 4, fontSize: 10 }}>
                            <div style={{ color: C.textSec }}>{ns.channel === 'linkedin' ? '💼 LinkedIn' : '📧 Email'} — {ns.approach || 'authority-led'}</div>
                            {ns.subject && <div style={{ color: C.textTer, marginTop: 2 }}>{ns.subject}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: C.textTer, fontStyle: 'italic', lineHeight: 1.5 }}>
                      Branches auto-configured. Ask Kiko: "Generate a multichannel branching campaign for [category]" for full customisation.
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button onClick={() => askKiko(selStep)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 6, border: `1px solid rgba(0,0,0,0.08)`, background: 'rgba(0,0,0,0.03)', color: C.purple, fontSize: 11, cursor: 'pointer', fontFamily: C.font, flex: 1, justifyContent: 'center' }}><Sparkles size={12} />Ask Kiko to optimise branches</button>
                    </div>
                  </>
                ) : (
                  <>
                {/* ═══ STEP EDITOR — StepComposer, the standard drafter (Session 72) ═══ */}
                <div style={{ marginBottom: 12 }}>
                  <StepComposer
                    channel={cur.channel === 'linkedin' ? 'linkedin' : 'email'}
                    subject={cur.subject || ''}
                    body={cur.template || ''}
                    onSubject={v => upd(selStep, 'subject', v)}
                    onBody={v => upd(selStep, 'template', v)}
                    onTest={() => { if (cur.channel === 'linkedin') { setLiTestOpen(true); setLiTestUrl(''); setLiTestSent(false) } else { setTestModalStep(selStep); setTestModalOpen(true) } }}
                    onRefine={prompt => refineStep(selStep, prompt)}
                    onDelete={() => del(selStep)}
                    refining={refining}
                    testSent={cur.channel === 'linkedin' ? liTestSent : testSent}
                    sender={(orgMembers.find(m => m.user_id === seq?.send_from_user_id)?.email) || 'matt.smith@vanhawke.agency'}
                  />
                </div>

                {/* Variables */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 14 }}>
                  {VARS.map(v => <button key={v} onClick={() => upd(selStep, 'template', (cur.template || '') + v)} style={{ padding: '3px 8px', borderRadius: 4, border: `1px solid ${C.border}`, background: '#FAFAF8', color: C.purple, fontSize: 10, cursor: 'pointer', fontFamily: C.font }}>{v}</button>)}
                </div>

                {/* Write with Kiko — full generation */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  <button onClick={() => askKiko(selStep)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: 'none', background: '#0A0A0A', color: '#FEFEFC', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font, flex: 1, justifyContent: 'center' }}><Sparkles size={13} /> Write with Kiko</button>
                </div>

                {/* Approach & Psychology — collapsed advanced section */}
                <details style={{ marginTop: 4, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                  <summary style={{ fontSize: 11, color: C.textTer, cursor: 'pointer', fontFamily: C.font, listStyle: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 8, color: C.textTer }}>▶</span> Advanced: approach &amp; psychology
                  </summary>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <div style={{ flex: 1 }}><label style={{ fontSize: 10, color: C.textTer, marginBottom: 2, display: 'block' }}>Approach</label>
                      <select value={cur.approach || ''} onChange={e => updAndRegen(selStep, 'approach', e.target.value)} style={{ ...inputStyle, padding: '5px 6px', fontSize: 11 }}>{APPROACHES.map(a => <option key={a} value={a} style={{ background: '#FFFFFF' }}>{a}</option>)}</select></div>
                    <div style={{ flex: 1 }}><label style={{ fontSize: 10, color: C.textTer, marginBottom: 2, display: 'block' }}>Psychology</label>
                      <select value={cur.psychology || ''} onChange={e => updAndRegen(selStep, 'psychology', e.target.value)} style={{ ...inputStyle, padding: '5px 6px', fontSize: 11 }}>{PSYCHOLOGY.map(p => <option key={p} value={p} style={{ background: '#FFFFFF' }}>{p.replace(/_/g, ' ')}</option>)}</select></div>
                  </div>
                  {regenPrompt && <div style={{ padding: '6px 10px', borderRadius: 6, background: 'rgba(184,156,92,0.06)', border: '1px solid rgba(184,156,92,0.12)', marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: C.amber }}>Regenerate content?</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => { askKiko(selStep); setRegenPrompt(false) }} style={{ padding: '3px 8px', borderRadius: 4, border: 'none', background: '#0A0A0A', color: '#FEFEFC', fontSize: 10, cursor: 'pointer', fontFamily: C.font }}>Yes</button>
                      <button onClick={() => setRegenPrompt(false)} style={{ padding: '3px 8px', borderRadius: 4, border: `1px solid ${C.border}`, background: 'transparent', color: C.textTer, fontSize: 10, cursor: 'pointer', fontFamily: C.font }}>Keep</button>
                    </div>
                  </div>}
                </details>

                {/* ═══ REFINE WITH FEEDBACK — iterate back and forth with Kiko ═══ */}
                {cur.template && !cur.template.startsWith('⏳') && !cur.template.startsWith('Error') && (
                  <div style={{ marginTop: 10, padding: 10, borderRadius: 6, background: 'rgba(0,0,0,0.02)', border: `1px solid rgba(0,0,0,0.06)` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <Sparkles size={11} color={C.purple} />
                      <span style={{ fontSize: 10, fontWeight: 500, color: C.purple }}>Refine with feedback</span>
                      <span style={{ fontSize: 9, color: C.textTer }}>— tell Kiko what to change, she rewrites preserving what you kept</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <textarea
                        value={refineText}
                        onChange={e => setRefineText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); refineStep(selStep, refineText) } }}
                        rows={2}
                        placeholder='e.g. "make it shorter", "drop the second paragraph", "mention their recent funding round", "less formal"'
                        style={{ ...inputStyle, flex: 1, padding: '6px 8px', fontSize: 11, resize: 'vertical', lineHeight: 1.5 }}
                        disabled={refining}
                      />
                      <button
                        onClick={() => refineStep(selStep, refineText)}
                        disabled={refining || !refineText.trim()}
                        style={{
                          padding: '0 14px', borderRadius: 6,
                          border: 'none',
                          background: refining || !refineText.trim() ? 'rgba(0,0,0,0.03)' : 'rgba(0,0,0,0.08)',
                          color: refining || !refineText.trim() ? C.textTer : C.purple,
                          fontSize: 11, fontWeight: 500, cursor: refining || !refineText.trim() ? 'not-allowed' : 'pointer',
                          fontFamily: C.font, whiteSpace: 'nowrap', alignSelf: 'stretch',
                        }}
                      >
                        {refining ? 'Refining...' : 'Refine'}
                      </button>
                    </div>
                    <div style={{ fontSize: 9, color: C.textTer, marginTop: 4 }}>⌘/Ctrl + Enter to submit</div>
                  </div>
                )}
                  </>
                )}
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, color: C.textTer, fontSize: 12, gap: 10 }}>
                <span>Add a step to start building</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => addStep('email')} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid rgba(0,0,0,0.08)`, background: 'rgba(0,0,0,0.03)', color: C.purple, fontSize: 11, cursor: 'pointer', fontFamily: C.font }}>+ Email</button>
                  <button onClick={() => addStep('linkedin_connect')} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(0,119,181,0.15)', background: 'rgba(0,119,181,0.04)', color: '#0077B5', fontSize: 11, cursor: 'pointer', fontFamily: C.font }}>+ Connection Request</button>
                  <button onClick={() => addStep('linkedin_message')} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(0,119,181,0.15)', background: 'rgba(0,119,181,0.04)', color: '#0077B5', fontSize: 11, cursor: 'pointer', fontFamily: C.font }}>+ LinkedIn Message</button>
                  <button onClick={() => addStep('condition')} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(184,156,92,0.15)', background: 'rgba(184,156,92,0.06)', color: C.amber, fontSize: 11, cursor: 'pointer', fontFamily: C.font }}>+ Condition</button>
                </div>
              </div>
            )}
          </div>
        </div>
        {/* Save & return */}
        {steps.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button onClick={async () => { if (dirty) await save(); setTab('prospects') }} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: '#0A0A0A', color: '#FEFEFC', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 6 }}>
              Save &amp; manage prospects <ChevronRight size={14} />
            </button>
          </div>
        )}
      </>)}

      {/* ═══ LEADS TAB ═══ */}
      {/* ═══ PROSPECTS TAB ═══ */}
      {tab === 'prospects' && (
        <>
        <div style={{ ...glass, overflow: 'hidden', marginBottom: 14 }}>
          {/* Header */}
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 500, fontFamily: C.font }}>Prospects</span>
              {enrollments.length > 0 && (
                <div style={{ display: 'flex', gap: 10, fontSize: 11, color: C.textTer, fontFamily: C.font }}>
                  <span>{enrollments.length} enrolled</span>
                  <span style={{ color: C.teal }}>{enrollments.filter(e => e.status === 'active').length} active</span>
                  <span style={{ color: '#00B464' }}>{enrollments.filter(e => e.status === 'replied').length} replied</span>
                  <span style={{ color: '#f87171' }}>{enrollments.filter(e => e.status === 'bounced').length} bounced</span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={autoSuggestLeads} disabled={loadingSuggestions} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#0A0A0A', color: '#FEFEFC', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 4 }}><Sparkles size={12} />{loadingSuggestions ? 'Finding...' : 'Find leads'}</button>
              <button onClick={queueBackgroundSource} disabled={bgSourcing} style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 4 }}>{bgSourcing ? '⏳ Queuing...' : '🔍 Deep source'}</button>
              <button onClick={() => setShowAddLeads(true)} style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 4 }}><UserPlus size={12} /> Add from CRM</button>
              <button onClick={() => setShowManualAdd(true)} style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={12} /> Manual</button>
            </div>
          </div>

          {/* Prospect list */}
          {enrollments.length > 0 ? (
            <div>
              <div style={{ display: 'flex', padding: '8px 18px', borderBottom: `1px solid ${C.border}`, fontSize: 10, color: C.textTer, fontWeight: 500, fontFamily: C.font }}>
                <span style={{ flex: 1 }}>Name</span><span style={{ width: 140 }}>Company</span><span style={{ width: 80, textAlign: 'center' }}>Step</span><span style={{ width: 80, textAlign: 'center' }}>Status</span>
              </div>
              <div>
                {enrollments.slice((prospectPage - 1) * PROSPECTS_PER_PAGE, prospectPage * PROSPECTS_PER_PAGE).map(e => {
                  const statusColor = e.status === 'replied' ? '#00B464' : e.status === 'bounced' ? '#f87171' : e.status === 'paused' ? C.amber : C.teal
                  const statusIcon = e.status === 'replied' ? '✓' : e.status === 'bounced' ? '✗' : e.status === 'paused' ? '⏸' : '●'
                  return (
                    <div key={e.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 18px', borderBottom: `1px solid rgba(0,0,0,0.03)`, fontSize: 12, fontFamily: C.font }}
                      onMouseEnter={ev => ev.currentTarget.style.background = 'rgba(0,0,0,0.015)'} onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: C.text, fontWeight: 450 }}>{e.contact_name || e.contact_email}</div>
                        <div style={{ fontSize: 10, color: C.textTer, marginTop: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                          {e.contact_email}
                          {e.linkedin_url && <a href={e.linkedin_url} target="_blank" rel="noopener noreferrer" onClick={ev => ev.stopPropagation()} style={{ color: '#0077B5', fontSize: 9 }}>LinkedIn</a>}
                        </div>
                      </div>
                      <div style={{ width: 140, fontSize: 11, color: C.textSec }}>{e.company}</div>
                      <div style={{ width: 80, textAlign: 'center', fontSize: 11, color: C.textSec }}>{e.current_step}/{steps.length}</div>
                      <div style={{ width: 80, textAlign: 'center' }}>
                        <span style={{ fontSize: 11, color: statusColor, fontWeight: 500 }}>{statusIcon} {e.status}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* Pagination */}
              {enrollments.length > PROSPECTS_PER_PAGE && (
                <div style={{ padding: '12px 18px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
                  {Array.from({ length: Math.ceil(enrollments.length / PROSPECTS_PER_PAGE) }, (_, i) => (
                    <button key={i} onClick={() => setProspectPage(i + 1)} style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${prospectPage === i + 1 ? '#0A0A0A' : C.border}`, background: prospectPage === i + 1 ? '#0A0A0A' : 'transparent', color: prospectPage === i + 1 ? '#FEFEFC' : C.textSec, fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: C.font }}>{i + 1}</button>
                  ))}
                  <span style={{ fontSize: 10, color: C.textTer, marginLeft: 8, fontFamily: C.font }}>{enrollments.length} total</span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: 40, textAlign: 'center', color: C.textTer, fontSize: 13, fontFamily: C.font }}>
              No prospects enrolled yet. Click "Find leads" to source prospects automatically.
            </div>
          )}
          {bgJobMsg && (
            <div style={{ padding: '12px 16px', margin: '8px 0', borderRadius: 8, background: bgJobMsg.startsWith('✅') ? 'rgba(0,180,100,0.08)' : 'rgba(248,113,113,0.08)', border: `1px solid ${bgJobMsg.startsWith('✅') ? 'rgba(0,180,100,0.2)' : 'rgba(248,113,113,0.2)'}`, fontSize: 12, color: '#0A0A0A', fontFamily: C.font, lineHeight: 1.5 }}>
              {bgJobMsg}
            </div>
          )}
        </div>

        {/* Action buttons */}
        {enrollments.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setTab('sequence')} style={{ padding: '10px 18px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.textSec, fontSize: 12, cursor: 'pointer', fontFamily: C.font }}>← Back to Sequence</button>
            {isDraft && <button onClick={() => setShowLaunchConfirm(true)} disabled={launching} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: '#0A0A0A', color: '#FEFEFC', fontSize: 12, fontWeight: 600, cursor: launching ? 'wait' : 'pointer', fontFamily: C.font, opacity: launching ? 0.6 : 1 }}>
              {launching ? 'Activating...' : 'Activate Campaign'}
            </button>}
          </div>
        )}
        </>
      )}

      {/* ═══ ACTIVITY TAB ═══ */}
      {tab === 'activity' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: C.textTer, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Activity feed · {activityFeed.length} events
            </div>
            <button onClick={loadActivity} disabled={activityLoading} style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.cardHover, color: C.textSec, fontSize: 11, cursor: 'pointer', fontFamily: C.font }}>
              {activityLoading ? 'Loading…' : '↻ Refresh'}
            </button>
          </div>
          {activityFeed.length === 0 && !activityLoading && (
            <div style={{ padding: 32, textAlign: 'center', background: C.card, border: `1px solid ${C.border}`, borderRadius: C.r }}>
              <div style={{ fontSize: 13, color: C.textSec, marginBottom: 4 }}>No activity yet</div>
              <div style={{ fontSize: 11, color: C.textTer }}>
                {enrollments.length === 0 ? 'Add leads and launch the campaign to see sends, opens, clicks and replies here.' : 'Sends will appear here once the sequencer starts processing this campaign.'}
              </div>
            </div>
          )}
          {activityFeed.map(ev => {
            const isReply = ev.type === 'replied'
            const isError = ev.type === 'error'
            const color = isReply ? C.green : isError ? C.red : ev.type === 'opened' ? C.blue : ev.type === 'clicked' ? C.teal : C.purple
            const icon = isReply ? '↩' : isError ? '⚠' : ev.type === 'opened' ? '👁' : ev.type === 'clicked' ? '🔗' : '✉'
            return (
              <div key={ev.id} style={{ display: 'flex', gap: 12, padding: '11px 14px', borderRadius: 6, marginBottom: 4, background: isReply ? 'rgba(52,211,153,0.04)' : isError ? 'rgba(184,100,62,0.04)' : 'transparent', border: `1px solid ${isReply ? 'rgba(52,211,153,0.20)' : isError ? 'rgba(184,100,62,0.20)' : C.border}` }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: `${color}10`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>{icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 10, fontWeight: 500, color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{ev.type}</span>
                    <span style={{ fontSize: 10, color: C.textTer }}>Step {ev.row.step_number} · {ev.row.channel}</span>
                    {isReply && !ev.row.reply_handled && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 6, background: 'rgba(184,100,62,0.10)', color: C.red, fontWeight: 500 }}>UNHANDLED</span>}
                  </div>
                  <div style={{ fontSize: 13, color: C.text, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ev.row.to_name || ev.row.to_email}{ev.row.company ? ` — ${ev.row.company}` : ''}
                  </div>
                  <div style={{ fontSize: 11, color: C.textTer, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isReply ? (ev.row.reply_snippet || 'Reply received') : isError ? ev.row.error : ev.row.subject}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: C.textTer, flexShrink: 0, alignSelf: 'flex-start', marginTop: 4 }}>{timeAgo(ev.ts)}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* ═══ PERFORMANCE TAB ═══ */}
      {tab === 'performance' && (
        <div>
          {enrollments.length > 0 ? (
            <>
              {(() => {
                const openedQ = queue.filter(q => q.opened_at).length;
                const clickedQ = queue.filter(q => q.clicked_at).length;
                const sentQ = queue.filter(q => q.status === 'sent').length;
                return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10, marginBottom: 16 }}>
                {[
                  { l: 'Enrolled', v: enrollments.length, c: C.purple },
                  { l: 'Sent', v: sentQ, c: C.text },
                  { l: 'Opened', v: openedQ, sub: sentQ > 0 ? `${Math.round(openedQ/sentQ*100)}%` : null, c: C.blue },
                  { l: 'Clicked', v: clickedQ, sub: sentQ > 0 ? `${Math.round(clickedQ/sentQ*100)}%` : null, c: C.purple },
                  { l: 'Replied', v: enrollments.filter(e => e.status === 'replied').length, c: C.teal },
                  { l: 'Reply rate', v: `${enrollments.length ? Math.round(enrollments.filter(e => e.status === 'replied').length / enrollments.length * 100) : 0}%`, c: C.amber },
                  { l: 'Bounced', v: enrollments.filter(e => e.status === 'bounced').length, c: C.red },
                ].map((s, i) => (
                  <div key={i} style={{ ...glass, padding: '14px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 500, color: s.v && s.v !== '0%' ? s.c : C.textMut }}>{s.v}{s.sub && <span style={{ fontSize: 10, color: C.textSec, marginLeft: 3 }}>{s.sub}</span>}</div>
                    <div style={{ fontSize: 9, color: C.textTer, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.l}</div>
                  </div>
                ))}
              </div>
                )
              })()}

              {/* ═══ TOP PERFORMING PATTERNS — Learning Loop ═══
                  Hidden until min_sample_size=3 sends per pattern accumulate.
                  Auto-populated by get_top_email_patterns SQL function. */}
              {topPatterns.length > 0 && (
                <div style={{ ...glass, padding: '14px 16px', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.purple, boxShadow: `0 0 8px ${C.purple}` }} />
                    <span style={{ fontSize: 12, fontWeight: 500, color: C.text, letterSpacing: '0.02em' }}>What's working</span>
                    <span style={{ fontSize: 9, color: C.textTer, marginLeft: 4 }}>· Kiko learns from real send data and biases new emails toward these patterns</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(topPatterns.length, 3)}, 1fr)`, gap: 10 }}>
                    {topPatterns.map((p, i) => (
                      <div key={i} style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(0,0,0,0.03)', border: `1px solid ${C.border}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 500, color: C.purple, padding: '2px 7px', borderRadius: 10, background: 'rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.10)' }}>#{i + 1}</span>
                          <span style={{ fontSize: 11, color: C.textSec, fontWeight: 500, textTransform: 'capitalize' }}>{p.approach}</span>
                          <span style={{ fontSize: 9, color: C.textTer }}>×</span>
                          <span style={{ fontSize: 11, color: C.textSec, fontWeight: 500, textTransform: 'capitalize' }}>{p.psychology}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 500, color: C.blue }}>{p.open_rate}%</div>
                            <div style={{ fontSize: 8, color: C.textTer, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 1 }}>Open</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 500, color: C.purple }}>{p.click_rate}%</div>
                            <div style={{ fontSize: 8, color: C.textTer, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 1 }}>Click</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 500, color: C.teal }}>{p.reply_rate}%</div>
                            <div style={{ fontSize: 8, color: C.textTer, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 1 }}>Reply</div>
                          </div>
                        </div>
                        {p.example_subject && (
                          <div style={{ fontSize: 10, color: C.textTer, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>
                            "{p.example_subject}"
                          </div>
                        )}
                        <div style={{ fontSize: 9, color: C.textMut, marginTop: 4 }}>n={p.sample_size}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ ...glass, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 500 }}>Step breakdown</div>
                {steps.map((s, i) => {
                  const sentQ = queue.filter(q => q.step_number === i + 1 && q.status === 'sent').length
                  const pctSent = enrollments.length > 0 ? Math.round(sentQ / enrollments.length * 100) : 0
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${C.border}`, fontSize: 11 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 6, background: s.type === 'condition' ? 'rgba(184,156,92,0.10)' : s.channel === 'linkedin' ? 'rgba(0,119,181,0.12)' : 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {s.type === 'condition' ? <GitBranch size={9} style={{ color: C.amber }} /> : s.channel === 'linkedin' ? <Linkedin size={9} style={{ color: '#0077B5' }} /> : <Mail size={9} style={{ color: C.purple }} />}
                      </div>
                      <span style={{ width: 60, color: C.textTer }}>Step {i + 1}</span>
                      <span style={{ flex: 1, color: C.textSec }}>{s.type === 'condition' ? 'Condition' : s.approach || 'authority-led'}</span>
                      <div style={{ width: 80, height: 4, background: C.cardHover, borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 2, width: `${pctSent}%`, background: C.teal, transition: 'width 0.3s' }} />
                      </div>
                      <span style={{ width: 50, textAlign: 'right', color: C.textSec }}>{sentQ} sent</span>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div style={{ ...glass, padding: 40, textAlign: 'center', color: C.textTer, fontSize: 12, fontWeight: 300 }}>No data yet. Enroll leads and launch the campaign to see performance.</div>
          )}
        </div>
      )}

      {/* ═══ MANUAL ADD LEAD MODAL ═══ */}
      {showManualAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowManualAdd(false)}>
          <div onClick={e => e.stopPropagation()} style={{ ...glass, padding: 24, width: 440, maxWidth: '90vw', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontSize: 15, fontWeight: 500 }}>Add lead manually</div>
              <button onClick={() => setShowManualAdd(false)} style={{ background: 'none', border: 'none', color: C.textTer, cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <div style={{ fontSize: 11, color: C.textTer, fontWeight: 300, marginBottom: 16 }}>Add a contact directly without searching the CRM. They'll be enrolled immediately.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div><label style={{ fontSize: 10, color: C.textTer, display: 'block', marginBottom: 3 }}>First name</label>
                <input value={manualLead.firstName} onChange={e => setManualLead({ ...manualLead, firstName: e.target.value })} placeholder="John" style={inputStyle} autoFocus /></div>
              <div><label style={{ fontSize: 10, color: C.textTer, display: 'block', marginBottom: 3 }}>Last name</label>
                <input value={manualLead.lastName} onChange={e => setManualLead({ ...manualLead, lastName: e.target.value })} placeholder="Smith" style={inputStyle} /></div>
            </div>
            <div style={{ marginBottom: 10 }}><label style={{ fontSize: 10, color: C.textTer, display: 'block', marginBottom: 3 }}>Email *</label>
              <input value={manualLead.email} onChange={e => setManualLead({ ...manualLead, email: e.target.value })} placeholder="john@company.com" type="email" style={inputStyle} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div><label style={{ fontSize: 10, color: C.textTer, display: 'block', marginBottom: 3 }}>Company</label>
                <input value={manualLead.company} onChange={e => setManualLead({ ...manualLead, company: e.target.value })} placeholder="Acme Corp" style={inputStyle} /></div>
              <div><label style={{ fontSize: 10, color: C.textTer, display: 'block', marginBottom: 3 }}>Title</label>
                <input value={manualLead.title} onChange={e => setManualLead({ ...manualLead, title: e.target.value })} placeholder="VP Marketing" style={inputStyle} /></div>
            </div>
            <div style={{ marginBottom: 16 }}><label style={{ fontSize: 10, color: C.textTer, display: 'block', marginBottom: 3 }}>LinkedIn URL</label>
              <input value={manualLead.linkedin} onChange={e => setManualLead({ ...manualLead, linkedin: e.target.value })} placeholder="https://linkedin.com/in/..." style={inputStyle} /></div>
            <button onClick={addManualLead} disabled={manualAdding || !manualLead.email.trim()} style={{ width: '100%', padding: '9px 0', borderRadius: 6, border: 'none', background: manualAdding ? C.cardHover : 'rgba(0,0,0,0.06)', color: manualAdding ? C.textTer : C.purple, fontSize: 12, fontWeight: 500, cursor: manualAdding ? 'default' : 'pointer', fontFamily: C.font }}>
              {manualAdding ? '⏳ Adding...' : 'Enroll lead'}
            </button>
          </div>
        </div>
      )}

      {/* ═══ ADD FROM CRM MODAL ═══ */}
      {showAddLeads && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowAddLeads(false)}>
          <div onClick={e => e.stopPropagation()} style={{ ...glass, padding: 24, width: 500, maxWidth: '90vw', maxHeight: '70vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 500 }}>Add leads from CRM</div>
              <button onClick={() => setShowAddLeads(false)} style={{ background: 'none', border: 'none', color: C.textTer, cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              <input value={leadSearch} onChange={e => setLeadSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchContacts()} placeholder="Search by company, name, or title..." style={{ ...inputStyle, flex: 1 }} />
              <button onClick={searchContacts} disabled={searching} style={{ padding: '8px 14px', borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.06)', color: C.purple, fontSize: 11, cursor: 'pointer', fontFamily: C.font }}><Search size={12} /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: 14 }}>
              {searchResults.map(r => {
                const checked = selectedLeads.some(l => l.id === r.id)
                return (
                  <div key={r.id} onClick={() => checked ? setSelectedLeads(selectedLeads.filter(l => l.id !== r.id)) : setSelectedLeads([...selectedLeads, r])} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer', background: checked ? 'rgba(0,0,0,0.02)' : 'transparent' }}>
                    <div style={{ width: 16, height: 16, borderRadius: 3, border: `1px solid ${checked ? C.purple : C.border}`, background: checked ? C.purple : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{checked && <span style={{ color: '#111', fontSize: 10 }}>✓</span>}</div>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 12, color: C.text }}>{r.name}</div><div style={{ fontSize: 10, color: C.textTer }}>{r.company} · {r.title || 'No title'} · {r.email}</div></div>
                  </div>
                )
              })}
              {searchResults.length === 0 && leadSearch && !searching && <div style={{ padding: 20, textAlign: 'center', color: C.textTer, fontSize: 11, fontWeight: 300 }}>No contacts found. Try a different search.</div>}
            </div>
            {selectedLeads.length > 0 && <button onClick={enrollSelected} style={{ width: '100%', padding: '9px 0', borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.06)', color: C.purple, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font }}>Enroll {selectedLeads.length} contact{selectedLeads.length > 1 ? 's' : ''}</button>}
          </div>
        </div>
      )}

      {/* ═══ LAUNCH CONFIRMATION ═══ */}
      {showLaunchConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowLaunchConfirm(false)}>
          <div onClick={e => e.stopPropagation()} style={{ ...glass, padding: 28, width: 440, maxWidth: '90vw', boxShadow: '0 12px 40px rgba(0,0,0,0.5)', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🚀</div>
            <div style={{ fontSize: 17, fontWeight: 500, marginBottom: 8 }}>Launch "{seq?.name}"?</div>
            <div style={{ fontSize: 12, color: C.textTer, marginBottom: 20, lineHeight: 1.6, fontWeight: 300 }}>
              {steps.length} steps · {enrollments.length} leads enrolled<br/>
              Emails will be personalised at 6am and sent Mon-Fri 8am-6pm (30/day cap).<br/>
              Timing adapts to each prospect's timezone for optimal open rates.<br/>
              You can pause at any time.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setShowLaunchConfirm(false)} style={{ padding: '10px 20px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.textSec, fontSize: 13, cursor: 'pointer', fontFamily: C.font }}>Cancel</button>
              <button onClick={launchCampaign} disabled={launching} style={{ padding: '10px 28px', borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.08)', color: C.teal, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: C.font, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>{launching ? '⏳ Launching...' : '🚀 Go Live'}</button>
            </div>
          </div>
        </div>
      )}
      {/* Test Send Modal */}
      {testModalOpen && (() => {
        const currentUser = orgMembers.find(m => m.user_id === (supabase.auth?.user?.()?.id)) || orgMembers[0]
        const sender = orgMembers.find(m => m.user_id === seq?.send_from_user_id) || currentUser
        const handleTestSend = async () => {
          const recipients = []
          if (testRecipientMode === 'me' && currentUser?.email) recipients.push(currentUser.email)
          else if (testRecipientMode === 'sender' && sender?.email) recipients.push(sender.email)
          else if (testRecipientMode === 'both') { if (currentUser?.email) recipients.push(currentUser.email); if (sender?.email && sender.email !== currentUser?.email) recipients.push(sender.email) }
          else if (testRecipientMode === 'all') orgMembers.forEach(m => { if (m.email) recipients.push(m.email) })
          if (!recipients.length) { alert('No recipients found'); return }
          setTestSending(true)
          try {
            for (const to of recipients) { await sendTest(testModalStep, to) }
            setTestSent(true); setTimeout(() => setTestSent(false), 5000)
          } catch (err) { alert('Test send failed: ' + err.message) }
          setTestSending(false); setTestModalOpen(false)
        }
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setTestModalOpen(false)}>
            <div onClick={e => e.stopPropagation()} style={{ width: 380, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, boxShadow: '0 16px 48px rgba(0,0,0,0.4)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 500, color: C.text, margin: '0 0 16px', fontFamily: C.font }}>Send test email</h3>
              {[
                { id: 'me', label: `Just me (${currentUser?.email || 'you'})` },
                { id: 'sender', label: `Just sender (${sender?.email || 'sender'})` },
                { id: 'both', label: 'Both (me + sender)' },
                { id: 'all', label: `All org members (${orgMembers.length})` },
              ].map(opt => (
                <label key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'pointer', fontSize: 13, color: C.text, fontFamily: C.font }}>
                  <input type="radio" name="testRecipient" checked={testRecipientMode === opt.id} onChange={() => setTestRecipientMode(opt.id)} style={{ accentColor: C.purple }} />
                  {opt.label}
                </label>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                <button onClick={() => setTestModalOpen(false)} style={{ padding: '8px 16px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.textSec, fontSize: 12, cursor: 'pointer', fontFamily: C.font }}>Cancel</button>
                <button onClick={handleTestSend} disabled={testSending} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: C.purple, color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font, opacity: testSending ? 0.5 : 1 }}>{testSending ? 'Sending...' : 'Send test'}</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* LinkedIn test modal */}
      {liTestOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setLiTestOpen(false)}>
          <div style={{ background: '#FFFFFF', borderRadius: 14, maxWidth: 420, width: '90%', padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 15, fontWeight: 500, color: '#0A0A0A', margin: '0 0 6px', fontFamily: C.font }}>Test LinkedIn message</h3>
            <p style={{ fontSize: 12, color: '#6B6B6B', margin: '0 0 16px', fontFamily: C.font, lineHeight: 1.5 }}>Paste the recipient's LinkedIn profile URL. The test message will be queued and sent by the LinkedIn worker on its next run.</p>
            <input
              value={liTestUrl}
              onChange={e => setLiTestUrl(e.target.value)}
              placeholder="https://linkedin.com/in/username"
              autoFocus
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#FAFAF7', fontSize: 13, fontFamily: C.font, outline: 'none', boxSizing: 'border-box', color: '#0A0A0A' }}
            />
            {liTestSent && (
              <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(0,77,181,0.06)', border: '1px solid rgba(0,77,181,0.15)', fontSize: 12, color: '#0077B5', fontFamily: C.font }}>
                Test message sent. Check the recipient's LinkedIn inbox.
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => setLiTestOpen(false)} style={{ padding: '8px 16px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: '#6B6B6B', fontSize: 12, cursor: 'pointer', fontFamily: C.font }}>Close</button>
              {!liTestSent && (
                <button onClick={async () => {
                  if (!liTestUrl.toLowerCase().includes('linkedin.com/in/')) { alert('Please paste a valid LinkedIn profile URL (e.g. https://linkedin.com/in/username)'); return }
                  try {
                    const cur = steps[selStep] || {}
                    const senderMember = seq?.send_from_user_id ? orgMembers.find(m => m.user_id === seq.send_from_user_id) : orgMembers[0]
                    const slug = liTestUrl.trim().split('/in/')[1]?.replace(/\/$/, '') || ''
                    const nameParts = slug.split('-').filter(Boolean).slice(0, 3)
                    const recipientFirst = nameParts[0] ? nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1) : 'Test'
                    const recipientLast = nameParts[1] ? nameParts[1].charAt(0).toUpperCase() + nameParts[1].slice(1) : ''
                    const recipientFull = [recipientFirst, recipientLast].filter(Boolean).join(' ')
                    const msg = (cur.template || '').replace(/\{firstName\}/g, recipientFirst).replace(/\{lastName\}/g, recipientLast).replace(/\{companyName\}/g, seq?.name?.split(' - ')[0] || 'Company').replace(/\{category\}/g, seq?.name?.split(' - ')[1] || 'Category').slice(0, 280)
                    
                    const payload = {
                      contact_name: recipientFull || 'Test Recipient',
                      company: seq?.name?.split(' - ')[0] || 'Test',
                      linkedin_url: liTestUrl.trim(),
                      message_type: cur.action === 'invite' ? 'invite' : 'message',
                      message: '[TEST] ' + (msg || 'Test LinkedIn message'),
                      context: JSON.stringify({ test: true, sender: senderMember?.email || 'sunny@vanhawke.agency', step: selStep }),
                      status: 'pending',
                      priority: 10,
                    }
                    console.log('[LinkedIn Test] Inserting:', payload)
                    const { data, error } = await supabase.from('kiko_linkedin_queue').insert(payload).select()
                    if (error) { console.error('[LinkedIn Test] Error:', error); alert('Insert failed: ' + error.message); return }
                    console.log('[LinkedIn Test] Success:', data)
                    // Fire trigger in background — don't await (takes 30-40s, times out)
                    fetch('https://api.vanhawke.agency/api/linkedin-trigger', { method: 'POST' })
                      .then(r => r.json())
                      .then(d => console.log('[LinkedIn Test] Trigger result:', d))
                      .catch(e => console.log('[LinkedIn Test] Trigger fire-and-forget:', e.message))
                    setLiTestSent(true)
                  } catch (err) { console.error('[LinkedIn Test] Exception:', err); alert('Error: ' + err.message) }
                }} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#0077B5', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font }}>{liTestSent ? '✓ Queued — sending in ~30s' : 'Send test'}</button>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

