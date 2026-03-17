import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Upload, FileText, Image, File, X, Loader2, Eye, RefreshCw, Search, Filter, ChevronDown, ChevronUp, Building2, Tag, Brain } from 'lucide-react'

const T = {
  bg: 'transparent', surface: 'rgba(255,255,255,0.65)', surfaceHover: 'rgba(255,255,255,0.8)',
  border: 'rgba(255,255,255,0.5)', borderHover: 'rgba(255,255,255,0.7)', borderSubtle: 'rgba(0,0,0,0.06)',
  text: '#1A1A1A', textSecondary: '#6B6B6B', textTertiary: '#ABABAB',
  accent: '#1A1A1A', accentSoft: 'rgba(0,0,0,0.04)',
  blue: '#007AFF', red: '#FF3B30', green: '#34C759', yellow: '#FF9500', purple: '#AF52DE',
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
}

const CATEGORIES = ['all', 'deck', 'proposal', 'contract', 'brief', 'report', 'media_kit', 'research', 'playbook', 'other']
const CAT_COLORS = { deck: T.blue, proposal: T.purple, contract: '#FF9500', brief: T.green, report: '#6B6B6B', media_kit: '#FF2D55', research: '#5856D6', playbook: '#34C759', other: '#ABABAB' }
const CONTEXTS = ['all', 'f1', 'formula_e', 'motorsport', 'sport', 'technology', 'luxury', 'finance', 'consulting', 'media', 'general']
const CTX_LABELS = { f1: 'F1', formula_e: 'Formula E', motorsport: 'Motorsport', sport: 'Sport', technology: 'Technology', luxury: 'Luxury', finance: 'Finance', consulting: 'Consulting', media: 'Media', general: 'General' }
const CTX_COLORS = { f1: '#E10600', formula_e: '#00A19C', motorsport: '#FF9500', sport: '#34C759', technology: '#007AFF', luxury: '#AF52DE', finance: '#5856D6', consulting: '#FF2D55', media: '#FF9500', general: '#ABABAB' }

const fileIcon = (type) => {
  if (type?.includes('pdf')) return FileText
  if (type?.includes('image')) return Image
  if (type?.includes('presentation') || type?.includes('pptx')) return FileText
  return File
}

export default function Documents({ user }) {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [ctxFilter, setCtxFilter] = useState('all')
  const [teamFilter, setTeamFilter] = useState('')
  const [teams, setTeams] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [rescanning, setRescanning] = useState(null)
  const [uploadCategory, setUploadCategory] = useState('deck')
  const [uploadEntity, setUploadEntity] = useState('')
  const [uploadTeam, setUploadTeam] = useState('')
  const [uploadTags, setUploadTags] = useState('')
  const [lastUploaded, setLastUploaded] = useState(null) // {id, name, detectedTeam, confirmedTeam}
  const [editingTeam, setEditingTeam] = useState(null) // doc id being reassigned
  const [dragOver, setDragOver] = useState(false)
  const dragCounter = useRef(0)
  const fileRef = useRef(null)

  useEffect(() => { loadDocs(); loadTeams() }, [])

  const loadTeams = async () => {
    const { data } = await supabase.from('f1_teams').select('name').order('sort_order')
    setTeams((data || []).map(t => t.name))
  }

  const loadDocs = async () => {
    setLoading(true)
    const res = await fetch('/api/documents', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list' }),
    })
    const data = await res.json()
    setDocuments(data.documents || [])
    setLoading(false)
  }

  const processFile = async (file) => {
    if (!file || !user?.email) return
    if (uploading) return
    setUploading(true); setUploadStatus('Uploading to storage...')
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/__+/g, '_')
      const safeEmail = (user.email || 'user').replace(/[^a-zA-Z0-9]/g, '_')
      const path = `documents/${safeEmail}/${Date.now()}_${safeName}`
      const { error: uploadError } = await supabase.storage.from('vela-assets').upload(path, file)
      if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)
      const { data: { publicUrl } } = supabase.storage.from('vela-assets').getPublicUrl(path)
      setUploadStatus('Extracting and analysing...')
      const res = await fetch('/api/documents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'process', storagePath: path, publicUrl, fileName: file.name, fileType: file.type, accessLevel: 'workspace', userEmail: user.email, category: uploadCategory, team: uploadTeam, tags: uploadTags }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || `Processing failed (${res.status})`)
      setUploadStatus(`Done — ${result.chunks} chunks indexed`)
      const detectedTeam = result.intelligence?.detected_team || result.links?.linked_team || uploadTeam || null
      const detectedEntity = result.intelligence?.detected_entity || uploadEntity || null
      const detectedContext = result.intelligence?.detected_context || null
      if (detectedTeam || detectedEntity) {
        setLastUploaded({ id: result.documentId, name: file.name, detectedTeam, detectedEntity, detectedContext, confirmedTeam: detectedTeam })
      }
      setTimeout(() => setUploadStatus(''), 3000)
      loadDocs()
    } catch (err) {
      console.error('[Documents] Upload error:', err)
      setUploadStatus(`Error: ${err.message}`)
      setTimeout(() => setUploadStatus(''), 8000)
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation()
    dragCounter.current = 0; setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }
  const handleDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current++; setDragOver(true) }
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current--; if (dragCounter.current <= 0) { dragCounter.current = 0; setDragOver(false) } }
  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation() }

  const rescan = async (docId) => {
    setRescanning(docId)
    try {
      const res = await fetch('/api/documents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rescan', documentId: docId }),
      })
      if (res.ok) loadDocs()
    } catch {} finally { setRescanning(null) }
  }

  const reassignTeam = async (docId, newTeam) => {
    await supabase.from('documents').update({ linked_team: newTeam || null }).eq('id', docId)
    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, linked_team: newTeam || null } : d))
    setEditingTeam(null)
  }

  const remove = async (doc) => {
    if (!confirm(`Delete "${doc.name}"? This cannot be undone.`)) return
    if (doc.storage_path) await supabase.storage.from('vela-assets').remove([doc.storage_path])
    await supabase.from('document_chunks').delete().eq('document_id', doc.id)
    await supabase.from('documents').delete().eq('id', doc.id)
    setDocuments(prev => prev.filter(d => d.id !== doc.id))
  }

  const filtered = documents.filter(d => {
    if (catFilter !== 'all' && d.category !== catFilter) return false
    if (ctxFilter !== 'all' && d.context !== ctxFilter) return false
    if (teamFilter && d.linked_team !== teamFilter && d.linked_entity !== teamFilter) return false
    if (searchQuery && !d.name?.toLowerCase().includes(searchQuery.toLowerCase()) && !d.summary?.toLowerCase().includes(searchQuery.toLowerCase()) && !d.linked_entity?.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const cardStyle = { background: T.surface, borderRadius: 12, border: `0.5px solid rgba(0,0,0,0.05)`, boxShadow: '0 4px 16px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.02), inset 0 1px 0 rgba(255,255,255,1)', padding: 16, transition: 'all 0.15s' }
  const pillStyle = (color) => ({ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 500, background: `${color}12`, color, fontFamily: T.font })
  const inputStyle = { height: 36, borderRadius: 8, border: `0.5px solid rgba(0,0,0,0.06)`, padding: '0 10px', fontSize: 12, color: T.text, fontFamily: T.font, outline: 'none', background: T.surface }

  return (
    <div
      onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}
      style={{ flex: 1, display: 'flex', flexDirection: 'column', fontFamily: T.font, background: T.bg, overflow: 'hidden', position: 'relative' }}>

      {/* Drag-and-drop overlay */}
      {dragOver && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          border: '2px dashed #1A1A1A', borderRadius: 16, margin: 8,
          pointerEvents: 'none',
        }}>
          <Upload size={40} color="#1A1A1A" style={{ marginBottom: 12, opacity: 0.7 }} />
          <p style={{ fontSize: 16, fontWeight: 600, color: T.text }}>Drop file to upload</p>
          <p style={{ fontSize: 12, color: T.textTertiary, marginTop: 4 }}>PDF, PPTX, DOCX, images, text files</p>
        </div>
      )}

      {/* Header */}
      <div style={{ padding: '20px 24px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: T.text, margin: 0 }}>Knowledge Library</h1>
          <p style={{ fontSize: 12, color: T.textTertiary, margin: '4px 0 0' }}>{documents.length} documents — Kiko analyses and learns from everything you upload</p>
        </div>
        <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ height: 36, padding: '0 16px', borderRadius: 10, background: T.accent, color: '#fff', border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 6, opacity: uploading ? 0.5 : 1 }}>
          {uploading ? <><Loader2 size={14} style={{ animation: 'kikoVortexSpin 1s linear infinite' }} />{uploadStatus}</> : <><Upload size={14} />Upload</>}
        </button>
        <input ref={fileRef} type="file" accept=".pdf,.pptx,.docx,.doc,.txt,.md,.png,.jpg,.jpeg,.webp,.xlsx" onChange={handleUpload} style={{ display: 'none' }} />
      </div>

      {/* Upload options */}
      <div style={{ padding: '0 24px 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={uploadCategory} onChange={e => setUploadCategory(e.target.value)} style={{ ...inputStyle, width: 110 }}>
          {CATEGORIES.filter(c => c !== 'all').map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
        </select>
        <input value={uploadEntity} onChange={e => setUploadEntity(e.target.value)} placeholder="Entity (e.g. Alpine, Nike, Haas)" style={{ ...inputStyle, width: 180 }} />
        <select value={uploadTeam} onChange={e => setUploadTeam(e.target.value)} style={{ ...inputStyle, width: 140 }}>
          <option value="">F1 team (optional)</option>
          {teams.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input value={uploadTags} onChange={e => setUploadTags(e.target.value)} placeholder="Tags (comma separated)" style={{ ...inputStyle, width: 160 }} />
      </div>
      {uploadStatus && (
        <div style={{ padding: '8px 24px', background: uploadStatus.startsWith('Error') ? 'rgba(255,59,48,0.08)' : uploading ? 'rgba(0,122,255,0.06)' : 'rgba(52,199,89,0.08)' }}>
          <p style={{ fontSize: 11, color: uploadStatus.startsWith('Error') ? T.red : uploading ? T.blue : T.green, fontFamily: T.font, margin: 0 }}>{uploadStatus}</p>
        </div>
      )}

      {/* Post-upload detection confirmation */}
      {lastUploaded && (
        <div style={{ padding: '10px 24px', background: 'rgba(0,122,255,0.06)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: T.text, fontFamily: T.font }}>
            Detected: {lastUploaded.detectedEntity && <strong>{lastUploaded.detectedEntity}</strong>}
            {lastUploaded.detectedTeam && lastUploaded.detectedEntity !== lastUploaded.detectedTeam && <> · <span style={{ color: T.blue }}>{lastUploaded.detectedTeam}</span></>}
            {lastUploaded.detectedContext && <> · <span style={{ color: CTX_COLORS[lastUploaded.detectedContext] || T.textTertiary }}>{CTX_LABELS[lastUploaded.detectedContext] || lastUploaded.detectedContext}</span></>}
          </span>
          <button onClick={() => { if (lastUploaded.confirmedTeam) reassignTeam(lastUploaded.id, lastUploaded.confirmedTeam); setLastUploaded(null) }}
            style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, border: 'none', background: T.accent, color: '#fff', cursor: 'pointer', fontFamily: T.font, fontWeight: 500 }}>
            Confirm
          </button>
          <select value={lastUploaded.confirmedTeam || ''} onChange={e => setLastUploaded(prev => ({ ...prev, confirmedTeam: e.target.value }))}
            style={{ ...inputStyle, width: 140, height: 28, fontSize: 11 }}>
            <option value="">No team link</option>
            {teams.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={() => setLastUploaded(null)} style={{ fontSize: 11, color: T.textTertiary, background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.font }}>Dismiss</button>
        </div>
      )}

      {/* Filter bar */}
      <div style={{ padding: '8px 24px 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Context filter */}
        <select value={ctxFilter} onChange={e => setCtxFilter(e.target.value)} style={{ ...inputStyle, width: 120 }}>
          <option value="all">All contexts</option>
          {CONTEXTS.filter(c => c !== 'all').map(c => <option key={c} value={c}>{CTX_LABELS[c] || c}</option>)}
        </select>
        {/* Category pills */}
        <div style={{ display: 'flex', gap: 3, background: 'rgba(0,0,0,0.03)', borderRadius: 8, padding: 3 }}>
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCatFilter(c)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', fontSize: 10, fontWeight: 500, cursor: 'pointer', fontFamily: T.font, background: catFilter === c ? T.accent : 'transparent', color: catFilter === c ? '#fff' : T.textTertiary, transition: 'all 0.15s' }}>{c === 'all' ? 'All' : c.replace('_', ' ')}</button>
          ))}
        </div>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: T.textTertiary }} />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search documents..." style={{ ...inputStyle, width: '100%', paddingLeft: 30 }} />
        </div>
      </div>

      {/* Document list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><Loader2 size={24} color={T.textTertiary} style={{ animation: 'kikoVortexSpin 1s linear infinite' }} /></div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <FileText size={32} color={T.textTertiary} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
            <p style={{ fontSize: 14, color: T.textTertiary }}>No documents{catFilter !== 'all' ? ` in ${catFilter}` : ''}{ctxFilter !== 'all' ? ` (${CTX_LABELS[ctxFilter]})` : ''}</p>
            <p style={{ fontSize: 12, color: T.textTertiary, opacity: 0.6, marginTop: 4 }}>Upload decks, proposals, briefs from any sport, business, or industry</p>
            <p style={{ fontSize: 12, color: T.textTertiary, opacity: 0.6, marginTop: 2 }}>Kiko learns from everything — drag and drop or click Upload</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(doc => {
              const Icon = fileIcon(doc.doc_type)
              const isExpanded = expanded === doc.id
              const intel = doc.intelligence || {}
              const catColor = CAT_COLORS[doc.category] || T.textTertiary
              const publicUrl = doc.storage_path ? supabase.storage.from('vela-assets').getPublicUrl(doc.storage_path).data.publicUrl : null
              return (
                <div key={doc.id} style={{ ...cardStyle, cursor: 'pointer' }} onClick={() => setExpanded(isExpanded ? null : doc.id)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: `${catColor}10`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon size={16} color={catColor} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
                        {doc.scan_status === 'complete' && <Brain size={12} color={T.green} />}
                        {doc.scan_status === 'scanning' && <Loader2 size={12} color={T.blue} style={{ animation: 'kikoVortexSpin 1s linear infinite' }} />}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3, flexWrap: 'wrap' }}>
                        {doc.context && doc.context !== 'general' && <span style={pillStyle(CTX_COLORS[doc.context] || T.textTertiary)}>{CTX_LABELS[doc.context] || doc.context}</span>}
                        <span style={pillStyle(catColor)}>{(doc.category || 'other').replace('_', ' ')}</span>
                        {doc.linked_entity && !doc.linked_team && <span style={pillStyle(T.purple)}>{doc.linked_entity}</span>}
                        {editingTeam === doc.id ? (
                          <select autoFocus value={doc.linked_team || ''} onChange={e => reassignTeam(doc.id, e.target.value)} onBlur={() => setEditingTeam(null)}
                            onClick={e => e.stopPropagation()}
                            style={{ fontSize: 10, padding: '1px 4px', borderRadius: 6, border: `1px solid ${T.blue}`, background: '#fff', color: T.text, outline: 'none', fontFamily: T.font }}>
                            <option value="">No team</option>
                            {teams.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        ) : doc.linked_team ? (
                          <span onClick={e => { e.stopPropagation(); setEditingTeam(doc.id) }} style={{ ...pillStyle(T.blue), cursor: 'pointer' }} title="Click to reassign">
                            {doc.linked_team}
                          </span>
                        ) : null}
                        {doc.tags?.map(t => <span key={t} style={pillStyle(T.textTertiary)}>{t}</span>)}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
                      {publicUrl && <a href={publicUrl} target="_blank" rel="noopener noreferrer" style={{ color: T.textTertiary, display: 'flex' }}><Eye size={14} /></a>}
                      <button onClick={() => rescan(doc.id)} disabled={rescanning === doc.id} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textTertiary, display: 'flex', padding: 0 }}>
                        <RefreshCw size={14} style={{ animation: rescanning === doc.id ? 'kikoVortexSpin 1s linear infinite' : 'none' }} />
                      </button>
                      <button onClick={() => remove(doc)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textTertiary, display: 'flex', padding: 0 }}><X size={14} /></button>
                      {isExpanded ? <ChevronUp size={14} color={T.textTertiary} /> : <ChevronDown size={14} color={T.textTertiary} />}
                    </div>
                  </div>
                  {doc.summary && !isExpanded && (
                    <p style={{ fontSize: 11, color: T.textTertiary, marginTop: 8, lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.summary}</p>
                  )}

                  {/* Expanded intelligence panel */}
                  {isExpanded && (
                    <div style={{ marginTop: 12, padding: 14, borderRadius: 10, background: 'rgba(0,0,0,0.02)', border: `0.5px solid rgba(0,0,0,0.04)` }}>
                      {doc.summary && <p style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.6, margin: '0 0 12px' }}>{doc.summary}</p>}
                      {intel.key_stats?.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: T.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 }}>Key stats</span>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                            {intel.key_stats.map((s, i) => <span key={i} style={{ ...pillStyle(T.blue), fontSize: 11 }}>{s}</span>)}
                          </div>
                        </div>
                      )}
                      {intel.messaging_tone && (
                        <div style={{ marginBottom: 10 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: T.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 }}>Messaging tone</span>
                          <p style={{ fontSize: 12, color: T.text, margin: '4px 0 0' }}>{intel.messaging_tone}</p>
                        </div>
                      )}
                      {intel.positioning && (
                        <div style={{ marginBottom: 10 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: T.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 }}>Positioning</span>
                          <p style={{ fontSize: 12, color: T.text, margin: '4px 0 0' }}>{intel.positioning}</p>
                        </div>
                      )}

                      {intel.talking_points?.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: T.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 }}>Talking points</span>
                          <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                            {intel.talking_points.map((p, i) => <li key={i} style={{ fontSize: 12, color: T.text, lineHeight: 1.6 }}>{p}</li>)}
                          </ul>
                        </div>
                      )}
                      {intel.partner_benefits?.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: T.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 }}>Partner benefits</span>
                          <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                            {intel.partner_benefits.map((b, i) => <li key={i} style={{ fontSize: 12, color: T.text, lineHeight: 1.6 }}>{b}</li>)}
                          </ul>
                        </div>
                      )}
                      {intel.unique_angles?.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: T.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 }}>Unique angles</span>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                            {intel.unique_angles.map((a, i) => <span key={i} style={{ ...pillStyle(T.purple), fontSize: 11 }}>{a}</span>)}
                          </div>
                        </div>
                      )}
                      {intel.value_propositions?.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: T.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 }}>Value propositions</span>
                          <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                            {intel.value_propositions.map((v, i) => <li key={i} style={{ fontSize: 12, color: T.text, lineHeight: 1.6 }}>{v}</li>)}
                          </ul>
                        </div>
                      )}

                      {intel.target_audience && (
                        <div>
                          <span style={{ fontSize: 10, fontWeight: 600, color: T.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 }}>Target audience</span>
                          <p style={{ fontSize: 12, color: T.text, margin: '4px 0 0' }}>{intel.target_audience}</p>
                        </div>
                      )}
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: `0.5px solid rgba(0,0,0,0.04)`, display: 'flex', gap: 12, fontSize: 10, color: T.textTertiary }}>
                        <span>Scanned: {doc.last_scanned_at ? new Date(doc.last_scanned_at).toLocaleDateString() : 'Never'}</span>
                        <span>Version: {doc.scan_version || 0}</span>
                        {doc.linked_company_id && <span>Linked to CRM</span>}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
