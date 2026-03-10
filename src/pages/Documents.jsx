import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Upload, FileText, Image, File, X, Lock, Globe, Loader2, Eye } from 'lucide-react'

const fileIcon = (type) => {
  if (type?.includes('pdf')) return FileText
  if (type?.includes('image')) return Image
  return File
}

export default function Documents({ user }) {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState('')
  const [accessFilter, setAccessFilter] = useState('all')
  const [accessLevel, setAccessLevel] = useState('private')
  const fileRef = useRef(null)

  useEffect(() => { if (user?.email) load() }, [user?.email])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('documents').select('*').order('created_at', { ascending: false })
    setDocuments(data || [])
    setLoading(false)
  }

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !user?.email) return
    setUploading(true)
    setUploadStatus('Uploading...')
    try {
      const path = `documents/${user.email}/${Date.now()}_${file.name}`
      const { error: uploadError } = await supabase.storage.from('vela-assets').upload(path, file)
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage.from('vela-assets').getPublicUrl(path)
      setUploadStatus('Processing & indexing...')
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'process', storagePath: path, publicUrl, fileName: file.name, fileType: file.type, accessLevel, userEmail: user.email }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Processing failed')
      setUploadStatus('Done ✓')
      setTimeout(() => setUploadStatus(''), 2000)
      load()
    } catch (err) {
      console.error('[Documents] Upload error:', err)
      setUploadStatus(`Error: ${err.message}`)
      setTimeout(() => setUploadStatus(''), 4000)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const remove = async (doc) => {
    if (doc.storage_path) await supabase.storage.from('vela-assets').remove([doc.storage_path])
    await supabase.from('document_chunks').delete().eq('document_id', doc.id)
    await supabase.from('documents').delete().eq('id', doc.id)
    setDocuments(prev => prev.filter(d => d.id !== doc.id))
  }

  const filtered = documents.filter(d => accessFilter === 'all' ? true : d.access_level === accessFilter)

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="px-6 py-4 border-b border-white/8 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-white">Documents</h1>
        <div className="flex items-center gap-3">
          <select value={accessLevel} onChange={e => setAccessLevel(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none cursor-pointer">
            <option value="private" className="bg-[#1a1a1a]">🔒 Private</option>
            <option value="workspace" className="bg-[#1a1a1a]">🌐 Workspace</option>
          </select>
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="flex items-center gap-2 text-xs bg-white text-black px-3 py-1.5 rounded-lg font-medium hover:bg-white/90 transition-colors disabled:opacity-50 min-w-[90px] justify-center">
            {uploading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{uploadStatus || 'Working...'}</> : <><Upload className="h-3.5 w-3.5" />Upload</>}
          </button>
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg,.webp" onChange={handleUpload} className="hidden" />
        </div>
      </div>
      {uploadStatus && !uploading && (
        <div className="px-6 py-2 bg-emerald-500/10 border-b border-emerald-500/20">
          <p className="text-xs text-emerald-400">{uploadStatus}</p>
        </div>
      )}
      <div className="px-6 py-3 border-b border-white/8 flex gap-1">
        {['all', 'private', 'workspace'].map(f => (
          <button key={f} onClick={() => setAccessFilter(f)} className={`px-3 py-1 text-xs rounded-md transition-colors capitalize ${accessFilter === f ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60'}`}>{f}</button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-6 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-white/25">
            <FileText className="h-8 w-8 mb-3 opacity-50" />
            <p className="text-sm">No documents yet</p>
            <p className="text-xs mt-1 text-white/20">Upload PDFs, Word docs, images or text files</p>
            <p className="text-xs mt-1 text-white/20">Kiko will read, learn, and remember everything you upload</p>
          </div>
        ) : (
          <div className="p-6 space-y-2">
            {filtered.map(doc => {
              const Icon = fileIcon(doc.doc_type)
              const publicUrl = doc.storage_path ? supabase.storage.from('vela-assets').getPublicUrl(doc.storage_path).data.publicUrl : null
              return (
                <div key={doc.id} className="glass rounded-xl border border-white/8 px-5 py-4 flex items-center justify-between group hover:border-white/15 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="h-9 w-9 rounded-lg bg-white/8 flex items-center justify-center flex-shrink-0">
                      <Icon className="h-4 w-4 text-white/50" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white/85">{doc.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {doc.access_level === 'private' ? <Lock className="h-3 w-3 text-white/25" /> : <Globe className="h-3 w-3 text-white/25" />}
                        <span className="text-xs text-white/30">{doc.access_level}</span>
                        {doc.summary && <span className="text-xs text-white/20 truncate max-w-xs">· {doc.summary}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-all">
                    {publicUrl && <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="text-white/30 hover:text-white/60 transition-colors"><Eye className="h-4 w-4" /></a>}
                    <button onClick={() => remove(doc)} className="text-white/20 hover:text-red-400 transition-colors"><X className="h-4 w-4" /></button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
