// src/pages/SequenceDetail.jsx — Sequence builder + leads + performance
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Mail, Linkedin, Plus, Clock, Trash2, Save, Sparkles, ArrowLeft, Search, UserPlus, X, ChevronRight } from 'lucide-react'

const T = {
  surface: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)',
  text: 'rgba(255,255,255,0.95)', textSec: 'rgba(255,255,255,0.55)', textTer: 'rgba(255,255,255,0.32)',
  font: "'DM Sans', -apple-system, sans-serif",
  purple: '#7C5CFC', teal: '#00D4AA', red: '#FF4444', amber: '#F59E0B', green: '#4ADE80',
}
const glass = { background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)', border: `1px solid ${T.border}`, borderRadius: 12 }
const APPROACHES = ['authority-led','scarcity-led','social-proof','reciprocity','data-led','intelligence-led','competitive-led','relationship-led']
const PSYCHOLOGY = ['reciprocity','scarcity','authority','social_proof','commitment','liking','strategic_withdrawal','pattern_interrupt']
const VARS = ['{firstName}','{companyName}','{category}','{revenue}','{ceo}','{raceWindow}','{recentNews}','{prevSubject}']

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
  // Leads modal
  const [showAddLeads, setShowAddLeads] = useState(false)
  const [leadSearch, setLeadSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [selectedLeads, setSelectedLeads] = useState([])
  const [searching, setSearching] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)

  useEffect(() => { if (!isNew) load() }, [id])

  async function load() {
    const { data } = await supabase.from('kiko_sequences').select('*').eq('id', id).single()
    if (data) { setSeq(data); setSteps(data.steps || []) }
    const { data: e } = await supabase.from('kiko_sequence_enrollments').select('*').eq('sequence_id', id).order('created_at', { ascending: false })
    setEnrollments(e || [])
    const { data: q } = await supabase.from('kiko_outreach_queue').select('*').in('enrollment_id', (e || []).map(x => x.id)).order('scheduled_for')
    setQueue(q || [])
  }

  async function save() {
    setSaving(true)
    if (isNew) {
      const { data } = await supabase.from('kiko_sequences').insert({ name: seq.name || 'New Campaign', description: seq.description, target_persona: seq.target_persona, steps, is_active: true }).select().single()
      if (data) nav(`/sequences/${data.id}`, { replace: true })
    } else {
      await supabase.from('kiko_sequences').update({ name: seq.name, description: seq.description, target_persona: seq.target_persona, steps, updated_at: new Date().toISOString() }).eq('id', id)
    }
    setSaving(false); setDirty(false)
  }

  function addStep(ch) { 
    const emailTemplate = 'Dear {firstName},\n\n\n\nKind regards,\n\n{signature}'
    const linkedinTemplate = 'Hi {firstName}, '
    setSteps([...steps, { step: steps.length+1, delay_days: steps.length===0?0:3, channel: ch, approach:'authority-led', psychology:'reciprocity', subject: ch==='email' ? 'Haas F1 Team × {category}' : '', template: ch==='email' ? emailTemplate : linkedinTemplate }]); setSelStep(steps.length); setDirty(true) 
  }
  function upd(i, k, v) { const u=[...steps]; u[i]={...u[i],[k]:v}; setSteps(u); setDirty(true) }
  function updAndRegen(i, k, v) { upd(i, k, v); setRegenPrompt(true) }
  const [regenPrompt, setRegenPrompt] = useState(false)
  const [testSending, setTestSending] = useState(false)
  const [testSent, setTestSent] = useState(false)
  function del(i) { setSteps(steps.filter((_,j)=>j!==i).map((s,j)=>({...s,step:j+1}))); if(selStep>=steps.length-1) setSelStep(Math.max(0,steps.length-2)); setDirty(true) }

  async function askKiko(i) {
    const s=steps[i]; if(!s) return; upd(i,'template','⏳ Kiko is writing...')
    try {
      const r = await fetch('/api/kiko', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ message:`Write a ${s.channel==='email'?'outreach email':'300-char LinkedIn message'} for step ${s.step} of a sequence.

STYLE RULES (non-negotiable):
- ${s.channel==='email' ? 'Start with "Dear {firstName}," and end with "Kind regards,\\n\\n{signature}"' : 'Start with "Hi {firstName},"'}
- Write at principal/board level. No generic filler. No "I hope this finds you well".
- Tone: "We work at principal level on the structuring of Formula One partnerships for teams and rights-holders."
- Differentiate: "Our role is not to place sponsorship assets, but to design closed, category-exclusive partnership systems tied to governance, access, and institutional credibility."
- Category-specific: explain WHY this category matters operationally for Formula One, not just as brand exposure.
- Soft CTA: "The relevant question at this stage is simply whether this is strategic from your perspective."
- Subject format uses × not — (e.g. "Haas F1 Team × Cloud Infrastructure")
- 50-125 words for emails. 300 chars max for LinkedIn.

Context: Approach: ${s.approach}. Psychology: ${s.psychology}. Target: ${seq?.target_persona||'C-suite'}. Subject: ${s.subject||'F1 partnership'}.

Return ONLY the message text, nothing else.`, stream:false }) })
      const d = await r.json(); upd(i, 'template', d?.content || d?.message || 'Error')
    } catch { upd(i, 'template', 'Error generating.') }
  }

  async function sendTest(i) {
    const s=steps[i]; if(!s||s.channel!=='email') return
    setTestSending(true); setTestSent(false)
    try {
      const category = seq?.name?.split(' - ')[1]||'Category'
      const body = (s.template||'').replace(/\{firstName\}/g,'Sunny').replace(/\{lastName\}/g,'Sidhu').replace(/\{companyName\}/g,'Test Company').replace(/\{category\}/g,category).replace(/\{revenue\}/g,'$1B').replace(/\{ceo\}/g,'CEO Name').replace(/\{raceWindow\}/g,'Miami Grand Prix').replace(/\{recentNews\}/g,'recent development').replace(/\{prevSubject\}/g,'Previous subject').replace(/\{signature\}/g,'Sunny Sidhu\nCEO, Van Hawke Group\nsunny@vanhawke.agency')
      const subject = '[TEST] '+(s.subject||'Test').replace(/\{category\}/g,category)
      const r = await fetch('/api/gmail-draft', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ to:'sunny@vanhawke.agency', subject, body }) })
      if(r.ok) { setTestSent(true); setTimeout(()=>setTestSent(false),5000) }
      else { alert('Draft creation failed') }
    } catch(err) { alert('Error: '+err.message) }
    setTestSending(false)
  }

  async function searchContacts() {
    if (!leadSearch.trim()) return; setSearching(true)
    const { data } = await supabase.from('contacts').select('id,data').or(`data->>company.ilike.%${leadSearch}%,data->>title.ilike.%${leadSearch}%`).limit(30)
    const results = (data||[]).map(c => ({ id:c.id, name:[c.data?.firstName,c.data?.lastName].filter(Boolean).join(' ')||'Unknown', email:c.data?.email, company:c.data?.company, title:c.data?.title, linkedin:c.data?.linkedin })).filter(r => r.email)
    setSearchResults(results); setSearching(false)
  }

  async function autoSuggestLeads() {
    if (!seq?.name) return; setLoadingSuggestions(true)
    // Extract category from campaign name (e.g. "Haas F1 - Cybersecurity" → "Cybersecurity")
    const category = seq.name.split(' - ')[1] || seq.name
    // Search company_intelligence for companies matching the category
    const { data: intel } = await supabase.from('company_intelligence').select('company_name,industry,sub_sector,sponsorship_fit_score').or(`industry.ilike.%${category}%,sub_sector.ilike.%${category}%`).order('sponsorship_fit_score', { ascending: false }).limit(20)
    // Also search contacts directly by company category keywords
    const categoryWords = category.toLowerCase().split(/[\s\/&]+/).filter(w => w.length > 3)
    const queries = categoryWords.map(w => `data->>company.ilike.%${w}%`).join(',')
    const { data: contacts } = await supabase.from('contacts').select('id,data').or(queries || `data->>company.ilike.%${category}%`).limit(50)
    const enrolledEmails = new Set(enrollments.map(e => e.contact_email?.toLowerCase()))
    const results = (contacts||[]).map(c => ({ id:c.id, name:[c.data?.firstName,c.data?.lastName].filter(Boolean).join(' ')||'Unknown', email:c.data?.email, company:c.data?.company, title:c.data?.title, linkedin:c.data?.linkedin })).filter(r => r.email && !enrolledEmails.has(r.email.toLowerCase()))
    setSuggestions(results); setLoadingSuggestions(false)
  }

  async function enrollSelected() {
    for (const lead of selectedLeads) {
      const firstStep = steps[0]
      await supabase.from('kiko_sequence_enrollments').insert({
        sequence_id: id, contact_email: lead.email, contact_name: lead.name,
        company: lead.company, current_step: 1, status: 'active',
        next_send_at: new Date(Date.now() + (firstStep?.delay_days||0)*86400000).toISOString()
      })
    }
    setShowAddLeads(false); setSelectedLeads([]); setSearchResults([]); setLeadSearch(''); load()
  }

  async function pauseEnr(eid) { await supabase.from('kiko_sequence_enrollments').update({status:'paused'}).eq('id',eid); await supabase.from('kiko_outreach_queue').update({status:'cancelled'}).eq('enrollment_id',eid).eq('status','queued'); load() }
  async function cancelEnr(eid) { await supabase.from('kiko_sequence_enrollments').update({status:'cancelled'}).eq('id',eid); await supabase.from('kiko_outreach_queue').update({status:'cancelled'}).eq('enrollment_id',eid).eq('status','queued'); load() }

  const cur = steps[selStep]
  const tabs = [{id:'sequence',label:'Sequence'},{id:'leads',label:'Leads',ct:enrollments.length},{id:'performance',label:'Performance'}]

  return (
    <div style={{ padding:'20px 28px', fontFamily:T.font, color:T.text, maxWidth:1300, margin:'0 auto' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
        <button onClick={()=>nav('/sequences')} style={{background:'none',border:'none',color:T.textSec,cursor:'pointer',padding:4}}><ArrowLeft size={18}/></button>
        <input value={seq?.name||''} onChange={e=>{setSeq({...seq,name:e.target.value});setDirty(true)}} placeholder="Campaign name..." style={{fontSize:20,fontWeight:500,background:'none',border:'none',color:T.text,fontFamily:T.font,outline:'none',flex:1}}/>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {dirty && <span style={{fontSize:11,color:T.amber}}>Unsaved</span>}
          <button onClick={save} disabled={saving} style={{padding:'7px 16px',borderRadius:6,border:'none',background:T.purple,color:'#fff',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:T.font,opacity:saving?0.5:1,display:'flex',alignItems:'center',gap:5}}><Save size={12}/>{saving?'Saving...':'Save'}</button>
        </div>
      </div>
      <input value={seq?.target_persona||''} onChange={e=>{setSeq({...seq,target_persona:e.target.value});setDirty(true)}} placeholder="Target persona" style={{width:'100%',padding:'6px 10px',borderRadius:6,border:`1px solid ${T.border}`,background:'transparent',color:T.textSec,fontSize:12,fontFamily:T.font,outline:'none',marginBottom:14,boxSizing:'border-box'}}/>

      {/* Tabs */}
      <div style={{display:'flex',gap:2,marginBottom:14,background:T.surface,borderRadius:8,padding:3,width:'fit-content'}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:'6px 14px',borderRadius:6,border:'none',cursor:'pointer',fontFamily:T.font,fontSize:12,background:tab===t.id?'rgba(255,255,255,0.08)':'transparent',color:tab===t.id?T.text:T.textSec,display:'flex',alignItems:'center',gap:5}}>
            {t.label}{t.ct!==undefined&&<span style={{fontSize:10,padding:'1px 5px',borderRadius:3,background:'rgba(124,92,252,0.1)',color:T.purple}}>{t.ct}</span>}
          </button>
        ))}
      </div>

      {/* ═══ SEQUENCE TAB ═══ */}
      {tab==='sequence'&&(
        <div style={{display:'grid',gridTemplateColumns:'300px 1fr',gap:14,minHeight:480}}>
          {/* Left — Flow */}
          <div style={{...glass,padding:14,overflowY:'auto'}}>
            <div style={{textAlign:'center',padding:'6px 0 12px',fontSize:11,color:T.textTer,borderBottom:`1px solid ${T.border}`,marginBottom:8}}>Sequence start</div>
            {steps.map((s,i)=>{
              const isLI = s.channel==='linkedin'
              const sel = i===selStep
              return(<div key={i}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:'4px 0'}}>
                  <div style={{width:1,height:12,background:T.border}}/>
                </div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:4,marginBottom:3}}>
                  <Clock size={9} style={{color:T.textTer}}/>
                  <select value={s.delay_days} onChange={e=>upd(i,'delay_days',+e.target.value)} style={{background:'transparent',border:'none',color:T.amber,fontSize:10,fontFamily:T.font,cursor:'pointer',outline:'none'}}>
                    <option value={0} style={{background:'#111'}}>Immediately</option>
                    {[1,2,3,4,5,7,10,14].map(d=><option key={d} value={d} style={{background:'#111'}}>Wait {d}d</option>)}
                  </select>
                </div>
                <div onClick={()=>setSelStep(i)} style={{...glass,padding:'8px 10px',cursor:'pointer',borderColor:sel?T.purple:T.border,background:sel?'rgba(124,92,252,0.05)':glass.background,transition:'all 0.15s'}}>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <div style={{width:20,height:20,borderRadius:5,background:isLI?'rgba(0,119,181,0.12)':'rgba(124,92,252,0.1)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                      {isLI?<Linkedin size={10} style={{color:'#0077B5'}}/>:<Mail size={10} style={{color:T.purple}}/>}
                    </div>
                    <span style={{fontSize:11,fontWeight:500,flex:1}}>{isLI?'LinkedIn':'Email'} {i+1}</span>
                    <button onClick={e=>{e.stopPropagation();del(i)}} style={{background:'none',border:'none',color:T.textTer,cursor:'pointer',padding:1}}><Trash2 size={10}/></button>
                  </div>
                  {s.subject&&<div style={{fontSize:10,color:T.textTer,marginTop:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.subject}</div>}
                </div>
              </div>)
            })}
            <div style={{display:'flex',gap:6,justifyContent:'center',marginTop:12,paddingTop:10,borderTop:`1px solid ${T.border}`}}>
              <button onClick={()=>addStep('email')} style={{display:'flex',alignItems:'center',gap:3,padding:'5px 10px',borderRadius:5,border:`1px solid ${T.border}`,background:'transparent',color:T.textSec,fontSize:10,cursor:'pointer',fontFamily:T.font}}><Plus size={10}/>Email</button>
              <button onClick={()=>addStep('linkedin')} style={{display:'flex',alignItems:'center',gap:3,padding:'5px 10px',borderRadius:5,border:`1px solid ${T.border}`,background:'transparent',color:T.textSec,fontSize:10,cursor:'pointer',fontFamily:T.font}}><Plus size={10}/>LinkedIn</button>
            </div>
          </div>

          {/* Right — Step editor */}
          <div style={{...glass,padding:18}}>
            {cur?(
              <>
                <div style={{fontSize:13,fontWeight:500,marginBottom:14,display:'flex',alignItems:'center',gap:6}}>
                  {cur.channel==='linkedin'?<Linkedin size={14} style={{color:'#0077B5'}}/>:<Mail size={14} style={{color:T.purple}}/>}
                  Step {selStep+1} · {cur.channel==='email'?'Email':'LinkedIn message'}
                </div>
                <div style={{display:'flex',gap:6,marginBottom:12}}>
                  {[{id:'email',icon:Mail,c:T.purple},{id:'linkedin',icon:Linkedin,c:'#0077B5'}].map(ch=>(
                    <button key={ch.id} onClick={()=>upd(selStep,'channel',ch.id)} style={{padding:'4px 10px',borderRadius:5,border:`1px solid ${cur.channel===ch.id?ch.c:T.border}`,background:cur.channel===ch.id?`${ch.c}10`:'transparent',color:cur.channel===ch.id?ch.c:T.textTer,fontSize:11,cursor:'pointer',fontFamily:T.font,display:'flex',alignItems:'center',gap:4}}><ch.icon size={11}/>{ch.id}</button>
                  ))}
                </div>
                <div style={{display:'flex',gap:8,marginBottom:12}}>
                  <div style={{flex:1}}>
                    <label style={{fontSize:10,color:T.textTer,marginBottom:2,display:'block'}}>Approach</label>
                    <select value={cur.approach||''} onChange={e=>updAndRegen(selStep,'approach',e.target.value)} style={{width:'100%',padding:'5px 6px',borderRadius:5,border:`1px solid ${T.border}`,background:T.surface,color:T.textSec,fontSize:11,fontFamily:T.font,outline:'none'}}>{APPROACHES.map(a=><option key={a} value={a} style={{background:'#111'}}>{a}</option>)}</select>
                  </div>
                  <div style={{flex:1}}>
                    <label style={{fontSize:10,color:T.textTer,marginBottom:2,display:'block'}}>Psychology</label>
                    <select value={cur.psychology||''} onChange={e=>updAndRegen(selStep,'psychology',e.target.value)} style={{width:'100%',padding:'5px 6px',borderRadius:5,border:`1px solid ${T.border}`,background:T.surface,color:T.textSec,fontSize:11,fontFamily:T.font,outline:'none'}}>{PSYCHOLOGY.map(p=><option key={p} value={p} style={{background:'#111'}}>{p.replace(/_/g,' ')}</option>)}</select>
                  </div>
                </div>
                {cur.channel==='email'&&<div style={{marginBottom:12}}>
                  <label style={{fontSize:10,color:T.textTer,marginBottom:2,display:'block'}}>Subject</label>
                  <input value={cur.subject||''} onChange={e=>upd(selStep,'subject',e.target.value)} placeholder="Haas F1 Team × {category}" style={{width:'100%',padding:'7px 10px',borderRadius:6,border:`1px solid ${T.border}`,background:T.surface,color:T.text,fontSize:12,fontFamily:T.font,outline:'none',boxSizing:'border-box'}}/>
                </div>}
                {regenPrompt&&<div style={{padding:'8px 12px',borderRadius:6,background:'rgba(245,158,11,0.06)',border:'1px solid rgba(245,158,11,0.15)',marginBottom:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:11,color:T.amber}}>Approach changed — regenerate content?</span>
                  <div style={{display:'flex',gap:6}}>
                    <button onClick={()=>{askKiko(selStep);setRegenPrompt(false)}} style={{padding:'4px 10px',borderRadius:4,border:'none',background:T.purple,color:'#fff',fontSize:10,cursor:'pointer',fontFamily:T.font}}>Regenerate</button>
                    <button onClick={()=>setRegenPrompt(false)} style={{padding:'4px 10px',borderRadius:4,border:`1px solid ${T.border}`,background:'transparent',color:T.textTer,fontSize:10,cursor:'pointer',fontFamily:T.font}}>Keep</button>
                  </div>
                </div>}
                <div style={{marginBottom:10}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:2}}>
                    <label style={{fontSize:10,color:T.textTer}}>{cur.channel==='email'?'Email body':'Message'}</label>
                    <span style={{fontSize:10,color:T.textTer}}>{(cur.template||'').length}{cur.channel==='linkedin'?' / 300':''}</span>
                  </div>
                  <textarea value={cur.template||''} onChange={e=>upd(selStep,'template',e.target.value)} placeholder={cur.channel==='email'?'Dear {firstName},\n\nAt this level...':'Hi {firstName}, I advise F1 teams...'} rows={cur.channel==='email'?10:3} maxLength={cur.channel==='linkedin'?300:undefined} style={{width:'100%',padding:'8px 10px',borderRadius:6,border:`1px solid ${T.border}`,background:T.surface,color:T.text,fontSize:12,fontFamily:T.font,outline:'none',resize:'vertical',lineHeight:1.6,boxSizing:'border-box'}}/>
                </div>
                <div style={{marginBottom:12}}>
                  <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
                    {VARS.map(v=><button key={v} onClick={()=>upd(selStep,'template',(cur.template||'')+v)} style={{padding:'2px 6px',borderRadius:3,border:`1px solid ${T.border}`,background:'transparent',color:T.purple,fontSize:9,cursor:'pointer',fontFamily:T.font}}>{v}</button>)}
                  </div>
                </div>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>askKiko(selStep)} style={{display:'flex',alignItems:'center',gap:5,padding:'7px 14px',borderRadius:6,border:`1px solid rgba(124,92,252,0.3)`,background:'rgba(124,92,252,0.06)',color:T.purple,fontSize:11,cursor:'pointer',fontFamily:T.font,flex:1,justifyContent:'center'}}><Sparkles size={12}/>Ask Kiko to write this step</button>
                  {cur.channel==='email'&&<button onClick={()=>sendTest(selStep)} disabled={testSending} style={{display:'flex',alignItems:'center',gap:5,padding:'7px 14px',borderRadius:6,border:`1px solid ${testSent?'rgba(74,222,128,0.3)':T.border}`,background:testSent?'rgba(74,222,128,0.06)':'transparent',color:testSent?T.green:T.textSec,fontSize:11,cursor:'pointer',fontFamily:T.font,whiteSpace:'nowrap'}}>{testSending?'Sending...':testSent?'✓ Sent to inbox':'📧 Send test'}</button>}
                </div>
              </>
            ):(
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:300,color:T.textTer,fontSize:12,gap:10}}>
                <span>Add a step to start building</span>
                <div style={{display:'flex',gap:6}}>
                  <button onClick={()=>addStep('email')} style={{padding:'6px 12px',borderRadius:5,border:`1px solid ${T.purple}`,background:`${T.purple}10`,color:T.purple,fontSize:11,cursor:'pointer',fontFamily:T.font}}>+ Email</button>
                  <button onClick={()=>addStep('linkedin')} style={{padding:'6px 12px',borderRadius:5,border:'1px solid #0077B5',background:'rgba(0,119,181,0.1)',color:'#0077B5',fontSize:11,cursor:'pointer',fontFamily:T.font}}>+ LinkedIn</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ LEADS TAB ═══ */}
      {tab==='leads'&&(
        <div>
          <div style={{...glass,overflow:'hidden'}}>
            <div style={{padding:'12px 16px',borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:13,fontWeight:500}}>Leads · {enrollments.length} enrolled</span>
              <div style={{display:'flex',gap:6}}>
                <button onClick={autoSuggestLeads} disabled={loadingSuggestions} style={{padding:'5px 12px',borderRadius:5,border:`1px solid ${T.border}`,background:T.surface,color:T.teal,fontSize:11,cursor:'pointer',fontFamily:T.font,display:'flex',alignItems:'center',gap:4}}><Sparkles size={12}/>{loadingSuggestions?'Finding...':'Kiko, find leads'}</button>
                <button onClick={()=>setShowAddLeads(true)} style={{padding:'5px 12px',borderRadius:5,border:'none',background:T.purple,color:'#fff',fontSize:11,cursor:'pointer',fontFamily:T.font,display:'flex',alignItems:'center',gap:4}}><UserPlus size={12}/>Add from CRM</button>
              </div>
            </div>
            {/* Kiko suggestions */}
            {suggestions.length>0&&(
              <div style={{padding:'10px 16px',borderBottom:`1px solid ${T.border}`,background:'rgba(0,212,170,0.03)'}}>
                <div style={{fontSize:11,color:T.teal,marginBottom:8,display:'flex',alignItems:'center',gap:4}}><Sparkles size={11}/>Kiko found {suggestions.length} potential leads for this campaign</div>
                <div style={{maxHeight:200,overflowY:'auto'}}>
                  {suggestions.map(s=>{
                    const checked=selectedLeads.some(l=>l.id===s.id)
                    return(
                      <div key={s.id} onClick={()=>checked?setSelectedLeads(selectedLeads.filter(l=>l.id!==s.id)):setSelectedLeads([...selectedLeads,s])} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 8px',cursor:'pointer',borderRadius:4,background:checked?'rgba(124,92,252,0.04)':'transparent'}}>
                        <div style={{width:14,height:14,borderRadius:3,border:`1px solid ${checked?T.purple:T.border}`,background:checked?T.purple:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{checked&&<span style={{color:'#fff',fontSize:9}}>✓</span>}</div>
                        <span style={{fontSize:11,color:T.text,minWidth:100}}>{s.name}</span>
                        <span style={{fontSize:10,color:T.textTer,flex:1}}>{s.company} · {s.title||'—'}</span>
                        <span style={{fontSize:10,color:T.textTer}}>{s.email}</span>
                      </div>
                    )
                  })}
                </div>
                {selectedLeads.length>0&&<button onClick={enrollSelected} style={{marginTop:8,padding:'6px 14px',borderRadius:5,border:'none',background:T.purple,color:'#fff',fontSize:11,cursor:'pointer',fontFamily:T.font}}>Enroll {selectedLeads.length} contact{selectedLeads.length>1?'s':''}</button>}
              </div>
            )}
            {/* Enrolled leads table */}
            {enrollments.length?(<div>
              <div style={{display:'flex',padding:'8px 16px',borderBottom:`1px solid ${T.border}`,fontSize:10,color:T.textTer,fontWeight:500}}>
                <span style={{flex:1}}>Name</span><span style={{width:120}}>Company</span><span style={{width:80,textAlign:'center'}}>Step</span><span style={{width:70,textAlign:'center'}}>Status</span><span style={{width:70,textAlign:'right'}}>Next</span><span style={{width:100}}></span>
              </div>
              {enrollments.map(e=>(
              <div key={e.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',borderBottom:`1px solid ${T.border}`,fontSize:12}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:e.status==='active'?T.teal:e.status==='replied'?T.green:e.status==='bounced'?T.red:T.textTer}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:T.text}}>{e.contact_name||e.contact_email}</div>
                  <div style={{fontSize:10,color:T.textTer}}>{e.company}</div>
                </div>
                <div style={{width:70,textAlign:'center'}}>
                  <div style={{fontSize:11,color:T.textSec}}>Step {e.current_step}/{steps.length}</div>
                  <div style={{height:3,background:T.border,borderRadius:2,marginTop:3}}><div style={{height:'100%',borderRadius:2,background:e.status==='active'?T.teal:T.green,width:`${(e.current_step/Math.max(steps.length,1))*100}%`}}/></div>
                </div>
                <span style={{fontSize:10,color:T.textTer,width:50}}>{e.status}</span>
                <span style={{fontSize:10,color:T.textTer,width:50}}>{e.next_send_at?new Date(e.next_send_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'}):'—'}</span>
                {e.status==='active'&&<button onClick={()=>pauseEnr(e.id)} style={{padding:'3px 6px',borderRadius:3,border:`1px solid ${T.border}`,background:'transparent',color:T.textSec,fontSize:9,cursor:'pointer'}}>Pause</button>}
                {(e.status==='active'||e.status==='paused')&&<button onClick={()=>cancelEnr(e.id)} style={{padding:'3px 6px',borderRadius:3,border:'1px solid rgba(255,68,68,0.2)',background:'transparent',color:T.red,fontSize:9,cursor:'pointer'}}>Cancel</button>}
              </div>
            ))}
            </div>):<div style={{padding:40,textAlign:'center',color:T.textTer,fontSize:12}}>No leads enrolled. Click "Kiko, find leads" or "Add from CRM".</div>}
          </div>

          {/* Add Leads Modal */}
          {showAddLeads&&(
            <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}} onClick={()=>setShowAddLeads(false)}>
              <div onClick={e=>e.stopPropagation()} style={{...glass,padding:24,width:500,maxWidth:'90vw',maxHeight:'70vh',display:'flex',flexDirection:'column'}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:14}}>
                  <div style={{fontSize:15,fontWeight:500}}>Add leads from CRM</div>
                  <button onClick={()=>setShowAddLeads(false)} style={{background:'none',border:'none',color:T.textTer,cursor:'pointer'}}><X size={16}/></button>
                </div>
                <div style={{display:'flex',gap:6,marginBottom:14}}>
                  <input value={leadSearch} onChange={e=>setLeadSearch(e.target.value)} onKeyDown={e=>e.key==='Enter'&&searchContacts()} placeholder="Search by company name..." style={{flex:1,padding:'8px 10px',borderRadius:6,border:`1px solid ${T.border}`,background:T.surface,color:T.text,fontSize:12,fontFamily:T.font,outline:'none'}}/>
                  <button onClick={searchContacts} disabled={searching} style={{padding:'8px 14px',borderRadius:6,border:'none',background:T.purple,color:'#fff',fontSize:11,cursor:'pointer',fontFamily:T.font}}><Search size={12}/></button>
                </div>
                <div style={{flex:1,overflowY:'auto',marginBottom:14}}>
                  {searchResults.map(r=>{
                    const checked=selectedLeads.some(l=>l.id===r.id)
                    return(
                      <div key={r.id} onClick={()=>checked?setSelectedLeads(selectedLeads.filter(l=>l.id!==r.id)):setSelectedLeads([...selectedLeads,r])} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderBottom:`1px solid ${T.border}`,cursor:'pointer',background:checked?'rgba(124,92,252,0.04)':'transparent'}}>
                        <div style={{width:16,height:16,borderRadius:3,border:`1px solid ${checked?T.purple:T.border}`,background:checked?T.purple:'transparent',display:'flex',alignItems:'center',justifyContent:'center'}}>{checked&&<span style={{color:'#fff',fontSize:10}}>✓</span>}</div>
                        <div style={{flex:1}}>
                          <div style={{fontSize:12,color:T.text}}>{r.name}</div>
                          <div style={{fontSize:10,color:T.textTer}}>{r.company} · {r.title||'No title'} · {r.email}</div>
                        </div>
                      </div>
                    )
                  })}
                  {searchResults.length===0&&leadSearch&&!searching&&<div style={{padding:20,textAlign:'center',color:T.textTer,fontSize:11}}>No contacts found. Try a different company name.</div>}
                </div>
                {selectedLeads.length>0&&<button onClick={enrollSelected} style={{width:'100%',padding:'9px 0',borderRadius:6,border:'none',background:T.purple,color:'#fff',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:T.font}}>Enroll {selectedLeads.length} contact{selectedLeads.length>1?'s':''}</button>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ PERFORMANCE TAB ═══ */}
      {tab==='performance'&&(
        <div>
          {enrollments.length>0?(
            <>
              <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:10,marginBottom:16}}>
                {[{l:'Enrolled',v:enrollments.length,c:T.purple},{l:'Active',v:enrollments.filter(e=>e.status==='active').length,c:T.teal},{l:'Replied',v:enrollments.filter(e=>e.status==='replied').length,c:T.green},{l:'Reply rate',v:`${enrollments.length?Math.round(enrollments.filter(e=>e.status==='replied').length/enrollments.length*100):0}%`,c:T.amber},{l:'Bounced',v:enrollments.filter(e=>e.status==='bounced').length,c:T.red}].map((s,i)=>(
                  <div key={i} style={{...glass,padding:'14px 16px',textAlign:'center'}}>
                    <div style={{fontSize:24,fontWeight:500,color:s.c}}>{s.v}</div>
                    <div style={{fontSize:10,color:T.textTer}}>{s.l}</div>
                  </div>
                ))}
              </div>
              <div style={{...glass,overflow:'hidden'}}>
                <div style={{padding:'10px 14px',borderBottom:`1px solid ${T.border}`,fontSize:12,fontWeight:500}}>Step breakdown</div>
                {steps.map((s,i)=>{
                  const sentQ = queue.filter(q=>q.step_number===i+1&&q.status==='sent').length
                  return(
                    <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 14px',borderBottom:`1px solid ${T.border}`,fontSize:11}}>
                      <div style={{width:20,height:20,borderRadius:5,background:s.channel==='linkedin'?'rgba(0,119,181,0.12)':'rgba(124,92,252,0.1)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                        {s.channel==='linkedin'?<Linkedin size={9} style={{color:'#0077B5'}}/>:<Mail size={9} style={{color:T.purple}}/>}
                      </div>
                      <span style={{flex:1,color:T.textSec}}>Step {i+1}: {s.approach}</span>
                      <span style={{color:T.textSec}}>{sentQ} sent</span>
                    </div>
                  )
                })}
              </div>
            </>
          ):(
            <div style={{...glass,padding:40,textAlign:'center',color:T.textTer,fontSize:12}}>No data yet. Enroll leads and launch the campaign to see performance.</div>
          )}
        </div>
      )}
    </div>
  )
}
