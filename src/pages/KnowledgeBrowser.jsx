// KnowledgeBrowser.jsx — View Kiko's knowledge base across all domains
// Shows what Kiko has researched, when, and key findings per domain.
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import PageHeader from '@/components/layout/PageHeader'
import { Brain, RefreshCw, Clock, ChevronDown, ChevronUp } from 'lucide-react'

const DOMAIN_LABELS = {
  'f1-sponsorship': 'F1 Sponsorship',
  'insolvency-bbls': 'Insolvency & BBLS',
  'cross-border-tax': 'Cross-border Tax',
  'luxury-fashion': 'Luxury & Fashion',
  'gaming-esports': 'Gaming & Esports',
  'ai-saas': 'AI & SaaS',
  'sports-entertainment-law': 'Sports & Entertainment Law',
  'uk-property': 'UK Property Law',
  'hr-employment': 'HR & Employment',
  'fundraising-vc': 'Fundraising & VC',
  'hedge-funds-trading': 'Hedge Funds & Trading',
  'kyc-aml-compliance': 'KYC/AML Compliance',
  'financial-regulation': 'Financial Regulation',
  'contract-disputes': 'Contract Disputes',
  'retail-consumer': 'Retail & Consumer Law',
}

export default function KnowledgeBrowser() {
  const [domains, setDomains] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('kiko_knowledge').select('*').order('researched_at', { ascending: false })
      setDomains(data || [])
      setLoading(false)
    })()
  }, [])

  const toggle = (domain) => setExpanded(prev => prev === domain ? null : domain)

  const daysSince = (dateStr) => {
    if (!dateStr) return '—'
    const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
    return days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days}d ago`
  }

  return (
    <div style={{ padding: '0 24px 40px', maxWidth: 900, margin: '0 auto' }}>
      <PageHeader title="Knowledge Base" breadcrumb={[{ label: 'Intelligence', path: '/' }, 'Knowledge Base']} />
      <p style={{ fontSize: 13, color: '#6B6B6B', fontFamily: 'Inter, system-ui, sans-serif', marginBottom: 24 }}>
        Kiko researches {Object.keys(DOMAIN_LABELS).length} domains every night. This is what she knows.
      </p>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#A0A0A0', fontSize: 13 }}>Loading knowledge base...</div>
      ) : domains.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#A0A0A0', fontSize: 13 }}>No research data yet. Knowledge seeder runs nightly at 3:30am.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {domains.map(d => (
            <div key={d.domain} style={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, background: '#FFFFFF', overflow: 'hidden' }}>
              <div onClick={() => toggle(d.domain)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }}>
                <Brain size={14} style={{ color: '#6B6B6B', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#0A0A0A' }}>{DOMAIN_LABELS[d.domain] || d.domain}</div>
                  <div style={{ fontSize: 11, color: '#A0A0A0', marginTop: 2 }}>
                    <Clock size={9} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                    Researched {daysSince(d.researched_at)} · {(d.content || '').length.toLocaleString()} chars
                  </div>
                </div>
                {expanded === d.domain ? <ChevronUp size={14} color="#6B6B6B" /> : <ChevronDown size={14} color="#6B6B6B" />}
              </div>
              {expanded === d.domain && (
                <div style={{ padding: '0 18px 16px', borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                  <pre style={{ fontSize: 12, lineHeight: 1.6, color: '#0A0A0A', fontFamily: 'Inter, system-ui, sans-serif', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '12px 0 0' }}>
                    {d.content}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 32, padding: '16px 20px', background: '#F5F4F1', borderRadius: 10, fontSize: 12, color: '#6B6B6B', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <strong>How it works:</strong> Kiko runs 5 research batches nightly between 3:30-3:50am, covering 3 domains each (15 total). Each batch uses Claude Sonnet with web search to find the latest developments, then saves findings here. This knowledge is automatically loaded into every Kiko conversation.
      </div>
    </div>
  )
}
