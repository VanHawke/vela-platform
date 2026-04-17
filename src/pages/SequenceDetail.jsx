// src/pages/SequenceDetail.jsx — Sequence builder + leads + performance
import { useState, useEffect } from 'react'
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
import { Mail, Linkedin, Plus, Clock, Trash2, Save, Sparkles, ArrowLeft, Search, UserPlus, X, ChevronRight, Eye, Reply, AlertTriangle, Send, GitBranch, Copy, MoreHorizontal, LayoutList, Workflow } from 'lucide-react'
import SequenceFlowView from '@/components/campaigns/SequenceFlowView'

const APPROACHES = ['authority-led','scarcity-led','social-proof','reciprocity','data-led','intelligence-led','competitive-led','relationship-led']
const PSYCHOLOGY = ['reciprocity','scarcity','authority','social_proof','commitment','liking','strategic_withdrawal','pattern_interrupt']
const VARS = ['{firstName}','{companyName}','{category}','{revenue}','{ceo}','{raceWindow}','{recentNews}','{prevSubject}']
const CONDITIONS = [
  { value: 'no_reply', label: 'No reply after previous step' },
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

export default function SequenceDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const isNew = id === 'new'
  const [seq, setSeq] = useState(isNew ? { name: '', target_persona: '', description: '' } : null)
  const [steps, setSteps] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [queue, setQueue] = useState([])
  const [selStep, setSelStep] = useState(0)
  const [tab, setTab] = useState('sequence')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
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
  const [activityFeed, setActivityFeed] = useState([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [bgSourcing, setBgSourcing] = useState(false)
  const [bgJobMsg, setBgJobMsg] = useState(null)
  const [leadActivity, setLeadActivity] = useState([])
  const [topPatterns, setTopPatterns] = useState([])
  const [conditions, setConditions] = useState([])
  const [showAddCondition, setShowAddCondition] = useState(false)
  const [viewMode, setViewMode] = useState('list') // 'list' or 'flow'
  const [newCondition, setNewCondition] = useState({ condition_type: 'opened', operator: 'is', value: '', reference_step: 1, true_next_step: '', false_next_step: '', wait_hours: 0 })
  const [regenPrompt, setRegenPrompt] = useState(false)
  const [refineText, setRefineText] = useState('')  // feedback input for refine-with-feedback loop
  const [refining, setRefining] = useState(false)
  const [testSending, setTestSending] = useState(false)
  const [testSent, setTestSent] = useState(false)
  const [testModalOpen, setTestModalOpen] = useState(false)
  const [testModalStep, setTestModalStep] = useState(null)
  const [testRecipientMode, setTestRecipientMode] = useState('me')
  const [orgMembers, setOrgMembers] = useState([])
  const [launching, setLaunching] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [showLaunchConfirm, setShowLaunchConfirm] = useState(false)

  useEffect(() => { if (!isNew) load() }, [id])
  useEffect(() => {
    // Load org members for send-from dropdown
    const u = supabase.auth.getUser?.() || supabase.auth.getSession?.()
    Promise.resolve(u).then(async (r) => {
      const userId = r?.data?.user?.id || r?.data?.session?.user?.id
      if (!userId) return
      try {
        const res = await fetch(`/api/team-list?user_id=${userId}`)
        if (res.ok) { const d = await res.json(); setOrgMembers(d.members || []) }
      } catch {}
    })
  }, [])

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
        const r = await fetch(`/api/sequence-conditions?sequence_id=${id}`)
        const j = await r.json()
        if (!cancelled && Array.isArray(j.conditions)) setConditions(j.conditions)
      } catch {}
    })()
    return () => { cancelled = true }
  }, [id, isNew])

  async function addCondition() {
    try {
      const r = await fetch('/api/sequence-conditions', {
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
      await fetch(`/api/sequence-conditions?id=${condId}`, { method: 'DELETE' })
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
      const { data } = await supabase.from('kiko_sequences').insert({ name: seq.name || 'New Campaign', description: seq.description, target_persona: seq.target_persona, steps, is_active: false, send_from_user_id: seq.send_from_user_id || null }).select().single()
      if (data) nav(`/sequences/${data.id}`, { replace: true })
    } else {
      await supabase.from('kiko_sequences').update({ name: seq.name, description: seq.description, target_persona: seq.target_persona, steps, send_from_user_id: seq.send_from_user_id || null, updated_at: new Date().toISOString() }).eq('id', id)
    }
    setSaving(false); setDirty(false)
  }

  async function launchCampaign() {
    setLaunching(true)
    try {
      // Call the proper /api/activate-campaign endpoint that runs sanity checks
      // (no placeholder steps, all targets verified, no moved/left contacts)
      // before flipping the sequence + enrollments live.
      const res = await fetch('/api/activate-campaign', {
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
      const res = await fetch('/api/verify-campaign-targets', {
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
      const res = await fetch('/api/enrich-campaign-sponsorship', {
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
      const r = await fetch('/api/clone-campaign', {
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
    nav('/sequences')
  }

  function addStep(ch) {
    const emailTemplate = 'Dear {firstName},\n\n\n\nKind regards,\n\n{signature}'
    const linkedinTemplate = 'Hi {firstName}, '
    if (ch === 'condition') {
      setSteps([...steps, { step: steps.length + 1, type: 'condition', delay_days: steps.length === 0 ? 0 : 3, condition_type: 'no_reply', condition_params: {}, yes_steps: [{ channel: 'linkedin', action: 'invite', template: linkedinTemplate, approach: 'authority-led', psychology: 'liking' }], no_steps: [{ channel: 'email', subject: 'Haas F1 Team x {category}', template: emailTemplate, approach: 'authority-led', psychology: 'reciprocity' }] }])
    } else {
      setSteps([...steps, { step: steps.length + 1, delay_days: steps.length === 0 ? 0 : 3, channel: ch, approach: 'authority-led', psychology: 'reciprocity', subject: ch === 'email' ? 'Haas F1 Team x {category}' : '', template: ch === 'email' ? emailTemplate : linkedinTemplate }])
    }
    setSelStep(steps.length); setDirty(true)
  }
  function upd(i, k, v) { const u = [...steps]; u[i] = { ...u[i], [k]: v }; setSteps(u); setDirty(true) }
  function updAndRegen(i, k, v) { upd(i, k, v); setRegenPrompt(true) }
  function del(i) { setSteps(steps.filter((_, j) => j !== i).map((s, j) => ({ ...s, step: j + 1 }))); if (selStep >= steps.length - 1) setSelStep(Math.max(0, steps.length - 2)); setDirty(true) }

  async function askKiko(i) {
    const s = steps[i]; if (!s) return; upd(i, 'template', '⏳ Kiko is writing...')
    try {
      const r = await fetch('/api/kiko', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Write a ${s.channel === 'email' ? 'outreach email' : '300-char LinkedIn message'} for step ${s.step} of a sequence.\n\nSTYLE RULES (non-negotiable):\n- ${s.channel === 'email' ? 'Start with "Dear {firstName}," and end with "Kind regards,\\n\\n{signature}"' : 'Start with "Hi {firstName},"'}\n- Write at principal/board level. No generic filler. No "I hope this finds you well".\n- Tone: "We work at principal level on the structuring of Formula One partnerships for teams and rights-holders."\n- Category-specific: explain WHY this category matters operationally for Formula One.\n- Soft CTA: "The relevant question at this stage is simply whether this is strategic from your perspective."\n- Subject format uses x not special characters (e.g. "Haas F1 Team x Cloud Infrastructure")\n- 50-125 words for emails. 300 chars max for LinkedIn.\n\nContext: Approach: ${s.approach}. Psychology: ${s.psychology}. Target: ${seq?.target_persona || 'C-suite'}. Subject: ${s.subject || 'F1 partnership'}.\n\nReturn ONLY the message text, nothing else.`,
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
      const r = await fetch('/api/kiko', {
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
    const r = await fetch('/api/gmail-draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: recipient, subject, body, send: true, contactStatus: 'cold' }) })
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
        const r = await fetch('/api/build-campaign', {
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
        alert(`No leads found for ${category}. Try clicking "Add from CRM" or "Manual add".`)
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
      const res = await fetch(`/api/kiko-jobs?user_id=${userId}`, {
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
  const tabs = [{ id: 'sequence', label: 'Sequence' }, { id: 'leads', label: 'Leads', ct: enrollments.length }, { id: 'activity', label: 'Activity' }, { id: 'performance', label: 'Performance' }]
  const inputStyle = { width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#FAFAF7', color: C.text, fontSize: 13, fontFamily: C.font, outline: 'none', boxSizing: 'border-box' }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PageHeader
        eyebrowCategory="OUTREACH"
        eyebrowSuffix="Sequence detail"
        title={seq?.name || 'New sequence'}
      />
      <div style={{ padding: '8px 28px 60px', fontFamily: C.font, color: C.text, maxWidth: 1300, margin: '0 auto', overflowY: 'auto', flex: 1 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <button onClick={() => nav('/sequences')} style={{ background: 'none', border: 'none', color: C.textSec, cursor: 'pointer', padding: 4 }}><ArrowLeft size={18} /></button>
        <input value={seq?.name || ''} onChange={e => { setSeq({ ...seq, name: e.target.value }); setDirty(true) }} placeholder="Campaign name..." style={{ fontSize: 22, fontWeight: 300, background: 'none', border: 'none', color: C.text, fontFamily: C.fontDisplay, outline: 'none', flex: 1 }} />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {dirty && <span style={{ fontSize: 11, color: C.amber }}>Unsaved</span>}
          {!isNew && <button onClick={duplicateCampaign} title="Duplicate campaign" style={{ padding: '7px 8px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.textTer, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Copy size={12} /></button>}
          {!isNew && <button onClick={deleteCampaign} title="Delete campaign" style={{ padding: '7px 8px', borderRadius: 6, border: '1px solid rgba(184,100,62,0.15)', background: 'transparent', color: C.red, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Trash2 size={12} /></button>}
          <button onClick={save} disabled={saving} style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.06)', color: C.purple, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font, opacity: saving ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 5, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}><Save size={12} />{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
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
                  background: (i === 0 && tab === 'sequence') || (i === 1 && tab === 'leads') ? 'rgba(0,0,0,0.08)' : 'transparent',
                  color: (i === 0 && tab === 'sequence') || (i === 1 && tab === 'leads') ? C.purple : C.textTer,
                  border: `1px solid ${(i === 0 && tab === 'sequence') || (i === 1 && tab === 'leads') ? 'rgba(0,0,0,0.10)' : C.border}`
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
      <div style={{ display: 'flex', gap: 2, marginBottom: 14, background: '#F5F4F1', borderRadius: 10, padding: 3, width: 'fit-content' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setSelectedLead(null) }} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: C.font, fontSize: 12, background: tab === t.id ? '#FFFFFF' : 'transparent', color: tab === t.id ? C.text : C.textSec, fontWeight: tab === t.id ? 500 : 400, display: 'flex', alignItems: 'center', gap: 5, boxShadow: tab === t.id ? '0 1px 2px rgba(0,0,0,0.04)' : 'none', transition: 'all 0.15s' }}>
            {t.label}{t.ct !== undefined && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: tab === t.id ? '#F5F4F1' : 'rgba(0,0,0,0.04)', color: C.textSec }}>{t.ct}</span>}
          </button>
        ))}
      </div>

      {/* ═══ SEQUENCE TAB ═══ */}
      {tab === 'sequence' && (
        <>
        {/* View mode toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <button onClick={() => setViewMode('list')} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.08)', background: viewMode === 'list' ? '#0A0A0A' : 'transparent', color: viewMode === 'list' ? '#fff' : '#6B6B6B', fontSize: 11, cursor: 'pointer', fontFamily: C.font }}><LayoutList size={12} /> List</button>
          <button onClick={() => setViewMode('flow')} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.08)', background: viewMode === 'flow' ? '#0A0A0A' : 'transparent', color: viewMode === 'flow' ? '#fff' : '#6B6B6B', fontSize: 11, cursor: 'pointer', fontFamily: C.font }}><Workflow size={12} /> Flow</button>
        </div>

        {viewMode === 'flow' ? (
          <div style={{ ...glass, padding: 16, minHeight: 480 }}>
            <SequenceFlowView steps={steps} conditions={conditions} selectedStep={selStep} onSelectStep={(i) => { setSelStep(i); setViewMode('list') }} onAddStep={(type) => { addStep(type); setViewMode('list') }} onReorder={(reordered) => { setSteps(reordered); setDirty(true) }} onDeleteStep={(i) => { del(i) }} />
          </div>
        ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 14, minHeight: 480 }}>
          <div style={{ ...glass, padding: 14, overflowY: 'auto' }}>
            <div style={{ textAlign: 'center', padding: '6px 0 12px', fontSize: 11, color: C.textTer, borderBottom: `1px solid ${C.border}`, marginBottom: 8 }}>
              {steps.length > 0 ? `${steps.length} steps · ${steps.reduce((s, st) => s + (st.delay_days || 0), 0)} days` : 'Sequence start'}
            </div>
            {steps.map((s, i) => {
              const isLI = s.channel === 'linkedin'
              const sel = i === selStep
              return (<div key={i}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 0' }}><div style={{ width: 1, height: 12, background: C.border }} /></div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 3 }}>
                  <Clock size={9} style={{ color: C.textTer }} />
                  <select value={s.delay_days} onChange={e => upd(i, 'delay_days', +e.target.value)} style={{ background: 'transparent', border: 'none', color: C.amber, fontSize: 10, fontFamily: C.font, cursor: 'pointer', outline: 'none' }}>
                    <option value={0} style={{ background: '#FFFFFF' }}>Immediately</option>
                    {[1, 2, 3, 4, 5, 7, 10, 14].map(d => <option key={d} value={d} style={{ background: '#FFFFFF' }}>Wait {d}d</option>)}
                  </select>
                </div>
                <div onClick={() => setSelStep(i)} style={{ ...glass, padding: '8px 10px', cursor: 'pointer', borderColor: sel ? C.purple : C.border, background: sel ? 'rgba(0,0,0,0.03)' : glass.background, transition: 'all 0.15s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, background: s.type === 'condition' ? 'rgba(184,156,92,0.10)' : isLI ? 'rgba(0,119,181,0.12)' : 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {s.type === 'condition' ? <GitBranch size={10} style={{ color: C.amber }} /> : isLI ? <Linkedin size={10} style={{ color: '#0077B5' }} /> : <Mail size={10} style={{ color: C.purple }} />}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 500, flex: 1 }}>{s.type === 'condition' ? 'Condition' : isLI ? 'LinkedIn' : 'Email'} {i + 1}</span>
                    <button onClick={e => { e.stopPropagation(); del(i) }} style={{ background: 'none', border: 'none', color: C.textTer, cursor: 'pointer', padding: 1 }}><Trash2 size={10} /></button>
                  </div>
                  {s.subject && <div style={{ fontSize: 10, color: C.textTer, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.subject}</div>}
                  {s.type === 'condition' && (() => {
                    const condLabel = CONDITIONS.find(c => c.value === s.condition_type)?.label || s.condition_type
                    const yesStep = s.yes_steps?.[0]
                    const noStep = s.no_steps?.[0]
                    const yesIcon = yesStep?.channel === 'linkedin' ? '💼' : yesStep?.channel === 'email' ? '📧' : '→'
                    const noIcon = noStep?.channel === 'linkedin' ? '💼' : noStep?.channel === 'email' ? '📧' : '→'
                    return (
                      <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ fontSize: 10, color: C.amber, fontWeight: 500 }}>If: {condLabel}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 8, fontSize: 10 }}>
                          <span style={{ color: C.teal, fontWeight: 500 }}>✓ YES</span>
                          <span style={{ color: C.textTer }}>→</span>
                          <span style={{ color: C.text }}>{yesIcon} {yesStep?.subject || yesStep?.channel || 'next step'}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 8, fontSize: 10 }}>
                          <span style={{ color: C.red, fontWeight: 500 }}>✗ NO</span>
                          <span style={{ color: C.textTer }}>→</span>
                          <span style={{ color: C.text }}>{noIcon} {noStep?.subject || noStep?.channel || 'pause'}</span>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>)
            })}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
              <button onClick={() => addStep('email')} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '5px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.textSec, fontSize: 10, cursor: 'pointer', fontFamily: C.font }}><Plus size={10} />Email</button>
              <button onClick={() => addStep('linkedin')} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '5px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.textSec, fontSize: 10, cursor: 'pointer', fontFamily: C.font }}><Plus size={10} />LinkedIn</button>
              <button onClick={() => addStep('condition')} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '5px 10px', borderRadius: 6, border: `1px solid rgba(184,156,92,0.2)`, background: 'rgba(184,156,92,0.06)', color: C.amber, fontSize: 10, cursor: 'pointer', fontFamily: C.font }}><GitBranch size={10} />Condition</button>
            </div>
          </div>
          <div style={{ ...glass, padding: 18 }}>
            {cur ? (
              <>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {cur.type === 'condition' ? <GitBranch size={14} style={{ color: C.amber }} /> : cur.channel === 'linkedin' ? <Linkedin size={14} style={{ color: '#0077B5' }} /> : <Mail size={14} style={{ color: C.purple }} />}
                  Step {selStep + 1} · {cur.type === 'condition' ? 'Condition (branch)' : cur.channel === 'email' ? 'Email' : 'LinkedIn message'}
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
                {/* ═══ EMAIL / LINKEDIN STEP EDITOR ═══ */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                  {[{ id: 'email', icon: Mail, c: C.purple }, { id: 'linkedin', icon: Linkedin, c: '#0077B5' }].map(ch => (
                    <button key={ch.id} onClick={() => upd(selStep, 'channel', ch.id)} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${cur.channel === ch.id ? ch.c : C.border}`, background: cur.channel === ch.id ? `${ch.c}10` : 'transparent', color: cur.channel === ch.id ? ch.c : C.textTer, fontSize: 11, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 4 }}><ch.icon size={11} />{ch.id}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <div style={{ flex: 1 }}><label style={{ fontSize: 10, color: C.textTer, marginBottom: 2, display: 'block' }}>Approach</label>
                    <select value={cur.approach || ''} onChange={e => updAndRegen(selStep, 'approach', e.target.value)} style={{ ...inputStyle, padding: '5px 6px', fontSize: 11 }}>{APPROACHES.map(a => <option key={a} value={a} style={{ background: '#FFFFFF' }}>{a}</option>)}</select></div>
                  <div style={{ flex: 1 }}><label style={{ fontSize: 10, color: C.textTer, marginBottom: 2, display: 'block' }}>Psychology</label>
                    <select value={cur.psychology || ''} onChange={e => updAndRegen(selStep, 'psychology', e.target.value)} style={{ ...inputStyle, padding: '5px 6px', fontSize: 11 }}>{PSYCHOLOGY.map(p => <option key={p} value={p} style={{ background: '#FFFFFF' }}>{p.replace(/_/g, ' ')}</option>)}</select></div>
                </div>
                {cur.channel === 'email' && <div style={{ marginBottom: 12 }}><label style={{ fontSize: 10, color: C.textTer, marginBottom: 2, display: 'block' }}>Subject</label>
                  <input value={cur.subject || ''} onChange={e => upd(selStep, 'subject', e.target.value)} placeholder="Haas F1 Team x {category}" style={inputStyle} /></div>}

                {/* A/B Variants UI removed 2026-04-11 — Sunny doesn't need A/B testing
                    until campaign volume justifies it (~500+ sends per campaign). One
                    well-crafted email per step is better than three mediocre A/B tested ones. */}
                {regenPrompt && <div style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(184,156,92,0.06)', border: '1px solid rgba(184,156,92,0.12)', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: C.amber }}>Approach changed — regenerate content?</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => { askKiko(selStep); setRegenPrompt(false) }} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.06)', color: C.purple, fontSize: 10, cursor: 'pointer', fontFamily: C.font }}>Regenerate</button>
                    <button onClick={() => setRegenPrompt(false)} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.textTer, fontSize: 10, cursor: 'pointer', fontFamily: C.font }}>Keep</button>
                  </div>
                </div>}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <label style={{ fontSize: 10, color: C.textTer }}>{cur.channel === 'email' ? 'Email body' : 'Message'}</label>
                    <span style={{ fontSize: 10, color: (() => {
                      if (cur.channel === 'linkedin') return (cur.template || '').length > 280 ? C.red : C.textTer
                      const words = (cur.template || '').trim().split(/\s+/).filter(Boolean).length
                      return words < 50 ? C.amber : words > 125 ? C.red : C.teal
                    })() }}>
                      {cur.channel === 'linkedin'
                        ? `${(cur.template || '').length} / 300 chars`
                        : `${(cur.template || '').trim().split(/\s+/).filter(Boolean).length} words (target: 50-125)`}
                    </span>
                  </div>
                  <textarea value={cur.template || ''} onChange={e => upd(selStep, 'template', e.target.value)} rows={cur.channel === 'email' ? 10 : 3} maxLength={cur.channel === 'linkedin' ? 300 : undefined} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6, padding: '8px 10px' }} />
                </div>
                <div style={{ marginBottom: 12 }}><div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  {VARS.map(v => <button key={v} onClick={() => upd(selStep, 'template', (cur.template || '') + v)} style={{ padding: '2px 6px', borderRadius: 3, border: `1px solid ${C.border}`, background: 'transparent', color: C.purple, fontSize: 9, cursor: 'pointer', fontFamily: C.font }}>{v}</button>)}
                </div></div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => askKiko(selStep)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 6, border: `1px solid rgba(0,0,0,0.08)`, background: 'rgba(0,0,0,0.03)', color: C.purple, fontSize: 11, cursor: 'pointer', fontFamily: C.font, flex: 1, justifyContent: 'center' }}><Sparkles size={12} />Ask Kiko to write this step</button>
                  {cur.channel === 'email' && <button onClick={() => { setTestModalStep(selStep); setTestModalOpen(true) }} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 6, border: `1px solid ${testSent ? 'rgba(0,0,0,0.10)' : C.border}`, background: testSent ? 'rgba(0,0,0,0.03)' : 'transparent', color: testSent ? C.teal : C.textSec, fontSize: 11, cursor: 'pointer', fontFamily: C.font, whiteSpace: 'nowrap' }}>{testSent ? '✓ Test sent' : '📧 Send test'}</button>}
                </div>

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

                {/* ═══ TRIGGER CONDITIONS — only for non-condition steps ═══ */}
                {cur.type !== 'condition' && !isNew && (
                  <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.amber }} />
                        <span style={{ fontSize: 12, fontWeight: 500, color: C.text }}>Triggers</span>
                        <span style={{ fontSize: 9, color: C.textTer }}>· evaluated before this step sends</span>
                      </div>
                      <button onClick={() => setShowAddCondition(true)} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.03)', color: C.purple, fontSize: 10, cursor: 'pointer', fontFamily: C.font }}>+ Add trigger</button>
                    </div>

                    {conditions.filter(c => c.step_number === selStep + 1).length === 0 && !showAddCondition && (
                      <div style={{ fontSize: 10, color: C.textTer, padding: '8px 0', fontStyle: 'italic' }}>No triggers — this step always sends on schedule. Add a trigger to make it conditional (e.g. only send if previous step was opened).</div>
                    )}

                    {conditions.filter(c => c.step_number === selStep + 1).map(cond => (
                      <div key={cond.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginBottom: 6, borderRadius: 6, background: 'rgba(184,156,92,0.06)', border: `1px solid rgba(184,156,92,0.10)`, fontSize: 11 }}>
                        <span style={{ color: C.amber, fontWeight: 500 }}>IF</span>
                        <span style={{ color: C.text }}>{cond.condition_type.replace(/_/g, ' ')}</span>
                        {cond.reference_step && <span style={{ color: C.textTer }}>step {cond.reference_step}</span>}
                        {cond.value && <span style={{ color: C.textSec }}>= {cond.value}</span>}
                        {cond.true_next_step && <><span style={{ color: C.textTer }}>→ TRUE: jump to step</span><span style={{ color: C.teal, fontWeight: 500 }}>{cond.true_next_step}</span></>}
                        {cond.false_next_step && <><span style={{ color: C.textTer }}>· FALSE: jump to step</span><span style={{ color: C.red, fontWeight: 500 }}>{cond.false_next_step}</span></>}
                        {cond.wait_hours > 0 && <span style={{ color: C.textTer }}>· wait {cond.wait_hours}h</span>}
                        <button onClick={() => deleteCondition(cond.id)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: C.textTer, cursor: 'pointer', fontSize: 12, padding: 2 }}>×</button>
                      </div>
                    ))}

                    {showAddCondition && (
                      <div style={{ padding: 12, marginTop: 6, borderRadius: 6, background: 'rgba(0,0,0,0.03)', border: `1px solid ${C.border}` }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                          <div>
                            <div style={{ fontSize: 9, color: C.textTer, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>If</div>
                            <select value={newCondition.condition_type} onChange={e => setNewCondition({ ...newCondition, condition_type: e.target.value })} style={{ ...inputStyle, fontSize: 11, padding: '6px 8px' }}>
                              <option value="opened" style={{ background: '#FFFFFF' }}>opened</option>
                              <option value="not_opened" style={{ background: '#FFFFFF' }}>not opened</option>
                              <option value="clicked" style={{ background: '#FFFFFF' }}>clicked</option>
                              <option value="not_clicked" style={{ background: '#FFFFFF' }}>not clicked</option>
                              <option value="replied" style={{ background: '#FFFFFF' }}>replied</option>
                              <option value="not_replied" style={{ background: '#FFFFFF' }}>not replied</option>
                              <option value="days_since_last_action" style={{ background: '#FFFFFF' }}>days since last action</option>
                              <option value="company_attribute" style={{ background: '#FFFFFF' }}>company attribute</option>
                              <option value="has_meeting" style={{ background: '#FFFFFF' }}>has meeting booked</option>
                            </select>
                          </div>
                          <div>
                            <div style={{ fontSize: 9, color: C.textTer, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Reference step</div>
                            <input type="number" min="1" max={steps.length} value={newCondition.reference_step} onChange={e => setNewCondition({ ...newCondition, reference_step: parseInt(e.target.value) || 1 })} style={{ ...inputStyle, fontSize: 11, padding: '6px 8px' }} />
                          </div>
                        </div>
                        {(newCondition.condition_type === 'days_since_last_action' || newCondition.condition_type === 'company_attribute') && (
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 9, color: C.textTer, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Value</div>
                            <input value={newCondition.value} onChange={e => setNewCondition({ ...newCondition, value: e.target.value })} placeholder={newCondition.condition_type === 'days_since_last_action' ? 'e.g. 3' : 'e.g. industry:fintech'} style={{ ...inputStyle, fontSize: 11, padding: '6px 8px' }} />
                          </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                          <div>
                            <div style={{ fontSize: 9, color: C.teal, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>If TRUE → step</div>
                            <input type="number" min="1" max={steps.length} value={newCondition.true_next_step} onChange={e => setNewCondition({ ...newCondition, true_next_step: e.target.value })} placeholder="next" style={{ ...inputStyle, fontSize: 11, padding: '6px 8px' }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 9, color: C.red, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>If FALSE → step</div>
                            <input type="number" min="1" max={steps.length} value={newCondition.false_next_step} onChange={e => setNewCondition({ ...newCondition, false_next_step: e.target.value })} placeholder="pause" style={{ ...inputStyle, fontSize: 11, padding: '6px 8px' }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 9, color: C.textTer, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Wait (hrs)</div>
                            <input type="number" min="0" value={newCondition.wait_hours} onChange={e => setNewCondition({ ...newCondition, wait_hours: parseInt(e.target.value) || 0 })} style={{ ...inputStyle, fontSize: 11, padding: '6px 8px' }} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button onClick={() => setShowAddCondition(false)} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.textSec, fontSize: 11, cursor: 'pointer', fontFamily: C.font }}>Cancel</button>
                          <button onClick={addCondition} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.06)', color: C.purple, fontSize: 11, cursor: 'pointer', fontFamily: C.font }}>Save trigger</button>
                        </div>
                      </div>
                    )}
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
                  <button onClick={() => addStep('linkedin')} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(0,119,181,0.15)', background: 'rgba(0,119,181,0.04)', color: '#0077B5', fontSize: 11, cursor: 'pointer', fontFamily: C.font }}>+ LinkedIn</button>
                  <button onClick={() => addStep('condition')} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(184,156,92,0.15)', background: 'rgba(184,156,92,0.06)', color: C.amber, fontSize: 11, cursor: 'pointer', fontFamily: C.font }}>+ Condition</button>
                </div>
              </div>
            )}
          </div>
        </div>
        )} {/* end viewMode ternary */}
        {/* Continue to Leads button (draft flow) */}
        {isDraft && steps.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button onClick={() => { if (dirty) save(); setTab('leads') }} style={{ padding: '10px 24px', borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.06)', color: C.purple, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: C.font, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: 6 }}>
              Continue to Leads <ChevronRight size={14} />
            </button>
          </div>
        )}
      </>)}

      {/* ═══ LEADS TAB ═══ */}
      {tab === 'leads' && (
        <>
        <div style={{ display: 'flex', gap: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...glass, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>Leads</span>
                  {enrollments.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, fontSize: 10, color: C.textTer }}>
                      <span>{enrollments.length} enrolled</span>
                      <span style={{ color: C.teal }}>{enrollments.filter(e => e.status === 'active').length} active</span>
                      <span style={{ color: C.teal }}>{enrollments.filter(e => e.status === 'replied').length} replied</span>
                      <span style={{ color: C.red }}>{enrollments.filter(e => e.status === 'bounced').length} bounced</span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={autoSuggestLeads} disabled={loadingSuggestions} style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.cardHover, color: C.teal, fontSize: 11, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 4 }}><Sparkles size={12} />{loadingSuggestions ? 'Finding...' : 'Kiko, find leads'}</button>
                  <button onClick={queueBackgroundSource} disabled={bgSourcing} style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid rgba(0,0,0,0.10)`, background: 'rgba(0,0,0,0.04)', color: C.purple, fontSize: 11, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 4 }} title="Queues a background job. Kiko sources contacts via Sonnet+web search while you do other work.">⚡{bgSourcing ? 'Queueing…' : 'Source in background'}</button>
                  <button onClick={() => setShowManualAdd(true)} style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.cardHover, color: C.purple, fontSize: 11, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={12} />Manual add</button>
                  <button onClick={() => setShowAddLeads(true)} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.06)', color: C.purple, fontSize: 11, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 4 }}><UserPlus size={12} />Add from CRM</button>
                </div>
              </div>
              {bgJobMsg && (
                <div style={{ padding: '8px 16px', borderBottom: `1px solid ${C.border}`, background: bgJobMsg.startsWith('✅') ? 'rgba(0,0,0,0.03)' : 'rgba(184,100,62,0.04)', fontSize: 11, color: bgJobMsg.startsWith('✅') ? C.purple : C.red }}>
                  {bgJobMsg}
                </div>
              )}
              {suggestions.length > 0 && (
                <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.02)' }}>
                  <div style={{ fontSize: 11, color: C.teal, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}><Sparkles size={11} />Kiko found {suggestions.length} potential leads</div>
                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    {suggestions.map(s => {
                      const checked = selectedLeads.some(l => l.id === s.id)
                      return (
                        <div key={s.id} onClick={() => checked ? setSelectedLeads(selectedLeads.filter(l => l.id !== s.id)) : setSelectedLeads([...selectedLeads, s])} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', cursor: 'pointer', borderRadius: 6, background: checked ? 'rgba(0,0,0,0.02)' : 'transparent' }}>
                          <div style={{ width: 14, height: 14, borderRadius: 3, border: `1px solid ${checked ? C.purple : C.border}`, background: checked ? C.purple : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{checked && <span style={{ color: '#111', fontSize: 9 }}>✓</span>}</div>
                          <span style={{ fontSize: 11, color: C.text, minWidth: 100 }}>{s.name}</span>
                          <span style={{ fontSize: 10, color: C.textTer, flex: 1 }}>{s.company} · {s.title || '—'}</span>
                          <span style={{ fontSize: 10, color: C.textTer }}>{s.email}</span>
                        </div>
                      )
                    })}
                  </div>
                  {selectedLeads.length > 0 && <button onClick={enrollSelected} style={{ marginTop: 8, padding: '6px 14px', borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.06)', color: C.purple, fontSize: 11, cursor: 'pointer', fontFamily: C.font }}>Enroll {selectedLeads.length} contact{selectedLeads.length > 1 ? 's' : ''}</button>}
                </div>
              )}
              {enrollments.length ? (<div>
                <div style={{ display: 'flex', padding: '8px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 10, color: C.textTer, fontWeight: 500 }}>
                  <span style={{ flex: 1 }}>Name</span><span style={{ width: 120 }}>Company</span><span style={{ width: 80, textAlign: 'center' }}>Step</span><span style={{ width: 70, textAlign: 'center' }}>Status</span><span style={{ width: 70, textAlign: 'right' }}>Next</span><span style={{ width: 100 }}></span>
                </div>
                {enrollments.map(e => {
                  const isSelected = selectedLead?.id === e.id
                  return (
                    <div key={e.id} onClick={() => selectLeadForTimeline(e)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s', background: isSelected ? 'rgba(0,0,0,0.03)' : 'transparent' }}
                      onMouseEnter={ev => { if (!isSelected) ev.currentTarget.style.background = 'rgba(0,0,0,0.02)' }}
                      onMouseLeave={ev => { if (!isSelected) ev.currentTarget.style.background = 'transparent' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: e.status === 'active' ? C.teal : e.status === 'replied' ? C.teal : e.status === 'bounced' ? C.red : C.textTer }} />
                      <div style={{ flex: 1, minWidth: 0 }}><div style={{ color: C.text }}>{e.contact_name || e.contact_email}</div><div style={{ fontSize: 10, color: C.textTer }}>{e.company}</div></div>
                      <div style={{ width: 70, textAlign: 'center' }}><div style={{ fontSize: 11, color: C.textSec }}>Step {e.current_step}/{steps.length}</div>
                        <div style={{ height: 3, background: C.cardHover, borderRadius: 2, marginTop: 3 }}><div style={{ height: '100%', borderRadius: 2, background: e.status === 'active' ? C.teal : C.teal, width: `${(e.current_step / Math.max(steps.length, 1)) * 100}%` }} /></div></div>
                      <span style={{ fontSize: 10, color: C.textTer, width: 50, textTransform: 'capitalize' }}>{e.status}</span>
                      <span style={{ fontSize: 10, color: C.textTer, width: 50 }}>{e.next_send_at ? new Date(e.next_send_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</span>
                      {e.status === 'active' && <button onClick={(ev) => { ev.stopPropagation(); pauseEnr(e.id) }} style={{ padding: '3px 6px', borderRadius: 3, border: `1px solid ${C.border}`, background: 'transparent', color: C.textSec, fontSize: 9, cursor: 'pointer' }}>Pause</button>}
                      {(e.status === 'active' || e.status === 'paused') && <button onClick={(ev) => { ev.stopPropagation(); cancelEnr(e.id) }} style={{ padding: '3px 6px', borderRadius: 3, border: '1px solid rgba(184,100,62,0.2)', background: 'transparent', color: C.red, fontSize: 9, cursor: 'pointer' }}>Cancel</button>}
                      <ChevronRight size={12} style={{ color: C.textMut, flexShrink: 0 }} />
                    </div>
                  )
                })}
              </div>) : <div style={{ padding: 40, textAlign: 'center', color: C.textTer, fontSize: 12, fontWeight: 300 }}>No leads enrolled. Click "Kiko, find leads", "Manual add", or "Add from CRM".</div>}
            </div>
          </div>
          {selectedLead && (
            <div style={{ width: 340, borderLeft: `1px solid ${C.border}`, marginLeft: -1, flexShrink: 0, background: 'rgba(17,17,17,0.5)' }}>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{selectedLead.contact_name}</div>
                  <div style={{ fontSize: 11, color: C.textTer, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedLead.contact_email}{selectedLead.company ? ` · ${selectedLead.company}` : ''}</div></div>
                <button onClick={() => setSelectedLead(null)} style={{ width: 28, height: 28, borderRadius: 6, background: C.cardHover, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textTer }}><X size={14} /></button>
              </div>
              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 12, fontSize: 11 }}>
                <span style={{ color: C.textSec }}>Status: <span style={{ color: selectedLead.status === 'replied' ? C.teal : selectedLead.status === 'bounced' ? C.red : C.teal, textTransform: 'capitalize' }}>{selectedLead.status}</span></span>
                <span style={{ color: C.textTer }}>Step {selectedLead.current_step}/{steps.length}</span>
              </div>
              <div style={{ padding: '12px 16px', overflowY: 'auto', maxHeight: 'calc(100vh - 260px)' }}>
                <div style={{ fontSize: 10, fontWeight: 500, color: C.textTer, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Activity Timeline</div>
                {leadActivity.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: C.textTer, fontSize: 12, fontWeight: 300 }}>No activity recorded yet</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative', paddingLeft: 18 }}>
                    <div style={{ position: 'absolute', left: 5, top: 6, bottom: 6, width: 1, background: C.border }} />
                    {leadActivity.map((a, i) => {
                      const isSent = a.status === 'sent'; const isFailed = a.status === 'failed'; const isQueued = a.status === 'queued'
                      return (
                        <div key={a.id || i} style={{ display: 'flex', gap: 10, padding: '8px 0', position: 'relative' }}>
                          <div style={{ position: 'absolute', left: -15, top: 12, width: 8, height: 8, borderRadius: '50%', background: '#FFFFFF', border: `2px solid ${isSent ? 'rgba(0,0,0,0.35)' : isFailed ? 'rgba(184,100,62,0.5)' : '#A0A0A0'}`, zIndex: 1 }} />
                          <div style={{ flex: 1, background: C.cardHover, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              {isSent ? <Send size={11} style={{ color: C.teal }} /> : isFailed ? <AlertTriangle size={11} style={{ color: C.red }} /> : <Clock size={11} style={{ color: C.textTer }} />}
                              <span style={{ fontSize: 11, fontWeight: 500, color: C.textSec, textTransform: 'capitalize' }}>{a.channel || 'email'} · Step {a.step_number} · {isSent ? 'Sent' : isFailed ? 'Failed' : isQueued ? 'Queued' : a.status}</span>
                            </div>
                            {a.subject && <div style={{ fontSize: 11, color: C.textTer, marginBottom: 2 }}>{a.subject}</div>}
                            {(a.opens_count > 0 || a.clicks_count > 0) && (
                              <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                                {a.opens_count > 0 && (
                                  <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 10, background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.18)', color: C.blue }}>
                                    👁 Opened {a.opens_count > 1 ? `×${a.opens_count}` : ''}
                                  </span>
                                )}
                                {a.clicks_count > 0 && (
                                  <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 10, background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)', color: C.purple }}>
                                    🔗 Clicked {a.clicks_count > 1 ? `×${a.clicks_count}` : ''}
                                  </span>
                                )}
                              </div>
                            )}
                            <div style={{ fontSize: 10, color: C.textMut, marginTop: 4 }}>{a.sent_at ? new Date(a.sent_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : a.scheduled_for ? `Scheduled: ${new Date(a.scheduled_for).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}</div>
                          </div>
                        </div>
                      )
                    })}
                    <div style={{ display: 'flex', gap: 10, padding: '8px 0', position: 'relative' }}>
                      <div style={{ position: 'absolute', left: -15, top: 12, width: 8, height: 8, borderRadius: '50%', background: '#FFFFFF', border: `2px solid rgba(0,0,0,0.18)`, zIndex: 1 }} />
                      <div style={{ flex: 1, background: C.cardHover, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><UserPlus size={11} style={{ color: C.purple }} /><span style={{ fontSize: 11, fontWeight: 500, color: C.textSec }}>Enrolled</span></div>
                        <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>{selectedLead.created_at ? new Date(selectedLead.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {/* Launch Campaign button (draft flow) */}
        {isDraft && enrollments.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, gap: 10 }}>
            <button onClick={() => setTab('sequence')} style={{ padding: '10px 20px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.textSec, fontSize: 13, cursor: 'pointer', fontFamily: C.font }}>
              ← Back to Sequence
            </button>
            <button onClick={verifyTargets} disabled={verifying} style={{ padding: '10px 20px', borderRadius: 6, border: `1px solid ${C.border}`, background: verifying ? 'rgba(0,0,0,0.03)' : 'rgba(0,0,0,0.06)', color: '#0A0A0A', fontSize: 13, fontWeight: 500, cursor: verifying ? 'wait' : 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 6, opacity: verifying ? 0.6 : 1 }}>
              {verifying ? '⏳ Verifying targets...' : '🔍 Verify all targets'}
            </button>
            <button onClick={enrichSponsorship} disabled={enriching} style={{ padding: '10px 20px', borderRadius: 6, border: `1px solid ${C.border}`, background: enriching ? 'rgba(184,156,92,0.06)' : 'rgba(184,156,92,0.10)', color: '#B89C5C', fontSize: 13, fontWeight: 500, cursor: enriching ? 'wait' : 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 6, opacity: enriching ? 0.6 : 1 }}>
              {enriching ? '⏳ Researching sponsorships...' : '🏎 Enrich sponsorship history'}
            </button>
            <button onClick={() => setShowLaunchConfirm(true)} disabled={launching} style={{ padding: '10px 28px', borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.08)', color: C.teal, fontSize: 13, fontWeight: 600, cursor: launching ? 'wait' : 'pointer', fontFamily: C.font, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: 6, opacity: launching ? 0.6 : 1 }}>
              {launching ? '⏳ Activating...' : '🚀 Activate Campaign'}
            </button>
          </div>
        )}
      </>)}

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
      </div>
    </div>
  )
}

