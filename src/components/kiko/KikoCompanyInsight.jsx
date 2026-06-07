// KikoCompanyInsight.jsx — Redesign intelligence card for organisation detail
// Shows partnership conflicts, company research, warm path, and enrichment data

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Building2, ChevronDown, ChevronUp, Sparkles, AlertTriangle, Users } from 'lucide-react'
import { usePartnershipConflict } from '@/hooks/usePartnershipConflict'

const T = {
  font: "'Inter', system-ui, sans-serif",
  text: '#0A0A0A', textSec: '#6B6B6B', textTer: '#A0A0A0',
  border: 'rgba(0,0,0,0.08)', accent: '#0A0A0A',
  sage: '#7d8a64', terra: '#b8643e', amber: '#B89C5C',
}

export default function KikoCompanyInsight({ companyName }) {
  const [knowledge, setKnowledge] = useState([])
  const [warmPath, setWarmPath] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)
  const [analysing, setAnalysing] = useState(false)
  const [analysis, setAnalysis] = useState(null)
  const { conflict } = usePartnershipConflict(companyName)

  useEffect(() => {
    if (!companyName) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [knowRes, warmRes] = await Promise.all([
          supabase.from('kiko_knowledge')
            .select('title, content, category, created_at')
            .or(`title.ilike.%${companyName}%,content.ilike.%${companyName}%`)
            .order('created_at', { ascending: false }).limit(3),
          supabase.from('kiko_relationships')
            .select('contact_name, warmth, notes, relationship_type')
            .ilike('notes', `%${companyName}%`)
            .order('warmth', { ascending: false }).limit(3),
        ])
        if (!cancelled) {
          setKnowledge(knowRes.data || [])
          setWarmPath(warmRes.data || [])
        }
      } catch (e) { console.error('[KikoCompanyInsight]', e) }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [companyName])

  const requestAnalysis = async () => {
    setAnalysing(true)
    try {
      const res = await fetch('https://api.vanhawke.agency/api/kiko', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Give me a brief strategic analysis of ${companyName} as a potential F1 sponsorship partner. Include: their industry position, why F1 makes sense for them, which category they'd fit, and any partnership conflicts. Be concise.`,
          userEmail: 'sunny@vanhawke.com',
          currentPage: 'organisations',
        }),
      })
      const data = await res.json()
      if (data?.message) setAnalysis(data.message)
    } catch (e) { console.error('[CompanyAnalysis]', e) }
    setAnalysing(false)
  }

  if (loading) return null

  const card = { background: '#FFFFFF', border: `1px solid ${T.border}`, borderRadius: 14, padding: '16px 20px', fontFamily: T.font }

  return (
    <div style={card}>
      <div onClick={() => setExpanded(!expanded)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Building2 style={{ width: 14, height: 14, color: T.textSec }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: T.text, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Company Intelligence</span>
          {conflict?.exists && (
            <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 4, background: 'rgba(184,100,62,0.10)', color: T.terra, display: 'flex', alignItems: 'center', gap: 3 }}>
              <AlertTriangle style={{ width: 9, height: 9 }} /> CONFLICT
            </span>
          )}
        </div>
        {expanded ? <ChevronUp style={{ width: 14, height: 14, color: T.textTer }} /> : <ChevronDown style={{ width: 14, height: 14, color: T.textTer }} />}
      </div>

      {expanded && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Partnership conflicts */}
          {conflict?.exists && (
            <div style={{ padding: '8px 12px', background: 'rgba(184,100,62,0.04)', borderRadius: 8, border: '1px solid rgba(184,100,62,0.12)' }}>
              <p style={{ fontSize: 11, fontWeight: 500, color: T.terra, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>Partnership Conflicts</p>
              <p style={{ fontSize: 13, color: T.textSec, margin: 0, lineHeight: 1.5 }}>{conflict.summary}</p>
            </div>
          )}

          {/* Warm path — contacts who can introduce */}
          {warmPath.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 500, color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Users style={{ width: 10, height: 10 }} /> Warm Path
              </p>
              {warmPath.map((w, i) => (
                <p key={i} style={{ fontSize: 12, color: T.textSec, margin: '2px 0', lineHeight: 1.5 }}>
                  <strong style={{ color: T.text }}>{w.contact_name}</strong> — warmth {w.warmth}/10
                  {w.notes && <span style={{ color: T.textTer }}> · {w.notes.slice(0, 80)}</span>}
                </p>
              ))}
            </div>
          )}

          {/* Research */}
          {knowledge.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 500, color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>Research</p>
              {knowledge.map((k, i) => (
                <div key={i} style={{ padding: '6px 0', borderBottom: i < knowledge.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: T.text, margin: '0 0 2px' }}>{k.title}</p>
                  <p style={{ fontSize: 12, color: T.textSec, margin: 0, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{k.content?.slice(0, 200)}</p>
                </div>
              ))}
            </div>
          )}

          {/* Analysis */}
          {analysis && (
            <div style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.02)', borderRadius: 10, border: `1px solid ${T.border}` }}>
              <p style={{ fontSize: 11, fontWeight: 500, color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>Strategic Analysis</p>
              <p style={{ fontSize: 13, color: T.text, margin: 0, lineHeight: 1.7, whiteSpace: 'pre-line' }}>{analysis}</p>
            </div>
          )}

          {!analysis && (
            <button onClick={requestAnalysis} disabled={analysing} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12, fontWeight: 500, color: analysing ? T.textTer : T.accent,
              background: 'rgba(0,0,0,0.03)', border: `1px solid ${T.border}`,
              borderRadius: 50, padding: '7px 14px', cursor: analysing ? 'default' : 'pointer',
              fontFamily: T.font,
            }}>
              <Sparkles style={{ width: 12, height: 12 }} />
              {analysing ? 'Analysing...' : 'Ask Kiko to analyse this company'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
