// src/pages/Sequences.jsx — Clean campaign list
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Plus, Sparkles, X, Mail, Linkedin, ChevronRight, Play, Pause } from 'lucide-react'

const T = {
  surface: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)',
  text: 'rgba(255,255,255,0.95)', textSec: 'rgba(255,255,255,0.55)', textTer: 'rgba(255,255,255,0.32)',
  font: "'DM Sans', -apple-system, sans-serif",
  purple: '#7C5CFC', teal: '#00D4AA', red: '#FF4444', amber: '#F59E0B', green: '#4ADE80',
}
const glass = { background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)', border: `1px solid ${T.border}`, borderRadius: 12 }

export default function Sequences() {
  const navigate = useNavigate()
  const [sequences, setSequences] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [showWizard, setShowWizard] = useState(false)
  const [wizCategory, setWizCategory] = useState('')
  const [wizTeam, setWizTeam] = useState('Haas F1 Team')
  const [wizPersona, setWizPersona] = useState('')
  const [generating, setGenerating] = useState(false)

  useEffect(() => { load() }, [])
  async function load() {
    const { data: s } = await supabase.from('kiko_sequences').select('*').order('created_at', { ascending: false })
    const { data: e } = await supabase.from('kiko_sequence_enrollments').select('*')
    setSequences(s || []); setEnrollments(e || [])
  }

  async function generate() {
    if (!wizCategory) return
    setGenerating(true)
    try {
      const res = await fetch('/api/generate-sequence', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: wizCategory, team: wizTeam, persona: wizPersona || undefined, numSteps: 7 }) })
      const data = await res.json()
      if (data.ok && data.id) { setShowWizard(false); navigate(`/sequences/${data.id}`) }
      else alert(data.error || 'Generation failed — check console')
    } catch (err) { alert(err.message) }
    setGenerating(false)
  }

  const totalEnrolled = enrollments.length
  const totalActive = enrollments.filter(e => e.status === 'active').length
  const totalReplied = enrollments.filter(e => e.status === 'replied').length

  return (
    <div style={{ padding: '24px 28px', fontFamily: T.font, color: T.text, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 500, margin: 0 }}>Campaigns</h1>
          {totalEnrolled > 0 && <p style={{ fontSize: 12, color: T.textTer, margin: '4px 0 0' }}>{totalActive} active · {totalReplied} replied · {totalEnrolled} total enrolled</p>}
        </div>
        <button onClick={() => setShowWizard(true)} style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: T.purple, color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={14} /> Generate Campaign
        </button>
      </div>

      {/* Campaign cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sequences.map(seq => {
          const steps = seq.steps || []
          const emails = steps.filter(s => s.channel === 'email').length
          const linkedin = steps.filter(s => s.channel === 'linkedin').length
          const totalDays = steps.reduce((sum, s) => sum + (s.delay_days || 0), 0)
          const enr = enrollments.filter(e => e.sequence_id === seq.id)
          const replied = enr.filter(e => e.status === 'replied').length
          const active = enr.filter(e => e.status === 'active').length
          const rate = enr.length > 0 ? Math.round(replied / enr.length * 100) : null
          return (
            <div key={seq.id} onClick={() => navigate(`/sequences/${seq.id}`)} style={{ ...glass, padding: '16px 20px', cursor: 'pointer', transition: 'border-color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 2 }}>{seq.name}</div>
                  <div style={{ fontSize: 11, color: T.textTer }}>
                    {emails} email{emails !== 1 ? 's' : ''} + {linkedin} LinkedIn · {totalDays} days · {steps[0]?.approach || 'authority-led'}
                  </div>
                </div>
                <div style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: seq.is_active ? 'rgba(74,222,128,0.1)' : 'rgba(255,68,68,0.1)', color: seq.is_active ? T.green : T.red }}>{seq.is_active ? 'Active' : 'Paused'}</div>
              </div>
              {/* Step flow preview */}
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 8 }}>
                {steps.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <div style={{ width: 20, height: 20, borderRadius: 5, background: s.channel === 'linkedin' ? 'rgba(0,119,181,0.12)' : 'rgba(124,92,252,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {s.channel === 'linkedin' ? <Linkedin size={10} style={{ color: '#0077B5' }} /> : <Mail size={10} style={{ color: T.purple }} />}
                    </div>
                    {i < steps.length - 1 && <ChevronRight size={8} style={{ color: T.textTer }} />}
                  </div>
                ))}
              </div>
              {/* Metrics */}
              {enr.length > 0 ? (
                <div style={{ display: 'flex', gap: 16, fontSize: 11, color: T.textSec }}>
                  <span>{enr.length} enrolled</span>
                  <span style={{ color: T.teal }}>{active} active</span>
                  <span style={{ color: T.green }}>{replied} replied</span>
                  {rate !== null && <span style={{ color: T.amber }}>{rate}% reply rate</span>}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: T.textTer }}>No leads enrolled yet — click to add contacts</div>
              )}
            </div>
          )
        })}
        {!sequences.length && (
          <div style={{ ...glass, padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: T.textSec, marginBottom: 8 }}>No campaigns yet</div>
            <div style={{ fontSize: 12, color: T.textTer }}>Click "Generate Campaign" to create your first sequence</div>
          </div>
        )}
      </div>

      {/* Generate Campaign Wizard */}
      {showWizard && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowWizard(false)}>
          <div onClick={e => e.stopPropagation()} style={{ ...glass, padding: 28, width: 460, maxWidth: '90vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}><Sparkles size={16} style={{ color: T.purple }} /> Generate campaign</div>
                <div style={{ fontSize: 12, color: T.textTer, marginTop: 2 }}>Kiko creates a 7-touch sequence using research-backed psychology</div>
              </div>
              <button onClick={() => setShowWizard(false)} style={{ background: 'none', border: 'none', color: T.textTer, cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: T.textTer, display: 'block', marginBottom: 4 }}>Category *</label>
              <input value={wizCategory} onChange={e => setWizCategory(e.target.value)} placeholder="e.g. Cybersecurity, Cloud, CRM, AI/ML" autoFocus style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 13, fontFamily: T.font, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: T.textTer, display: 'block', marginBottom: 4 }}>F1 Team</label>
              <select value={wizTeam} onChange={e => setWizTeam(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 13, fontFamily: T.font, outline: 'none' }}>
                {['Haas F1 Team','Alpine F1 Team','Aston Martin F1 Team'].map(t => <option key={t} value={t} style={{ background: '#111' }}>{t}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 11, color: T.textTer, display: 'block', marginBottom: 4 }}>Target persona (optional)</label>
              <input value={wizPersona} onChange={e => setWizPersona(e.target.value)} placeholder="Auto: C-suite at $500M-$5B companies" style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.textSec, fontSize: 13, fontFamily: T.font, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ padding: 10, borderRadius: 6, background: 'rgba(124,92,252,0.05)', border: '1px solid rgba(124,92,252,0.12)', marginBottom: 16, fontSize: 11, color: T.textSec, lineHeight: 1.5 }}>
              4 emails + 3 LinkedIn touches over 14 days. Cialdini psychology progression. Race calendar awareness. Van Hawke communication style.
            </div>
            <button onClick={generate} disabled={generating || !wizCategory} style={{ width: '100%', padding: '10px 0', borderRadius: 6, border: 'none', background: generating ? T.surface : T.purple, color: generating ? T.textTer : '#fff', fontSize: 13, fontWeight: 500, cursor: generating ? 'default' : 'pointer', fontFamily: T.font }}>
              {generating ? '⏳ Generating...' : '✨ Generate & open'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
