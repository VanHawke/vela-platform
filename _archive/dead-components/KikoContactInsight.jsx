// KikoContactInsight.jsx — Redesign component for contact detail pages
// Shows Kiko's relationship intelligence + cognitive analysis
// Fetches from kiko_relationships (warmth) and kiko_knowledge (research)

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Brain, ChevronDown, ChevronUp, Sparkles } from 'lucide-react'

const T = {
  font: "'Inter', system-ui, sans-serif",
  fontDisplay: "'Source Serif 4', Georgia, serif",
  text: '#0A0A0A', textSec: '#6B6B6B', textTer: '#A0A0A0',
  border: 'rgba(0,0,0,0.08)', accent: '#0A0A0A',
  sage: '#7d8a64', terra: '#b8643e', amber: '#B89C5C',
}

function warmthLabel(score) {
  if (score >= 8) return { label: 'Strong', color: T.sage }
  if (score >= 5) return { label: 'Warm', color: T.amber }
  if (score >= 3) return { label: 'Developing', color: T.textSec }
  return { label: 'Cold', color: T.terra }
}

export default function KikoContactInsight({ contactName, companyName }) {
  const [relationship, setRelationship] = useState(null)
  const [knowledge, setKnowledge] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)
  const [analysing, setAnalysing] = useState(false)
  const [analysis, setAnalysis] = useState(null)

  useEffect(() => {
    if (!contactName) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        // Fetch relationship data (warmth score, notes)
        const { data: relData } = await supabase
          .from('kiko_relationships')
          .select('contact_name, warmth, last_interaction, notes, relationship_type')
          .ilike('contact_name', `%${contactName}%`)
          .limit(1)
          .maybeSingle()

        // Fetch knowledge/research on this contact or company
        const searchTerm = companyName || contactName
        const { data: knowData } = await supabase
          .from('kiko_knowledge')
          .select('title, content, category, created_at')
          .or(`title.ilike.%${searchTerm}%,content.ilike.%${searchTerm}%`)
          .order('created_at', { ascending: false })
          .limit(3)

        if (!cancelled) {
          setRelationship(relData || null)
          setKnowledge(knowData || [])
        }
      } catch (e) { console.error('[KikoContactInsight]', e) }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [contactName, companyName])

  const requestAnalysis = async () => {
    setAnalysing(true)
    try {
      const res = await fetch('https://api.vanhawke.agency/api/kiko', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Give me a brief cognitive analysis of ${contactName}${companyName ? ` at ${companyName}` : ''}. Include: communication style, decision-making pattern, recommended approach, and what I should say next. Be concise — 3-4 bullet points max.`,
          userEmail: 'sunny@vanhawke.com',
          currentPage: 'contacts',
        }),
      })
      const data = await res.json()
      if (data?.message) setAnalysis(data.message)
    } catch (e) { console.error('[KikoAnalysis]', e) }
    setAnalysing(false)
  }

  const hasData = relationship || knowledge?.length > 0 || analysis
  if (loading) return null // Don't show skeleton — appear when ready

  const warmth = relationship ? warmthLabel(relationship.warmth || 0) : null
  const card = {
    background: '#FFFFFF', border: `1px solid ${T.border}`,
    borderRadius: 14, padding: '16px 20px',
    fontFamily: T.font,
  }

  return (
    <div style={card}>
      <div onClick={() => setExpanded(!expanded)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Brain style={{ width: 14, height: 14, color: T.textSec }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: T.text, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Kiko's Intelligence</span>
          {warmth && (
            <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 4, background: `${warmth.color}18`, color: warmth.color }}>
              {warmth.label} · {relationship.warmth}/10
            </span>
          )}
        </div>
        {expanded ? <ChevronUp style={{ width: 14, height: 14, color: T.textTer }} /> : <ChevronDown style={{ width: 14, height: 14, color: T.textTer }} />}
      </div>

      {expanded && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Relationship data */}
          {relationship && (
            <div>
              {relationship.relationship_type && (
                <p style={{ fontSize: 12, color: T.textSec, margin: '0 0 4px' }}>
                  <strong style={{ color: T.text }}>Relationship:</strong> {relationship.relationship_type}
                </p>
              )}
              {relationship.last_interaction && (
                <p style={{ fontSize: 12, color: T.textSec, margin: '0 0 4px' }}>
                  <strong style={{ color: T.text }}>Last interaction:</strong> {new Date(relationship.last_interaction).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              )}
              {relationship.notes && (
                <p style={{ fontSize: 13, color: T.textSec, margin: '4px 0 0', lineHeight: 1.6, fontStyle: 'italic' }}>
                  "{relationship.notes}"
                </p>
              )}
            </div>
          )}

          {/* Knowledge/research */}
          {knowledge?.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 500, color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>Research</p>
              {knowledge.map((k, i) => (
                <div key={i} style={{ padding: '6px 0', borderBottom: i < knowledge.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: T.text, margin: '0 0 2px' }}>{k.title}</p>
                  <p style={{ fontSize: 12, color: T.textSec, margin: 0, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {k.content?.slice(0, 200)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Cognitive analysis */}
          {analysis && (
            <div style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.02)', borderRadius: 10, border: `1px solid ${T.border}` }}>
              <p style={{ fontSize: 11, fontWeight: 500, color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>Cognitive Analysis</p>
              <p style={{ fontSize: 13, color: T.text, margin: 0, lineHeight: 1.7, whiteSpace: 'pre-line' }}>{analysis}</p>
            </div>
          )}

          {/* Request analysis button */}
          {!analysis && (
            <button onClick={requestAnalysis} disabled={analysing} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12, fontWeight: 500, color: analysing ? T.textTer : T.accent,
              background: 'rgba(0,0,0,0.03)', border: `1px solid ${T.border}`,
              borderRadius: 50, padding: '7px 14px', cursor: analysing ? 'default' : 'pointer',
              fontFamily: T.font, transition: 'all 0.15s',
            }}>
              <Sparkles style={{ width: 12, height: 12 }} />
              {analysing ? 'Analysing...' : 'Ask Kiko to analyse this contact'}
            </button>
          )}

          {!hasData && !analysis && (
            <p style={{ fontSize: 12, color: T.textTer, margin: 0, fontStyle: 'italic' }}>
              No relationship data yet. Click above to generate Kiko's analysis.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
