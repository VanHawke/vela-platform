import { useState, useRef } from 'react'
import { Upload, X, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'

const MAX_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export default function ImageUpload({ label, storageKey, folder = 'uploads', aspectHint, onUploaded, currentUrl }) {
  const [preview, setPreview] = useState(currentUrl || null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('File type not supported. Use JPEG, PNG, WebP, or GIF.')
      return
    }
    if (file.size > MAX_SIZE) {
      setError('File too large. Maximum 5MB.')
      return
    }

    // Preview
    const url = URL.createObjectURL(file)
    setPreview(url)

    // Upload
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${folder}/${storageKey}_${Date.now()}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from('vela-assets')
        .upload(path, file, { upsert: true })

      if (uploadErr) throw uploadErr

      const { data: { publicUrl } } = supabase.storage
        .from('vela-assets')
        .getPublicUrl(path)

      setPreview(publicUrl)
      if (onUploaded) onUploaded(publicUrl)
    } catch (err) {
      setError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      <label className="text-sm text-white/50">{label}</label>
      {aspectHint && <p className="text-xs text-white/20">{aspectHint}</p>}

      <div
        onClick={() => fileRef.current?.click()}
        className="relative border border-dashed border-white/10 rounded-xl p-4 cursor-pointer
          hover:border-white/20 transition-colors flex items-center justify-center min-h-[100px]"
      >
        {preview ? (
          <img src={preview} alt="" className="max-h-[120px] rounded-lg object-contain" />
        ) : (
          <div className="text-center">
            <Upload className="h-6 w-6 text-white/20 mx-auto mb-2" />
            <p className="text-xs text-white/30">Click to upload</p>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-black/60 rounded-xl flex items-center justify-center">
            <Loader2 className="h-6 w-6 text-white animate-spin" />
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
