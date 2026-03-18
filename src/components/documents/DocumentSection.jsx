// DocumentSection.jsx — documents panel for deal/contact/company detail views
// Queries documents linked to a specific entity and shows upload capability
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { FileText, Upload, Loader2, Plus } from 'lucide-react'
import DocumentCard from './DocumentCard'

export default function DocumentSection({ linkedCompanyId, linkedDealId, linkedTeam, companyName, entityLabel = 'Documents' }) {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState('')
  const fileRef = useRef(null)

  useEffect(() => { loadDocs() }, [linkedCompanyId, linkedDealId])

  const loadDocs = async () => {
    setLoading(true)
    try {
      let query = supabase.from('documents').select('*').order('created_at', { ascending: false }).limit(20)
      // Build OR filter for linked entities
      const filters = []
      if (linkedCompanyId) filters.push(`linked_company_id.eq.${linkedCompanyId}`)
      if (linkedDealId) filters.push(`linked_deal_id.eq.${linkedDealId}`)
      if (companyName) filters.push(`linked_entity.eq.${companyName}`)
      if (filters.length > 0) {
        query = query.or(filters.join(','))
      } else {
        setDocuments([]); setLoading(false); return
      }
      const { data } = await query
      setDocuments(data || [])
    } catch {}
    setLoading(false)
  }

  const handleUpload = async (file) => {
    if (!file || uploading) return
    setUploading(true); setUploadStatus('Uploading…')
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `documents/${Date.now()}_${safeName}`
      const { error: upErr } = await supabase.storage.from('vela-assets').upload(path, file)
      if (upErr) throw new Error(upErr.message)
      const { data: { publicUrl } } = supabase.storage.from('vela-assets').getPublicUrl(path)
      setUploadStatus('Analysing…')
      const res = await fetch('/api/documents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'process', storagePath: path, publicUrl, fileName: file.name,
          fileType: file.type, accessLevel: 'workspace', userEmail: 'sunny@vanhawke.com',
          // Pre-link to the current entity
          ...(linkedCompanyId && { linkedCompanyId }),
          ...(linkedDealId && { linkedDealId }),
          ...(linkedTeam && { linkedTeam }),
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Processing failed')
      // Update linking if API didn't handle it
      if (result.documentId && (linkedCompanyId || linkedDealId)) {
        const updates = {}
        if (linkedCompanyId) updates.linked_company_id = linkedCompanyId
        if (linkedDealId) updates.linked_deal_id = linkedDealId
        await supabase.from('documents').update(updates).eq('id', result.documentId)
      }
      setUploadStatus('')
      loadDocs()
    } catch (err) {
      setUploadStatus(`Error: ${err.message}`)
      setTimeout(() => setUploadStatus(''), 3000)
    }
    setUploading(false)
  }

  const sectionTitle = { fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: '0 0 10px', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', gap: 6 }
  const emptyText = { fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font)', margin: 0, lineHeight: 1.5 }

  return (
    <div style={{ background: '#FFFFFF', borderRadius: 16, padding: '16px 20px', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <p style={sectionTitle}>
          <FileText style={{ width: 12, height: 12 }} /> {entityLabel} ({documents.length})
        </p>
        <input ref={fileRef} type="file" accept=".pdf,.pptx,.docx,.doc,.txt,.png,.jpg,.jpeg,.webp,.xlsx" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }} style={{ display: 'none' }} />
        <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 500, color: 'var(--accent)', background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontFamily: 'var(--font)' }}>
          {uploading ? <Loader2 style={{ width: 10, height: 10, animation: 'spin 1s linear infinite' }} /> : <Plus style={{ width: 10, height: 10 }} />}
          {uploading ? uploadStatus : 'Add'}
        </button>
      </div>
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[...Array(2)].map((_, i) => <div key={i} style={{ height: 40, background: 'rgba(0,0,0,0.03)', borderRadius: 8, animation: 'pulse 1.5s infinite' }} />)}
        </div>
      ) : documents.length === 0 ? (
        <p style={emptyText}>No documents linked yet</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {documents.map(doc => <DocumentCard key={doc.id} doc={doc} compact />)}
        </div>
      )}
    </div>
  )
}
