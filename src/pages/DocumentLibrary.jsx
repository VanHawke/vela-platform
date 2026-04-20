// src/pages/DocumentLibrary.jsx — Document Library (Legora theme, matches Campaigns layout)
import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import T from '@/lib/theme'
import { Plus, Search, X, Download, Trash2 } from 'lucide-react'

const CATEGORY_LABELS = {
  team_deck: 'Team Deck', contract: 'Contract', marketing: 'Marketing',
  legal: 'Legal', financial: 'Financial', agency_agreement: 'Agency', general: 'General',
}

function formatSize(b) {
  if (!b) return ''
  if (b < 1024) return b + ' B'
  if (b < 1048576) return (b / 1024).toFixed(0) + ' KB'
  return (b / 1048576).toFixed(1) + ' MB'
}

function formatDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function DocumentLibrary() {
  const { isMobile } = useOutletContext() || {}
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState('user')
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  const C = T

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user?.email) {
        const { data: cfg } = await supabase.from('kiko_user_config').select('role').eq('email', session.user.email).single()
        if (cfg?.role) setUserRole(cfg.role)
      }
      const { data } = await supabase.from('documents').select('*').order('created_at', { ascending: false })
      setDocs(data || [])
      setLoading(false)
    }
    load()
  }, [])

  // Build folder tree
  const buildTree = useCallback(() => {
    const bySport = {}, byType = {}
    const filtered = docs.filter(d => {
      if (userRole !== 'super_admin' && d.access_level === 'super_admin_only') return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return [d.title, d.name, d.file_name, d.team_name, d.sport, d.summary].some(f => (f || '').toLowerCase().includes(q))
      }
      return true
    })
    filtered.forEach(doc => {
      const sport = doc.sport || 'General'
      const cat = doc.category || 'general'
      if (!bySport[sport]) bySport[sport] = []
      bySport[sport].push(doc)
      if (!byType[cat]) byType[cat] = []
      byType[cat].push(doc)
    })
    return { bySport, byType, total: filtered.length }
  }, [docs, userRole, searchQuery])

  const { bySport, byType, total } = buildTree()
  const currentDocs = selectedFolder
    ? (selectedFolder.startsWith('sport:')
      ? bySport[selectedFolder.replace('sport:', '')] || []
      : byType[selectedFolder.replace('type:', '')] || [])
    : docs.filter(d => userRole === 'super_admin' || d.access_level !== 'super_admin_only')

  const folderLabel = selectedFolder
    ? selectedFolder.replace('sport:', '').replace('type:', '')
    : 'All documents'

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 56px)', fontFamily: C.font, color: C.textTertiary }}>Loading...</div>
  )

  // Styles matching Campaigns page exactly
  const cell = { padding: '12px 14px', fontSize: 12, color: C.text, borderBottom: `0.5px solid ${C.border}`, verticalAlign: 'middle' }
  const headerCell = { ...cell, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textTertiary, fontWeight: 500, background: '#F5F4F1', position: 'sticky', top: 0, zIndex: 1, textAlign: 'left' }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', fontFamily: C.font, color: C.text, background: C.bg }}>

      {/* ─── LEFT RAIL: Folder tree ─── */}
      {(!isMobile || !selectedFolder) && (
        <aside style={{ width: isMobile ? '100%' : 280, flexShrink: 0, borderRight: isMobile ? 'none' : `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '18px 18px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>Document Library</div>
              <div style={{ fontSize: 11, color: C.textTertiary, marginTop: 2 }}>{total} documents</div>
            </div>
          </div>

          <div style={{ padding: '0 12px 8px' }}>
            <input type="text" placeholder="Search documents..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 6, background: 'rgba(0,0,0,0.03)', border: `1px solid ${C.border}`, fontSize: 12, fontFamily: C.font, outline: 'none', color: C.text, boxSizing: 'border-box' }} />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 12px' }}>
            {/* By sport */}
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textTertiary, fontWeight: 500, padding: '12px 12px 6px' }}>By sport</div>
            {Object.entries(bySport).sort().map(([sport, sportDocs]) => {
              const key = 'sport:' + sport
              const isSelected = selectedFolder === key
              return (
                <button key={key} onClick={() => setSelectedFolder(isSelected ? null : key)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '10px 12px', marginBottom: 2, borderRadius: 6, border: 'none', background: isSelected ? 'rgba(0,0,0,0.06)' : 'transparent', cursor: 'pointer', fontFamily: C.font, fontSize: 13, color: isSelected ? C.text : C.textSecondary, fontWeight: isSelected ? 500 : 400, transition: 'background 0.1s' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: isSelected ? C.text : C.textTertiary, flexShrink: 0 }} />
                  {sport}
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: C.textTertiary }}>{sportDocs.length}</span>
                </button>
              )
            })}

            {/* By type */}
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textTertiary, fontWeight: 500, padding: '12px 12px 6px' }}>By type</div>
            {Object.entries(byType).sort().map(([cat, catDocs]) => {
              const key = 'type:' + cat
              const isSelected = selectedFolder === key
              return (
                <button key={key} onClick={() => setSelectedFolder(isSelected ? null : key)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '10px 12px', marginBottom: 2, borderRadius: 6, border: 'none', background: isSelected ? 'rgba(0,0,0,0.06)' : 'transparent', cursor: 'pointer', fontFamily: C.font, fontSize: 13, color: isSelected ? C.text : C.textSecondary, fontWeight: isSelected ? 500 : 400, transition: 'background 0.1s' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: isSelected ? C.text : C.textTertiary, flexShrink: 0 }} />
                  {CATEGORY_LABELS[cat] || cat}
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: C.textTertiary }}>{catDocs.length}</span>
                </button>
              )
            })}
          </div>
        </aside>
      )}

      {/* ─── MAIN: Document table ─── */}
      {(!isMobile || selectedFolder) && (
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          <div style={{ padding: '18px 20px 12px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: `0.5px solid ${C.border}` }}>
            <div>
              {isMobile && (
                <button onClick={() => setSelectedFolder(null)} style={{ background: 'none', border: 'none', fontSize: 12, color: C.textSecondary, cursor: 'pointer', fontFamily: C.font, padding: 0, marginBottom: 4 }}>← Back</button>
              )}
              <div style={{ fontSize: 16, fontWeight: 500, color: C.text }}>{selectedFolder ? folderLabel : 'All documents'}</div>
              <div style={{ fontSize: 11, color: C.textTertiary, marginTop: 2 }}>{currentDocs.length} document{currentDocs.length !== 1 ? 's' : ''}</div>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {currentDocs.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: C.textTertiary, fontSize: 13 }}>
                {docs.length === 0 ? 'No documents yet — upload files via Kiko to get started.' : 'No documents in this folder.'}
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={headerCell}>Name</th>
                    <th style={{ ...headerCell, width: 90 }}>Type</th>
                    {!isMobile && <th style={{ ...headerCell, width: 100 }}>Team</th>}
                    {!isMobile && <th style={{ ...headerCell, width: 80 }}>Size</th>}
                    <th style={{ ...headerCell, width: 80 }}>Updated</th>
                    <th style={{ ...headerCell, width: 70 }}>Access</th>
                  </tr>
                </thead>
                <tbody>
                  {currentDocs.map(doc => (
                    <tr key={doc.id} onClick={() => setSelectedDoc(doc)} style={{ cursor: 'pointer', transition: 'background 0.1s' }}
                      onMouseOver={e => e.currentTarget.style.background = 'rgba(0,0,0,0.02)'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ ...cell, fontWeight: 500 }}>{doc.title || doc.name || doc.file_name || 'Document'}</td>
                      <td style={cell}>
                        <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', background: 'rgba(0,0,0,0.04)', color: C.textSecondary, border: `1px solid ${C.border}` }}>
                          {CATEGORY_LABELS[doc.category] || doc.category || '—'}
                        </span>
                      </td>
                      {!isMobile && <td style={cell}>{doc.team_name || '—'}</td>}
                      {!isMobile && <td style={{ ...cell, color: C.textTertiary }}>{formatSize(doc.file_size)}</td>}
                      <td style={{ ...cell, color: C.textTertiary }}>{formatDate(doc.updated_at || doc.created_at)}</td>
                      <td style={cell}>
                        {doc.access_level === 'super_admin_only' && (
                          <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', background: 'rgba(184,100,62,0.08)', color: '#B8643E', border: '1px solid rgba(184,100,62,0.15)' }}>Admin</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>
      )}

      {/* Document detail overlay */}
      {selectedDoc && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setSelectedDoc(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.bg, borderRadius: C.radiusCard, maxWidth: 480, width: '100%', maxHeight: '80vh', overflow: 'auto', padding: 24, boxShadow: C.glassShadowFloat }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 500, color: C.text, fontFamily: C.font }}>{selectedDoc.title || selectedDoc.name || 'Document'}</div>
              <button onClick={() => setSelectedDoc(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textTertiary, padding: 4 }}><X size={18} /></button>
            </div>
            {selectedDoc.summary && <p style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.6, margin: '0 0 16px' }}>{selectedDoc.summary}</p>}
            <div style={{ fontSize: 12, color: C.textTertiary, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {selectedDoc.category && <div>Type: {CATEGORY_LABELS[selectedDoc.category] || selectedDoc.category}</div>}
              {selectedDoc.sport && <div>Sport: {selectedDoc.sport}</div>}
              {selectedDoc.team_name && <div>Team: {selectedDoc.team_name}</div>}
              {selectedDoc.file_size && <div>Size: {formatSize(selectedDoc.file_size)}</div>}
              <div>Uploaded: {formatDate(selectedDoc.created_at)}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {(selectedDoc.file_url || selectedDoc.storage_path) && (
                <a href={selectedDoc.file_url || selectedDoc.storage_path} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 6, background: C.text, color: '#FEFEFC', textDecoration: 'none', fontSize: 12, fontWeight: 500, fontFamily: C.font }}>
                  <Download size={14} /> Download
                </a>
              )}
              <button onClick={() => setSelectedDoc(null)}
                style={{ padding: '8px 16px', borderRadius: 6, background: 'transparent', border: `1px solid ${C.border}`, fontSize: 12, color: C.textSecondary, cursor: 'pointer', fontFamily: C.font }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
