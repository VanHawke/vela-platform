// DocumentCard.jsx — compact card for document display in detail panels
import { FileText, Image, File, ExternalLink, Building2, Tag } from 'lucide-react'

const CAT_COLORS = { deck: '#007AFF', proposal: '#AF52DE', contract: '#FF9500', brief: '#34C759', report: '#6B6B6B', media_kit: '#FF2D55', research: '#5856D6', playbook: '#34C759', other: '#ABABAB' }

const fileIcon = (type) => {
  if (type?.includes('pdf')) return FileText
  if (type?.includes('image')) return Image
  if (type?.includes('presentation') || type?.includes('pptx')) return FileText
  return File
}

export default function DocumentCard({ doc, compact = false, onView }) {
  const intel = doc.intelligence || {}
  const Icon = fileIcon(doc.doc_type)
  const catColor = CAT_COLORS[doc.category] || '#ABABAB'
  const date = doc.created_at ? new Date(doc.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''

  if (compact) {
    return (
      <div onClick={() => onView?.(doc)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s', background: 'transparent' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.03)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${catColor}10`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon style={{ width: 15, height: 15, color: catColor }} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', margin: 0, fontFamily: 'var(--font)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</p>
          <p style={{ fontSize: 10, color: 'var(--text-tertiary)', margin: '2px 0 0', fontFamily: 'var(--font)' }}>
            {doc.category || 'document'} · {date}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: '#FFFFFF', borderRadius: 12, padding: 14, border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: `${catColor}10`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon style={{ width: 17, height: 17, color: catColor }} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0, fontFamily: 'var(--font)', lineHeight: 1.3 }}>{doc.name}</p>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: catColor, background: `${catColor}12`, padding: '2px 6px', borderRadius: 4 }}>{doc.category || 'document'}</span>
            {doc.linked_team && <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--font)' }}>· {doc.linked_team}</span>}
            <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--font)' }}>· {date}</span>
          </div>
        </div>
      </div>
      {intel.summary && <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 8px', fontFamily: 'var(--font)', lineHeight: 1.45 }}>{intel.summary}</p>}
      {(intel.key_stats?.length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {intel.key_stats.slice(0, 3).map((s, i) => (
            <span key={i} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(0,0,0,0.04)', color: 'var(--text-secondary)', fontFamily: 'var(--font)' }}>{s}</span>
          ))}
        </div>
      )}
    </div>
  )
}
