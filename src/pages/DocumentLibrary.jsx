// src/pages/DocumentLibrary.jsx — Document Library with folder tree and role-based access
import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

const CATEGORY_LABELS = {
  team_deck: 'Team Decks',
  contract: 'Contracts',
  marketing: 'Marketing',
  legal: 'Legal',
  financial: 'Financial',
  agency_agreement: 'Agency Agreements',
  general: 'General',
}

const CATEGORY_ICONS = {
  team_deck: '📊', contract: '📜', marketing: '📣',
  legal: '⚖️', financial: '💰', agency_agreement: '🤝', general: '📁',
}

export default function DocumentLibrary() {
  const { isMobile } = useOutletContext() || {}
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState('user')
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')


  useEffect(() => {
    async function load() {
      setLoading(true)
      // Get user role
      const { data: { session } } = await supabase.auth.getSession()
      const email = session?.user?.email
      if (email) {
        const { data: cfg } = await supabase.from('kiko_user_config').select('role').eq('email', email).single()
        if (cfg?.role) setUserRole(cfg.role)
      }
      // Load documents — filter by access_level for non-admin
      let query = supabase.from('documents').select('*').order('created_at', { ascending: false })
      const { data } = await query
      setDocs(data || [])
      setLoading(false)
    }
    load()
  }, [])

  // Build folder tree from documents
  const buildTree = useCallback(() => {
    const tree = {}
    const filteredDocs = docs.filter(d => {
      if (userRole !== 'super_admin' && d.access_level === 'super_admin_only') return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return (d.title || '').toLowerCase().includes(q) || (d.name || '').toLowerCase().includes(q) ||
               (d.team_name || '').toLowerCase().includes(q) || (d.sport || '').toLowerCase().includes(q) ||
               (d.summary || '').toLowerCase().includes(q)
      }
      return true
    })
    filteredDocs.forEach(doc => {
      const cat = doc.category || 'general'
      const sport = doc.sport || null
      const team = doc.team_name || null
      const folderKey = sport && team ? `${cat}/${sport}/${team}` : sport ? `${cat}/${sport}` : cat
      if (!tree[folderKey]) tree[folderKey] = { category: cat, sport, team, docs: [] }
      tree[folderKey].docs.push(doc)
    })
    return tree
  }, [docs, userRole, searchQuery])

  const tree = buildTree()
  const folderKeys = Object.keys(tree).sort()
  const currentDocs = selectedFolder ? (tree[selectedFolder]?.docs || []) : []


  const C = {
    bg: '#FEFEFC', card: '#FFFFFF', border: 'rgba(0,0,0,0.06)',
    text: '#0A0A0A', textSec: '#6B6B6B', textTer: '#A0A0A0',
    font: "'Inter', system-ui, sans-serif",
    accent: '#5A6470', purple: '#7C5CFC',
  }

  const formatSize = (bytes) => {
    if (!bytes) return ''
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: C.font, color: C.textTer }}>
      Loading documents...
    </div>
  )

  return (
    <div style={{ display: 'flex', height: '100%', fontFamily: C.font, overflow: 'hidden' }}>
      {/* Sidebar — folder tree */}
      {(!isMobile || !selectedFolder) && (
        <div style={{ width: isMobile ? '100%' : 280, flexShrink: 0, borderRight: isMobile ? 'none' : `1px solid ${C.border}`, overflowY: 'auto', padding: '20px 16px' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: C.text, margin: '0 0 16px', fontFamily: C.font }}>Document Library</h2>
          
          <input
            type="text" placeholder="Search documents..."
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg, fontSize: 14, fontFamily: C.font, outline: 'none', marginBottom: 16, boxSizing: 'border-box' }}
          />

          {userRole === 'super_admin' && (
            <div style={{ fontSize: 10, color: C.purple, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Super Admin — Full Access</div>
          )}

          {folderKeys.length === 0 && (
            <div style={{ fontSize: 14, color: C.textTer, padding: '20px 0', textAlign: 'center' }}>
              {docs.length === 0 ? 'No documents yet — upload files via Kiko to get started.' : 'No matching documents.'}
            </div>
          )}


          {folderKeys.map(key => {
            const folder = tree[key]
            const isSelected = selectedFolder === key
            const icon = CATEGORY_ICONS[folder.category] || '📁'
            const label = folder.team ? folder.team : folder.sport ? folder.sport : (CATEGORY_LABELS[folder.category] || folder.category)
            const sublabel = folder.team && folder.sport ? folder.sport : folder.team ? folder.category : null
            return (
              <button key={key} onClick={() => setSelectedFolder(isSelected ? null : key)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', marginBottom: 2, borderRadius: 10, background: isSelected ? 'rgba(0,0,0,0.04)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: C.font }}>
                <span style={{ fontSize: 18 }}>{icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
                  {sublabel && <div style={{ fontSize: 11, color: C.textTer }}>{sublabel}</div>}
                </div>
                <div style={{ fontSize: 12, color: C.textTer, background: 'rgba(0,0,0,0.04)', borderRadius: 6, padding: '2px 8px' }}>{folder.docs.length}</div>
              </button>
            )
          })}
        </div>
      )}


      {/* Document grid — shows when folder selected */}
      {(selectedFolder || isMobile) && selectedFolder && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            {isMobile && (
              <button onClick={() => setSelectedFolder(null)} style={{ background: 'none', border: 'none', fontSize: 14, color: C.accent, cursor: 'pointer', fontFamily: C.font, padding: 0 }}>← Back</button>
            )}
            <h3 style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: 0, fontFamily: C.font }}>{tree[selectedFolder]?.team || tree[selectedFolder]?.sport || CATEGORY_LABELS[tree[selectedFolder]?.category] || 'Documents'}</h3>
            <div style={{ fontSize: 12, color: C.textTer }}>{currentDocs.length} document{currentDocs.length !== 1 ? 's' : ''}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {currentDocs.map(doc => (
              <div key={doc.id} onClick={() => setSelectedDoc(doc)}
                style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', cursor: 'pointer', transition: 'box-shadow 0.2s' }}
                onMouseOver={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'}
                onMouseOut={e => e.currentTarget.style.boxShadow = 'none'}>
                {/* Thumbnail */}
                <div style={{ height: 120, background: '#F5F4F1', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: `1px solid ${C.border}` }}>
                  {doc.thumbnail_url ? (
                    <img src={doc.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ fontSize: 36, opacity: 0.3 }}>{CATEGORY_ICONS[doc.category] || '📄'}</div>
                  )}
                </div>
                {/* Info */}
                <div style={{ padding: '12px 14px' }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title || doc.name || doc.file_name || 'Document'}</div>
                  <div style={{ fontSize: 12, color: C.textTer, marginTop: 4 }}>
                    {formatDate(doc.created_at)}{doc.file_size ? ` · ${formatSize(doc.file_size)}` : ''}
                  </div>
                  {doc.access_level === 'super_admin_only' && (
                    <div style={{ fontSize: 10, color: '#B8643E', fontWeight: 500, marginTop: 4 }}>🔒 Admin Only</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* Empty state when no folder selected (desktop) */}
      {!isMobile && !selectedFolder && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textTer, fontSize: 14, fontFamily: C.font }}>
          Select a folder to view documents
        </div>
      )}

      {/* Document detail overlay */}
      {selectedDoc && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setSelectedDoc(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.bg, borderRadius: 16, maxWidth: 500, width: '100%', maxHeight: '80vh', overflow: 'auto', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 600, color: C.text, margin: 0, fontFamily: C.font }}>{selectedDoc.title || selectedDoc.name || 'Document'}</h3>
              <button onClick={() => setSelectedDoc(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.textTer }}>×</button>
            </div>
            {selectedDoc.summary && <p style={{ fontSize: 14, color: C.textSec, lineHeight: 1.5, margin: '0 0 16px' }}>{selectedDoc.summary}</p>}
            <div style={{ fontSize: 13, color: C.textTer, marginBottom: 16 }}>
              {selectedDoc.category && <div>Category: {CATEGORY_LABELS[selectedDoc.category] || selectedDoc.category}</div>}
              {selectedDoc.sport && <div>Sport: {selectedDoc.sport}</div>}
              {selectedDoc.team_name && <div>Team: {selectedDoc.team_name}</div>}
              {selectedDoc.file_size && <div>Size: {formatSize(selectedDoc.file_size)}</div>}
              <div>Uploaded: {formatDate(selectedDoc.created_at)}</div>
              {selectedDoc.uploaded_by && <div>By: {selectedDoc.uploaded_by}</div>}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {(selectedDoc.file_url || selectedDoc.storage_path) && (
                <a href={selectedDoc.file_url || selectedDoc.storage_path} target="_blank" rel="noopener noreferrer"
                  style={{ padding: '10px 20px', borderRadius: 10, background: C.text, color: '#FEFEFC', textDecoration: 'none', fontSize: 14, fontWeight: 500, fontFamily: C.font }}>
                  Download
                </a>
              )}
              <button onClick={() => setSelectedDoc(null)}
                style={{ padding: '10px 20px', borderRadius: 10, background: 'rgba(0,0,0,0.04)', border: `1px solid ${C.border}`, fontSize: 14, color: C.textSec, cursor: 'pointer', fontFamily: C.font }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
