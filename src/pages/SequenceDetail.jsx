// src/pages/SequenceDetail.jsx — Sequence builder + leads + performance
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { setPageContext } from '@/lib/pageContext'
import T, { glass } from '@/lib/theme'
import { Mail, Linkedin, Plus, Clock, Trash2, Save, Sparkles, ArrowLeft, Search, UserPlus, X, ChevronRight, Eye, Reply, AlertTriangle, Send, GitBranch, Copy, MoreHorizontal } from 'lucide-react'

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
  const [leadActivity, setLeadActivity] = useState([])
  const [regenPrompt, setRegenPrompt] = useState(false)
  const [testSending, setTestSending] = useState(false)
  const [testSent, setTestSent] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [showLaunchConfirm, setShowLaunchConfirm] = useState(false)

  useEffect(() => { if (!isNew) load() }, [id])

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
      const { data } = await supabase.from('kiko_sequences').insert({ name: seq.name || 'New Campaign', description: seq.description, target_persona: seq.target_persona, steps, is_active: false }).select().single()
      if (data) nav(`/sequences/${data.id}`, { replace: true })
    } else {
      await supabase.from('kiko_sequences').update({ name: seq.name, description: seq.description, target_persona: seq.target_persona, steps, updated_at: new Date().toISOString() }).eq('id', id)
    }
    setSaving(false); setDirty(false)
  }

  async function launchCampaign() {
    setLaunching(true)
    await supabase.from('kiko_sequences').update({ is_active: true, updated_at: new Date().toISOString() }).eq('id', id)
    setSeq(prev => ({ ...prev, is_active: true }))
    setShowLaunchConfirm(false)
    setLaunching(false)
  }

  const isDraft = seq && !seq.is_active

  async function duplicateCampaign() {
    if (!seq) return
    const { data } = await supabase.from('kiko_sequences').insert({
      name: `${seq.name} (copy)`, description: seq.description, target_persona: seq.target_persona,
      steps: seq.steps, is_active: false
    }).select().single()
    if (data) nav(`/sequences/${data.id}`)
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
          message: `Write a ${s.channel === 'email' ? 'outreach email' : '300-char LinkedIn message'} for step ${s.step} of a sequence.\n\nSTYLE RULES (non-negotiable):\n- ${s.channel === 'email' ? 'Start with "Dear {firstName}," and end with "Kind regards,\\n\\n{signature}"' : 'Start with "Hi {firstName},"'}\n- Write at principal/board level. No generic filler. No "I hope this finds you well".\n- Tone: "We work at principal level on the structuring of Formula One partnerships for teams and rights-holders."\n- Category-specific: explain WHY this category matters operationally for Formula One.\n- Soft CTA: "The relevant question at this stage is simply whether this is strategic from your perspective."\n- Subject format uses x not special characters (e.g. "Haas F1 Team x Cloud Infrastructure")\n- 50-125 words for emails. 300 chars max for LinkedIn.\n\nContext: Approach: ${s.approach}. Psychology: ${s.psychology}. Target: ${seq?.target_persona || 'C-suite'}. Subject: ${s.subject || 'F1 partnership'}.\n\nReturn ONLY the message text, nothing else.`, stream: false
        })
      })
      const d = await r.json(); upd(i, 'template', d?.content || d?.message || 'Error')
    } catch { upd(i, 'template', 'Error generating.') }
  }

  async function sendTest(i) {
    const s = steps[i]; if (!s || s.channel !== 'email') return
    setTestSending(true); setTestSent(false)
    try {
      const category = seq?.name?.split(' - ')[1] || 'Category'
      const body = (s.template || '').replace(/\{firstName\}/g, 'Sunny').replace(/\{lastName\}/g, 'Sidhu').replace(/\{companyName\}/g, 'Test Company').replace(/\{category\}/g, category).replace(/\{revenue\}/g, '$1B').replace(/\{ceo\}/g, 'CEO Name').replace(/\{raceWindow\}/g, 'Miami Grand Prix').replace(/\{recentNews\}/g, 'recent development').replace(/\{prevSubject\}/g, 'Previous subject').replace(/\{signature\}/g, 'Sunny Sidhu\nCEO, Van Hawke Group\nsunny@vanhawke.agency')
      const subject = '[TEST] ' + (s.subject || 'Test').replace(/\{category\}/g, category)
      const r = await fetch('/api/gmail-draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: 'sunny@vanhawke.agency', subject, body }) })
      if (r.ok) { setTestSent(true); setTimeout(() => setTestSent(false), 5000) }
      else { alert('Draft creation failed') }
    } catch (err) { alert('Error: ' + err.message) }
    setTestSending(false)
  }

  async function searchContacts() {
    if (!leadSearch.trim()) return; setSearching(true)
    const { data } = await supabase.from('contacts').select('id,data').or(`data->>company.ilike.%${leadSearch}%,data->>title.ilike.%${leadSearch}%,data->>firstName.ilike.%${leadSearch}%,data->>lastName.ilike.%${leadSearch}%`).limit(30)
    const results = (data || []).map(c => ({ id: c.id, name: [c.data?.firstName, c.data?.lastName].filter(Boolean).join(' ') || 'Unknown', email: c.data?.email, company: c.data?.company, title: c.data?.title, linkedin: c.data?.linkedin })).filter(r => r.email)
    setSearchResults(results); setSearching(false)
  }

  async function autoSuggestLeads() {
    if (!seq?.name) return; setLoadingSuggestions(true)
    const category = seq.name.split(' - ')[1] || seq.name
    const categoryWords = category.toLowerCase().split(/[\s\/&]+/).filter(w => w.length > 3)
    const queries = categoryWords.map(w => `data->>company.ilike.%${w}%`).join(',')
    const { data: contacts } = await supabase.from('contacts').select('id,data').or(queries || `data->>company.ilike.%${category}%`).limit(50)
    const enrolledEmails = new Set(enrollments.map(e => e.contact_email?.toLowerCase()))
    const results = (contacts || []).map(c => ({ id: c.id, name: [c.data?.firstName, c.data?.lastName].filter(Boolean).join(' ') || 'Unknown', email: c.data?.email, company: c.data?.company, title: c.data?.title, linkedin: c.data?.linkedin })).filter(r => r.email && !enrolledEmails.has(r.email.toLowerCase()))
    setSuggestions(results); setLoadingSuggestions(false)
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

  async function pauseEnr(eid) { await supabase.from('kiko_sequence_enrollments').update({ status: 'paused' }).eq('id', eid); await supabase.from('kiko_outreach_queue').update({ status: 'cancelled' }).eq('enrollment_id', eid).eq('status', 'queued'); load() }
  async function cancelEnr(eid) { await supabase.from('kiko_sequence_enrollments').update({ status: 'cancelled' }).eq('id', eid); await supabase.from('kiko_outreach_queue').update({ status: 'cancelled' }).eq('enrollment_id', eid).eq('status', 'queued'); load() }

  const cur = steps[selStep]
  const tabs = [{ id: 'sequence', label: 'Sequence' }, { id: 'leads', label: 'Leads', ct: enrollments.length }, { id: 'performance', label: 'Performance' }]
  const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: T.radiusSm, border: `0.5px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 12, fontFamily: T.font, outline: 'none', boxSizing: 'border-box' }

  return (
    <div style={{ padding: '20px 28px', fontFamily: T.font, color: T.text, maxWidth: 1300, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <button onClick={() => nav('/sequences')} style={{ background: 'none', border: 'none', color: T.textSecondary, cursor: 'pointer', padding: 4 }}><ArrowLeft size={18} /></button>
        <input value={seq?.name || ''} onChange={e => { setSeq({ ...seq, name: e.target.value }); setDirty(true) }} placeholder="Campaign name..." style={{ fontSize: 20, fontWeight: 400, background: 'none', border: 'none', color: T.text, fontFamily: T.font, outline: 'none', flex: 1 }} />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {dirty && <span style={{ fontSize: 11, color: T.warning }}>Unsaved</span>}
          {!isNew && <button onClick={duplicateCampaign} title="Duplicate campaign" style={{ padding: '7px 8px', borderRadius: T.radiusSm, border: `0.5px solid ${T.border}`, background: 'transparent', color: T.textTertiary, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Copy size={12} /></button>}
          {!isNew && <button onClick={deleteCampaign} title="Delete campaign" style={{ padding: '7px 8px', borderRadius: T.radiusSm, border: '0.5px solid rgba(248,113,113,0.15)', background: 'transparent', color: T.danger, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Trash2 size={12} /></button>}
          <button onClick={save} disabled={saving} style={{ padding: '7px 16px', borderRadius: T.radiusSm, border: 'none', background: 'rgba(255,224,194,0.10)', color: T.accent, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: T.font, opacity: saving ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 5, boxShadow: T.liquidBtnShadow }}><Save size={12} />{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
      <input value={seq?.target_persona || ''} onChange={e => { setSeq({ ...seq, target_persona: e.target.value }); setDirty(true) }} placeholder="Target persona" style={{ ...inputStyle, marginBottom: 14 }} />
      {/* Draft/Live status banner */}
      {!isNew && isDraft && (
        <div style={{ padding: '10px 16px', borderRadius: T.radiusSm, background: 'rgba(251,191,36,0.04)', border: '0.5px solid rgba(251,191,36,0.15)', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: T.warning, fontWeight: 500 }}>Draft</span>
            <span style={{ fontSize: 11, color: T.textTertiary }}>Build sequence → Add leads → Launch</span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['Sequence', 'Leads', 'Launch'].map((s, i) => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: (i === 0 && tab === 'sequence') || (i === 1 && tab === 'leads') ? 'rgba(255,224,194,0.12)' : 'transparent',
                  color: (i === 0 && tab === 'sequence') || (i === 1 && tab === 'leads') ? T.accent : T.textTertiary,
                  border: `1px solid ${(i === 0 && tab === 'sequence') || (i === 1 && tab === 'leads') ? 'rgba(255,224,194,0.2)' : T.border}`
                }}>{i + 1}</div>
                {i < 2 && <ChevronRight size={10} style={{ color: T.textMuted }} />}
              </div>
            ))}
          </div>
        </div>
      )}
      {!isNew && !isDraft && (
        <div style={{ padding: '10px 16px', borderRadius: T.radiusSm, background: 'rgba(45,212,191,0.04)', border: '0.5px solid rgba(45,212,191,0.15)', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: T.success, fontWeight: 500 }}>Live — emails sending Mon-Fri 8am-6pm, timed to prospect timezone</span>
          <button onClick={async () => { await supabase.from('kiko_sequences').update({ is_active: false }).eq('id', id); setSeq(prev => ({ ...prev, is_active: false })) }} style={{ padding: '4px 12px', borderRadius: 4, border: '0.5px solid rgba(248,113,113,0.2)', background: 'transparent', color: T.danger, fontSize: 10, cursor: 'pointer', fontFamily: T.font }}>Pause campaign</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 2, marginBottom: 14, background: T.surface, borderRadius: T.radius, padding: 3, width: 'fit-content' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setSelectedLead(null) }} style={{ padding: '6px 14px', borderRadius: T.radiusSm, border: 'none', cursor: 'pointer', fontFamily: T.font, fontSize: 12, background: tab === t.id ? 'rgba(255,224,194,0.08)' : 'transparent', color: tab === t.id ? T.text : T.textSecondary, display: 'flex', alignItems: 'center', gap: 5 }}>
            {t.label}{t.ct !== undefined && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'rgba(255,224,194,0.06)', color: T.accent }}>{t.ct}</span>}
          </button>
        ))}
      </div>

      {/* ═══ SEQUENCE TAB ═══ */}
      {tab === 'sequence' && (
        <>
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 14, minHeight: 480 }}>
          <div style={{ ...glass, padding: 14, overflowY: 'auto' }}>
            <div style={{ textAlign: 'center', padding: '6px 0 12px', fontSize: 11, color: T.textTertiary, borderBottom: `0.5px solid ${T.border}`, marginBottom: 8 }}>
              {steps.length > 0 ? `${steps.length} steps · ${steps.reduce((s, st) => s + (st.delay_days || 0), 0)} days` : 'Sequence start'}
            </div>
            {steps.map((s, i) => {
              const isLI = s.channel === 'linkedin'
              const sel = i === selStep
              return (<div key={i}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 0' }}><div style={{ width: 1, height: 12, background: T.border }} /></div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 3 }}>
                  <Clock size={9} style={{ color: T.textTertiary }} />
                  <select value={s.delay_days} onChange={e => upd(i, 'delay_days', +e.target.value)} style={{ background: 'transparent', border: 'none', color: T.warning, fontSize: 10, fontFamily: T.font, cursor: 'pointer', outline: 'none' }}>
                    <option value={0} style={{ background: '#111' }}>Immediately</option>
                    {[1, 2, 3, 4, 5, 7, 10, 14].map(d => <option key={d} value={d} style={{ background: '#111' }}>Wait {d}d</option>)}
                  </select>
                </div>
                <div onClick={() => setSelStep(i)} style={{ ...glass, padding: '8px 10px', cursor: 'pointer', borderColor: sel ? T.accent : T.glassBorder, background: sel ? 'rgba(255,224,194,0.04)' : glass.background, transition: 'all 0.15s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 20, height: 20, borderRadius: 5, background: s.type === 'condition' ? 'rgba(251,191,36,0.10)' : isLI ? 'rgba(0,119,181,0.12)' : 'rgba(255,224,194,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {s.type === 'condition' ? <GitBranch size={10} style={{ color: T.warning }} /> : isLI ? <Linkedin size={10} style={{ color: '#0077B5' }} /> : <Mail size={10} style={{ color: T.accent }} />}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 500, flex: 1 }}>{s.type === 'condition' ? 'Condition' : isLI ? 'LinkedIn' : 'Email'} {i + 1}</span>
                    <button onClick={e => { e.stopPropagation(); del(i) }} style={{ background: 'none', border: 'none', color: T.textTertiary, cursor: 'pointer', padding: 1 }}><Trash2 size={10} /></button>
                  </div>
                  {s.subject && <div style={{ fontSize: 10, color: T.textTertiary, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.subject}</div>}
                  {s.type === 'condition' && <div style={{ fontSize: 10, color: T.warning, marginTop: 3 }}>{CONDITIONS.find(c => c.value === s.condition_type)?.label || s.condition_type} → Yes / No</div>}
                </div>
              </div>)
            })}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12, paddingTop: 10, borderTop: `0.5px solid ${T.border}` }}>
              <button onClick={() => addStep('email')} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '5px 10px', borderRadius: 5, border: `0.5px solid ${T.border}`, background: 'transparent', color: T.textSecondary, fontSize: 10, cursor: 'pointer', fontFamily: T.font }}><Plus size={10} />Email</button>
              <button onClick={() => addStep('linkedin')} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '5px 10px', borderRadius: 5, border: `0.5px solid ${T.border}`, background: 'transparent', color: T.textSecondary, fontSize: 10, cursor: 'pointer', fontFamily: T.font }}><Plus size={10} />LinkedIn</button>
              <button onClick={() => addStep('condition')} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '5px 10px', borderRadius: 5, border: `0.5px solid rgba(251,191,36,0.2)`, background: 'rgba(251,191,36,0.04)', color: T.warning, fontSize: 10, cursor: 'pointer', fontFamily: T.font }}><GitBranch size={10} />Condition</button>
            </div>
          </div>
          <div style={{ ...glass, padding: 18 }}>
            {cur ? (
              <>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {cur.type === 'condition' ? <GitBranch size={14} style={{ color: T.warning }} /> : cur.channel === 'linkedin' ? <Linkedin size={14} style={{ color: '#0077B5' }} /> : <Mail size={14} style={{ color: T.accent }} />}
                  Step {selStep + 1} · {cur.type === 'condition' ? 'Condition (branch)' : cur.channel === 'email' ? 'Email' : 'LinkedIn message'}
                </div>
                {/* ═══ CONDITION STEP EDITOR ═══ */}
                {cur.type === 'condition' ? (
                  <>
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ fontSize: 10, color: T.textTertiary, marginBottom: 4, display: 'block' }}>Condition type</label>
                      <select value={cur.condition_type || 'no_reply'} onChange={e => upd(selStep, 'condition_type', e.target.value)} style={{ ...inputStyle, fontSize: 12 }}>
                        {CONDITIONS.map(c => <option key={c.value} value={c.value} style={{ background: '#111' }}>{c.label}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                      {/* YES branch */}
                      <div style={{ padding: 12, borderRadius: T.radiusSm, background: 'rgba(45,212,191,0.03)', border: '0.5px solid rgba(45,212,191,0.12)' }}>
                        <div style={{ fontSize: 11, fontWeight: 500, color: T.success, marginBottom: 8 }}>✅ YES branch</div>
                        <div style={{ fontSize: 10, color: T.textTertiary, marginBottom: 8 }}>
                          {cur.condition_type === 'no_reply' ? 'Lead did NOT reply' : cur.condition_type === 'has_linkedin' ? 'Has LinkedIn URL' : cur.condition_type === 'has_email' ? 'Has verified email' : 'Condition met'}
                        </div>
                        {(cur.yes_steps || []).map((ys, yi) => (
                          <div key={yi} style={{ padding: '6px 8px', borderRadius: 4, background: T.surface, border: `0.5px solid ${T.border}`, marginBottom: 4, fontSize: 10 }}>
                            <div style={{ color: T.textSecondary }}>{ys.channel === 'linkedin' ? '💼 LinkedIn' : '📧 Email'} — {ys.approach || 'authority-led'}</div>
                            {ys.subject && <div style={{ color: T.textTertiary, marginTop: 2 }}>{ys.subject}</div>}
                          </div>
                        ))}
                      </div>
                      {/* NO branch */}
                      <div style={{ padding: 12, borderRadius: T.radiusSm, background: 'rgba(248,113,113,0.03)', border: '0.5px solid rgba(248,113,113,0.12)' }}>
                        <div style={{ fontSize: 11, fontWeight: 500, color: T.danger, marginBottom: 8 }}>❌ NO branch</div>
                        <div style={{ fontSize: 10, color: T.textTertiary, marginBottom: 8 }}>
                          {cur.condition_type === 'no_reply' ? 'Lead DID reply (sequence stops)' : cur.condition_type === 'has_linkedin' ? 'No LinkedIn URL' : cur.condition_type === 'has_email' ? 'No verified email' : 'Condition not met'}
                        </div>
                        {(cur.no_steps || []).map((ns, ni) => (
                          <div key={ni} style={{ padding: '6px 8px', borderRadius: 4, background: T.surface, border: `0.5px solid ${T.border}`, marginBottom: 4, fontSize: 10 }}>
                            <div style={{ color: T.textSecondary }}>{ns.channel === 'linkedin' ? '💼 LinkedIn' : '📧 Email'} — {ns.approach || 'authority-led'}</div>
                            {ns.subject && <div style={{ color: T.textTertiary, marginTop: 2 }}>{ns.subject}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: T.textTertiary, fontStyle: 'italic', lineHeight: 1.5 }}>
                      Branches auto-configured. Ask Kiko: "Generate a multichannel branching campaign for [category]" for full customisation.
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button onClick={() => askKiko(selStep)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: T.radiusSm, border: `0.5px solid rgba(255,224,194,0.15)`, background: 'rgba(255,224,194,0.04)', color: T.accent, fontSize: 11, cursor: 'pointer', fontFamily: T.font, flex: 1, justifyContent: 'center' }}><Sparkles size={12} />Ask Kiko to optimise branches</button>
                    </div>
                  </>
                ) : (
                  <>
                {/* ═══ EMAIL / LINKEDIN STEP EDITOR ═══ */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                  {[{ id: 'email', icon: Mail, c: T.accent }, { id: 'linkedin', icon: Linkedin, c: '#0077B5' }].map(ch => (
                    <button key={ch.id} onClick={() => upd(selStep, 'channel', ch.id)} style={{ padding: '4px 10px', borderRadius: 5, border: `0.5px solid ${cur.channel === ch.id ? ch.c : T.border}`, background: cur.channel === ch.id ? `${ch.c}10` : 'transparent', color: cur.channel === ch.id ? ch.c : T.textTertiary, fontSize: 11, cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 4 }}><ch.icon size={11} />{ch.id}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <div style={{ flex: 1 }}><label style={{ fontSize: 10, color: T.textTertiary, marginBottom: 2, display: 'block' }}>Approach</label>
                    <select value={cur.approach || ''} onChange={e => updAndRegen(selStep, 'approach', e.target.value)} style={{ ...inputStyle, padding: '5px 6px', fontSize: 11 }}>{APPROACHES.map(a => <option key={a} value={a} style={{ background: '#111' }}>{a}</option>)}</select></div>
                  <div style={{ flex: 1 }}><label style={{ fontSize: 10, color: T.textTertiary, marginBottom: 2, display: 'block' }}>Psychology</label>
                    <select value={cur.psychology || ''} onChange={e => updAndRegen(selStep, 'psychology', e.target.value)} style={{ ...inputStyle, padding: '5px 6px', fontSize: 11 }}>{PSYCHOLOGY.map(p => <option key={p} value={p} style={{ background: '#111' }}>{p.replace(/_/g, ' ')}</option>)}</select></div>
                </div>
                {cur.channel === 'email' && <div style={{ marginBottom: 12 }}><label style={{ fontSize: 10, color: T.textTertiary, marginBottom: 2, display: 'block' }}>Subject</label>
                  <input value={cur.subject || ''} onChange={e => upd(selStep, 'subject', e.target.value)} placeholder="Haas F1 Team x {category}" style={inputStyle} /></div>}
                {regenPrompt && <div style={{ padding: '8px 12px', borderRadius: T.radiusSm, background: 'rgba(251,191,36,0.04)', border: '0.5px solid rgba(251,191,36,0.12)', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: T.warning }}>Approach changed — regenerate content?</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => { askKiko(selStep); setRegenPrompt(false) }} style={{ padding: '4px 10px', borderRadius: 4, border: 'none', background: 'rgba(255,224,194,0.10)', color: T.accent, fontSize: 10, cursor: 'pointer', fontFamily: T.font }}>Regenerate</button>
                    <button onClick={() => setRegenPrompt(false)} style={{ padding: '4px 10px', borderRadius: 4, border: `0.5px solid ${T.border}`, background: 'transparent', color: T.textTertiary, fontSize: 10, cursor: 'pointer', fontFamily: T.font }}>Keep</button>
                  </div>
                </div>}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <label style={{ fontSize: 10, color: T.textTertiary }}>{cur.channel === 'email' ? 'Email body' : 'Message'}</label>
                    <span style={{ fontSize: 10, color: (() => {
                      if (cur.channel === 'linkedin') return (cur.template || '').length > 280 ? T.danger : T.textTertiary
                      const words = (cur.template || '').trim().split(/\s+/).filter(Boolean).length
                      return words < 50 ? T.warning : words > 125 ? T.danger : T.success
                    })() }}>
                      {cur.channel === 'linkedin'
                        ? `${(cur.template || '').length} / 300 chars`
                        : `${(cur.template || '').trim().split(/\s+/).filter(Boolean).length} words (target: 50-125)`}
                    </span>
                  </div>
                  <textarea value={cur.template || ''} onChange={e => upd(selStep, 'template', e.target.value)} rows={cur.channel === 'email' ? 10 : 3} maxLength={cur.channel === 'linkedin' ? 300 : undefined} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6, padding: '8px 10px' }} />
                </div>
                <div style={{ marginBottom: 12 }}><div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  {VARS.map(v => <button key={v} onClick={() => upd(selStep, 'template', (cur.template || '') + v)} style={{ padding: '2px 6px', borderRadius: 3, border: `0.5px solid ${T.border}`, background: 'transparent', color: T.accent, fontSize: 9, cursor: 'pointer', fontFamily: T.font }}>{v}</button>)}
                </div></div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => askKiko(selStep)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: T.radiusSm, border: `0.5px solid rgba(255,224,194,0.15)`, background: 'rgba(255,224,194,0.04)', color: T.accent, fontSize: 11, cursor: 'pointer', fontFamily: T.font, flex: 1, justifyContent: 'center' }}><Sparkles size={12} />Ask Kiko to write this step</button>
                  {cur.channel === 'email' && <button onClick={() => sendTest(selStep)} disabled={testSending} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: T.radiusSm, border: `0.5px solid ${testSent ? 'rgba(45,212,191,0.2)' : T.border}`, background: testSent ? 'rgba(45,212,191,0.04)' : 'transparent', color: testSent ? T.success : T.textSecondary, fontSize: 11, cursor: 'pointer', fontFamily: T.font, whiteSpace: 'nowrap' }}>{testSending ? 'Saving...' : testSent ? '✓ Draft created' : '📧 Create draft'}</button>}
                </div>
                  </>
                )}
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, color: T.textTertiary, fontSize: 12, gap: 10 }}>
                <span>Add a step to start building</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => addStep('email')} style={{ padding: '6px 12px', borderRadius: 5, border: `0.5px solid rgba(255,224,194,0.15)`, background: 'rgba(255,224,194,0.04)', color: T.accent, fontSize: 11, cursor: 'pointer', fontFamily: T.font }}>+ Email</button>
                  <button onClick={() => addStep('linkedin')} style={{ padding: '6px 12px', borderRadius: 5, border: '0.5px solid rgba(0,119,181,0.15)', background: 'rgba(0,119,181,0.04)', color: '#0077B5', fontSize: 11, cursor: 'pointer', fontFamily: T.font }}>+ LinkedIn</button>
                  <button onClick={() => addStep('condition')} style={{ padding: '6px 12px', borderRadius: 5, border: '0.5px solid rgba(251,191,36,0.15)', background: 'rgba(251,191,36,0.04)', color: T.warning, fontSize: 11, cursor: 'pointer', fontFamily: T.font }}>+ Condition</button>
                </div>
              </div>
            )}
          </div>
        </div>
        {/* Continue to Leads button (draft flow) */}
        {isDraft && steps.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button onClick={() => { if (dirty) save(); setTab('leads') }} style={{ padding: '10px 24px', borderRadius: T.radiusSm, border: 'none', background: 'rgba(255,224,194,0.10)', color: T.accent, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: T.font, boxShadow: T.liquidBtnShadow, display: 'flex', alignItems: 'center', gap: 6 }}>
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
              <div style={{ padding: '12px 16px', borderBottom: `0.5px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>Leads</span>
                  {enrollments.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, fontSize: 10, color: T.textTertiary }}>
                      <span>{enrollments.length} enrolled</span>
                      <span style={{ color: T.teal }}>{enrollments.filter(e => e.status === 'active').length} active</span>
                      <span style={{ color: T.success }}>{enrollments.filter(e => e.status === 'replied').length} replied</span>
                      <span style={{ color: T.danger }}>{enrollments.filter(e => e.status === 'bounced').length} bounced</span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={autoSuggestLeads} disabled={loadingSuggestions} style={{ padding: '5px 12px', borderRadius: 5, border: `0.5px solid ${T.border}`, background: T.surface, color: T.teal, fontSize: 11, cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 4 }}><Sparkles size={12} />{loadingSuggestions ? 'Finding...' : 'Kiko, find leads'}</button>
                  <button onClick={() => setShowManualAdd(true)} style={{ padding: '5px 12px', borderRadius: 5, border: `0.5px solid ${T.border}`, background: T.surface, color: T.accent, fontSize: 11, cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={12} />Manual add</button>
                  <button onClick={() => setShowAddLeads(true)} style={{ padding: '5px 12px', borderRadius: 5, border: 'none', background: 'rgba(255,224,194,0.10)', color: T.accent, fontSize: 11, cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 4 }}><UserPlus size={12} />Add from CRM</button>
                </div>
              </div>
              {suggestions.length > 0 && (
                <div style={{ padding: '10px 16px', borderBottom: `0.5px solid ${T.border}`, background: 'rgba(45,212,191,0.02)' }}>
                  <div style={{ fontSize: 11, color: T.teal, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}><Sparkles size={11} />Kiko found {suggestions.length} potential leads</div>
                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    {suggestions.map(s => {
                      const checked = selectedLeads.some(l => l.id === s.id)
                      return (
                        <div key={s.id} onClick={() => checked ? setSelectedLeads(selectedLeads.filter(l => l.id !== s.id)) : setSelectedLeads([...selectedLeads, s])} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', cursor: 'pointer', borderRadius: 4, background: checked ? 'rgba(255,224,194,0.03)' : 'transparent' }}>
                          <div style={{ width: 14, height: 14, borderRadius: 3, border: `1px solid ${checked ? T.accent : T.border}`, background: checked ? T.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{checked && <span style={{ color: '#111', fontSize: 9 }}>✓</span>}</div>
                          <span style={{ fontSize: 11, color: T.text, minWidth: 100 }}>{s.name}</span>
                          <span style={{ fontSize: 10, color: T.textTertiary, flex: 1 }}>{s.company} · {s.title || '—'}</span>
                          <span style={{ fontSize: 10, color: T.textTertiary }}>{s.email}</span>
                        </div>
                      )
                    })}
                  </div>
                  {selectedLeads.length > 0 && <button onClick={enrollSelected} style={{ marginTop: 8, padding: '6px 14px', borderRadius: 5, border: 'none', background: 'rgba(255,224,194,0.10)', color: T.accent, fontSize: 11, cursor: 'pointer', fontFamily: T.font }}>Enroll {selectedLeads.length} contact{selectedLeads.length > 1 ? 's' : ''}</button>}
                </div>
              )}
              {enrollments.length ? (<div>
                <div style={{ display: 'flex', padding: '8px 16px', borderBottom: `0.5px solid ${T.border}`, fontSize: 10, color: T.textTertiary, fontWeight: 500 }}>
                  <span style={{ flex: 1 }}>Name</span><span style={{ width: 120 }}>Company</span><span style={{ width: 80, textAlign: 'center' }}>Step</span><span style={{ width: 70, textAlign: 'center' }}>Status</span><span style={{ width: 70, textAlign: 'right' }}>Next</span><span style={{ width: 100 }}></span>
                </div>
                {enrollments.map(e => {
                  const isSelected = selectedLead?.id === e.id
                  return (
                    <div key={e.id} onClick={() => selectLeadForTimeline(e)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: `0.5px solid ${T.border}`, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s', background: isSelected ? 'rgba(255,224,194,0.04)' : 'transparent' }}
                      onMouseEnter={ev => { if (!isSelected) ev.currentTarget.style.background = 'rgba(255,224,194,0.02)' }}
                      onMouseLeave={ev => { if (!isSelected) ev.currentTarget.style.background = 'transparent' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: e.status === 'active' ? T.teal : e.status === 'replied' ? T.success : e.status === 'bounced' ? T.danger : T.textTertiary }} />
                      <div style={{ flex: 1, minWidth: 0 }}><div style={{ color: T.text }}>{e.contact_name || e.contact_email}</div><div style={{ fontSize: 10, color: T.textTertiary }}>{e.company}</div></div>
                      <div style={{ width: 70, textAlign: 'center' }}><div style={{ fontSize: 11, color: T.textSecondary }}>Step {e.current_step}/{steps.length}</div>
                        <div style={{ height: 3, background: T.surface, borderRadius: 2, marginTop: 3 }}><div style={{ height: '100%', borderRadius: 2, background: e.status === 'active' ? T.teal : T.success, width: `${(e.current_step / Math.max(steps.length, 1)) * 100}%` }} /></div></div>
                      <span style={{ fontSize: 10, color: T.textTertiary, width: 50, textTransform: 'capitalize' }}>{e.status}</span>
                      <span style={{ fontSize: 10, color: T.textTertiary, width: 50 }}>{e.next_send_at ? new Date(e.next_send_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</span>
                      {e.status === 'active' && <button onClick={(ev) => { ev.stopPropagation(); pauseEnr(e.id) }} style={{ padding: '3px 6px', borderRadius: 3, border: `0.5px solid ${T.border}`, background: 'transparent', color: T.textSecondary, fontSize: 9, cursor: 'pointer' }}>Pause</button>}
                      {(e.status === 'active' || e.status === 'paused') && <button onClick={(ev) => { ev.stopPropagation(); cancelEnr(e.id) }} style={{ padding: '3px 6px', borderRadius: 3, border: '0.5px solid rgba(248,113,113,0.2)', background: 'transparent', color: T.danger, fontSize: 9, cursor: 'pointer' }}>Cancel</button>}
                      <ChevronRight size={12} style={{ color: T.textMuted, flexShrink: 0 }} />
                    </div>
                  )
                })}
              </div>) : <div style={{ padding: 40, textAlign: 'center', color: T.textTertiary, fontSize: 12, fontWeight: 300 }}>No leads enrolled. Click "Kiko, find leads", "Manual add", or "Add from CRM".</div>}
            </div>
          </div>
          {selectedLead && (
            <div style={{ width: 340, borderLeft: `0.5px solid ${T.border}`, marginLeft: -1, flexShrink: 0, background: 'rgba(17,17,17,0.5)' }}>
              <div style={{ padding: '14px 16px', borderBottom: `0.5px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 500, color: T.text }}>{selectedLead.contact_name}</div>
                  <div style={{ fontSize: 11, color: T.textTertiary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedLead.contact_email}{selectedLead.company ? ` · ${selectedLead.company}` : ''}</div></div>
                <button onClick={() => setSelectedLead(null)} style={{ width: 28, height: 28, borderRadius: T.radiusSm, background: T.surface, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textTertiary }}><X size={14} /></button>
              </div>
              <div style={{ padding: '10px 16px', borderBottom: `0.5px solid ${T.border}`, display: 'flex', gap: 12, fontSize: 11 }}>
                <span style={{ color: T.textSecondary }}>Status: <span style={{ color: selectedLead.status === 'replied' ? T.success : selectedLead.status === 'bounced' ? T.danger : T.teal, textTransform: 'capitalize' }}>{selectedLead.status}</span></span>
                <span style={{ color: T.textTertiary }}>Step {selectedLead.current_step}/{steps.length}</span>
              </div>
              <div style={{ padding: '12px 16px', overflowY: 'auto', maxHeight: 'calc(100vh - 260px)' }}>
                <div style={{ fontSize: 10, fontWeight: 500, color: T.textTertiary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Activity Timeline</div>
                {leadActivity.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: T.textTertiary, fontSize: 12, fontWeight: 300 }}>No activity recorded yet</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative', paddingLeft: 18 }}>
                    <div style={{ position: 'absolute', left: 5, top: 6, bottom: 6, width: 1, background: T.border }} />
                    {leadActivity.map((a, i) => {
                      const isSent = a.status === 'sent'; const isFailed = a.status === 'failed'; const isQueued = a.status === 'queued'
                      return (
                        <div key={a.id || i} style={{ display: 'flex', gap: 10, padding: '8px 0', position: 'relative' }}>
                          <div style={{ position: 'absolute', left: -15, top: 12, width: 8, height: 8, borderRadius: '50%', background: '#111', border: `2px solid ${isSent ? 'rgba(45,212,191,0.5)' : isFailed ? 'rgba(248,113,113,0.5)' : 'rgba(238,238,238,0.2)'}`, zIndex: 1 }} />
                          <div style={{ flex: 1, background: T.surface, border: `0.5px solid ${T.border}`, borderRadius: T.radiusSm, padding: '8px 10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              {isSent ? <Send size={11} style={{ color: T.success }} /> : isFailed ? <AlertTriangle size={11} style={{ color: T.danger }} /> : <Clock size={11} style={{ color: T.textTertiary }} />}
                              <span style={{ fontSize: 11, fontWeight: 500, color: T.textSecondary, textTransform: 'capitalize' }}>{a.channel || 'email'} · Step {a.step_number} · {isSent ? 'Sent' : isFailed ? 'Failed' : isQueued ? 'Queued' : a.status}</span>
                            </div>
                            {a.subject && <div style={{ fontSize: 11, color: T.textTertiary, marginBottom: 2 }}>{a.subject}</div>}
                            <div style={{ fontSize: 10, color: T.textMuted }}>{a.sent_at ? new Date(a.sent_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : a.scheduled_for ? `Scheduled: ${new Date(a.scheduled_for).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}</div>
                          </div>
                        </div>
                      )
                    })}
                    <div style={{ display: 'flex', gap: 10, padding: '8px 0', position: 'relative' }}>
                      <div style={{ position: 'absolute', left: -15, top: 12, width: 8, height: 8, borderRadius: '50%', background: '#111', border: `2px solid rgba(255,224,194,0.3)`, zIndex: 1 }} />
                      <div style={{ flex: 1, background: T.surface, border: `0.5px solid ${T.border}`, borderRadius: T.radiusSm, padding: '8px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><UserPlus size={11} style={{ color: T.accent }} /><span style={{ fontSize: 11, fontWeight: 500, color: T.textSecondary }}>Enrolled</span></div>
                        <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>{selectedLead.created_at ? new Date(selectedLead.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</div>
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
            <button onClick={() => setTab('sequence')} style={{ padding: '10px 20px', borderRadius: T.radiusSm, border: `0.5px solid ${T.border}`, background: 'transparent', color: T.textSecondary, fontSize: 13, cursor: 'pointer', fontFamily: T.font }}>
              ← Back to Sequence
            </button>
            <button onClick={() => setShowLaunchConfirm(true)} style={{ padding: '10px 28px', borderRadius: T.radiusSm, border: 'none', background: 'rgba(45,212,191,0.12)', color: T.success, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.font, boxShadow: T.liquidBtnShadow, display: 'flex', alignItems: 'center', gap: 6 }}>
              🚀 Launch Campaign
            </button>
          </div>
        )}
      </>)}

      {/* ═══ PERFORMANCE TAB ═══ */}
      {tab === 'performance' && (
        <div>
          {enrollments.length > 0 ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
                {[
                  { l: 'Enrolled', v: enrollments.length, c: T.accent },
                  { l: 'Active', v: enrollments.filter(e => e.status === 'active').length, c: T.teal },
                  { l: 'Replied', v: enrollments.filter(e => e.status === 'replied').length, c: T.success },
                  { l: 'Reply rate', v: `${enrollments.length ? Math.round(enrollments.filter(e => e.status === 'replied').length / enrollments.length * 100) : 0}%`, c: T.warning },
                  { l: 'Bounced', v: enrollments.filter(e => e.status === 'bounced').length, c: T.danger },
                ].map((s, i) => (
                  <div key={i} style={{ ...glass, padding: '14px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 500, color: s.c }}>{s.v}</div>
                    <div style={{ fontSize: 10, color: T.textTertiary }}>{s.l}</div>
                  </div>
                ))}
              </div>
              <div style={{ ...glass, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', borderBottom: `0.5px solid ${T.border}`, fontSize: 12, fontWeight: 500 }}>Step breakdown</div>
                {steps.map((s, i) => {
                  const sentQ = queue.filter(q => q.step_number === i + 1 && q.status === 'sent').length
                  const pctSent = enrollments.length > 0 ? Math.round(sentQ / enrollments.length * 100) : 0
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `0.5px solid ${T.border}`, fontSize: 11 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 5, background: s.type === 'condition' ? 'rgba(251,191,36,0.10)' : s.channel === 'linkedin' ? 'rgba(0,119,181,0.12)' : 'rgba(255,224,194,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {s.type === 'condition' ? <GitBranch size={9} style={{ color: T.warning }} /> : s.channel === 'linkedin' ? <Linkedin size={9} style={{ color: '#0077B5' }} /> : <Mail size={9} style={{ color: T.accent }} />}
                      </div>
                      <span style={{ width: 60, color: T.textTertiary }}>Step {i + 1}</span>
                      <span style={{ flex: 1, color: T.textSecondary }}>{s.type === 'condition' ? 'Condition' : s.approach || 'authority-led'}</span>
                      <div style={{ width: 80, height: 4, background: T.surface, borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 2, width: `${pctSent}%`, background: T.success, transition: 'width 0.3s' }} />
                      </div>
                      <span style={{ width: 50, textAlign: 'right', color: T.textSecondary }}>{sentQ} sent</span>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div style={{ ...glass, padding: 40, textAlign: 'center', color: T.textTertiary, fontSize: 12, fontWeight: 300 }}>No data yet. Enroll leads and launch the campaign to see performance.</div>
          )}
        </div>
      )}

      {/* ═══ MANUAL ADD LEAD MODAL ═══ */}
      {showManualAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowManualAdd(false)}>
          <div onClick={e => e.stopPropagation()} style={{ ...glass, padding: 24, width: 440, maxWidth: '90vw', boxShadow: T.glassShadowFloat }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontSize: 15, fontWeight: 500 }}>Add lead manually</div>
              <button onClick={() => setShowManualAdd(false)} style={{ background: 'none', border: 'none', color: T.textTertiary, cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <div style={{ fontSize: 11, color: T.textTertiary, fontWeight: 300, marginBottom: 16 }}>Add a contact directly without searching the CRM. They'll be enrolled immediately.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div><label style={{ fontSize: 10, color: T.textTertiary, display: 'block', marginBottom: 3 }}>First name</label>
                <input value={manualLead.firstName} onChange={e => setManualLead({ ...manualLead, firstName: e.target.value })} placeholder="John" style={inputStyle} autoFocus /></div>
              <div><label style={{ fontSize: 10, color: T.textTertiary, display: 'block', marginBottom: 3 }}>Last name</label>
                <input value={manualLead.lastName} onChange={e => setManualLead({ ...manualLead, lastName: e.target.value })} placeholder="Smith" style={inputStyle} /></div>
            </div>
            <div style={{ marginBottom: 10 }}><label style={{ fontSize: 10, color: T.textTertiary, display: 'block', marginBottom: 3 }}>Email *</label>
              <input value={manualLead.email} onChange={e => setManualLead({ ...manualLead, email: e.target.value })} placeholder="john@company.com" type="email" style={inputStyle} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div><label style={{ fontSize: 10, color: T.textTertiary, display: 'block', marginBottom: 3 }}>Company</label>
                <input value={manualLead.company} onChange={e => setManualLead({ ...manualLead, company: e.target.value })} placeholder="Acme Corp" style={inputStyle} /></div>
              <div><label style={{ fontSize: 10, color: T.textTertiary, display: 'block', marginBottom: 3 }}>Title</label>
                <input value={manualLead.title} onChange={e => setManualLead({ ...manualLead, title: e.target.value })} placeholder="VP Marketing" style={inputStyle} /></div>
            </div>
            <div style={{ marginBottom: 16 }}><label style={{ fontSize: 10, color: T.textTertiary, display: 'block', marginBottom: 3 }}>LinkedIn URL</label>
              <input value={manualLead.linkedin} onChange={e => setManualLead({ ...manualLead, linkedin: e.target.value })} placeholder="https://linkedin.com/in/..." style={inputStyle} /></div>
            <button onClick={addManualLead} disabled={manualAdding || !manualLead.email.trim()} style={{ width: '100%', padding: '9px 0', borderRadius: T.radiusSm, border: 'none', background: manualAdding ? T.surface : 'rgba(255,224,194,0.10)', color: manualAdding ? T.textTertiary : T.accent, fontSize: 12, fontWeight: 500, cursor: manualAdding ? 'default' : 'pointer', fontFamily: T.font }}>
              {manualAdding ? '⏳ Adding...' : 'Enroll lead'}
            </button>
          </div>
        </div>
      )}

      {/* ═══ ADD FROM CRM MODAL ═══ */}
      {showAddLeads && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowAddLeads(false)}>
          <div onClick={e => e.stopPropagation()} style={{ ...glass, padding: 24, width: 500, maxWidth: '90vw', maxHeight: '70vh', display: 'flex', flexDirection: 'column', boxShadow: T.glassShadowFloat }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 500 }}>Add leads from CRM</div>
              <button onClick={() => setShowAddLeads(false)} style={{ background: 'none', border: 'none', color: T.textTertiary, cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              <input value={leadSearch} onChange={e => setLeadSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchContacts()} placeholder="Search by company, name, or title..." style={{ ...inputStyle, flex: 1 }} />
              <button onClick={searchContacts} disabled={searching} style={{ padding: '8px 14px', borderRadius: T.radiusSm, border: 'none', background: 'rgba(255,224,194,0.10)', color: T.accent, fontSize: 11, cursor: 'pointer', fontFamily: T.font }}><Search size={12} /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: 14 }}>
              {searchResults.map(r => {
                const checked = selectedLeads.some(l => l.id === r.id)
                return (
                  <div key={r.id} onClick={() => checked ? setSelectedLeads(selectedLeads.filter(l => l.id !== r.id)) : setSelectedLeads([...selectedLeads, r])} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderBottom: `0.5px solid ${T.border}`, cursor: 'pointer', background: checked ? 'rgba(255,224,194,0.03)' : 'transparent' }}>
                    <div style={{ width: 16, height: 16, borderRadius: 3, border: `1px solid ${checked ? T.accent : T.border}`, background: checked ? T.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{checked && <span style={{ color: '#111', fontSize: 10 }}>✓</span>}</div>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 12, color: T.text }}>{r.name}</div><div style={{ fontSize: 10, color: T.textTertiary }}>{r.company} · {r.title || 'No title'} · {r.email}</div></div>
                  </div>
                )
              })}
              {searchResults.length === 0 && leadSearch && !searching && <div style={{ padding: 20, textAlign: 'center', color: T.textTertiary, fontSize: 11, fontWeight: 300 }}>No contacts found. Try a different search.</div>}
            </div>
            {selectedLeads.length > 0 && <button onClick={enrollSelected} style={{ width: '100%', padding: '9px 0', borderRadius: T.radiusSm, border: 'none', background: 'rgba(255,224,194,0.10)', color: T.accent, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: T.font }}>Enroll {selectedLeads.length} contact{selectedLeads.length > 1 ? 's' : ''}</button>}
          </div>
        </div>
      )}

      {/* ═══ LAUNCH CONFIRMATION ═══ */}
      {showLaunchConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowLaunchConfirm(false)}>
          <div onClick={e => e.stopPropagation()} style={{ ...glass, padding: 28, width: 440, maxWidth: '90vw', boxShadow: T.glassShadowFloat, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🚀</div>
            <div style={{ fontSize: 17, fontWeight: 500, marginBottom: 8 }}>Launch "{seq?.name}"?</div>
            <div style={{ fontSize: 12, color: T.textTertiary, marginBottom: 20, lineHeight: 1.6, fontWeight: 300 }}>
              {steps.length} steps · {enrollments.length} leads enrolled<br/>
              Emails will be personalised at 6am and sent Mon-Fri 8am-6pm (30/day cap).<br/>
              Timing adapts to each prospect's timezone for optimal open rates.<br/>
              You can pause at any time.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setShowLaunchConfirm(false)} style={{ padding: '10px 20px', borderRadius: T.radiusSm, border: `0.5px solid ${T.border}`, background: 'transparent', color: T.textSecondary, fontSize: 13, cursor: 'pointer', fontFamily: T.font }}>Cancel</button>
              <button onClick={launchCampaign} disabled={launching} style={{ padding: '10px 28px', borderRadius: T.radiusSm, border: 'none', background: 'rgba(45,212,191,0.15)', color: T.success, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.font, boxShadow: T.liquidBtnShadow }}>{launching ? '⏳ Launching...' : '🚀 Go Live'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
