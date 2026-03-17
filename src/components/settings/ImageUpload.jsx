import { useState, useRef, useCallback } from 'react'
import { Upload, X, Loader2, ZoomIn, ZoomOut, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import ReactCrop from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'

const MAX_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

const T = {
  bg: 'transparent', surface: 'rgba(255,255,255,0.65)', border: 'rgba(255,255,255,0.5)',
  borderHover: 'rgba(0,0,0,0.12)', text: '#1A1A1A',
  textSecondary: '#6B6B6B', textTertiary: '#ABABAB',
  accent: '#1A1A1A', font: "'DM Sans', sans-serif",
}

// Crop helper: produces a canvas blob from crop data
function getCroppedBlob(image, crop, zoom = 1) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const scaleX = image.naturalWidth / image.width
    const scaleY = image.naturalHeight / image.height
    canvas.width = crop.width * scaleX
    canvas.height = crop.height * scaleY
    ctx.drawImage(image,
      crop.x * scaleX, crop.y * scaleY,
      crop.width * scaleX, crop.height * scaleY,
      0, 0, canvas.width, canvas.height)
    canvas.toBlob(resolve, 'image/jpeg', 0.92)
  })
}

export default function ImageUpload({ label, storageKey, folder = 'uploads', aspectHint, onUploaded, currentUrl }) {
  const [preview, setPreview] = useState(currentUrl || null)
  const [rawFile, setRawFile] = useState(null) // original file for cropping
  const [rawUrl, setRawUrl] = useState(null) // object URL of raw file
  const [crop, setCrop] = useState(null)
  const [completedCrop, setCompletedCrop] = useState(null)
  const [showCrop, setShowCrop] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)
  const imgRef = useRef(null)

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    if (!ALLOWED_TYPES.includes(file.type)) { setError('Use JPEG, PNG, WebP, or GIF.'); return }
    if (file.size > MAX_SIZE) { setError('Maximum 5MB.'); return }
    setRawFile(file)
    setRawUrl(URL.createObjectURL(file))
    setCrop(null)
    setCompletedCrop(null)
    setShowCrop(true)
  }

  const uploadImage = async (blob) => {
    setUploading(true)
    try {
      const ext = 'jpg'
      const path = `${folder}/${storageKey}_${Date.now()}.${ext}`
      const { error: err } = await supabase.storage.from('vela-assets').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (err) throw err
      const { data: { publicUrl } } = supabase.storage.from('vela-assets').getPublicUrl(path)
      setPreview(publicUrl)
      setShowCrop(false)
      setRawUrl(null)
      if (onUploaded) onUploaded(publicUrl)
    } catch (err) { setError(err.message || 'Upload failed') }
    finally { setUploading(false) }
  }

  const saveCrop = async () => {
    if (!imgRef.current || !completedCrop?.width) {
      // No crop — upload original
      if (rawFile) uploadImage(rawFile)
      return
    }
    const blob = await getCroppedBlob(imgRef.current, completedCrop)
    if (blob) uploadImage(blob)
  }

  const cancelCrop = () => { setShowCrop(false); setRawUrl(null); setRawFile(null) }

  return (
    <div style={{ fontFamily: T.font }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: T.text, display: 'block', marginBottom: 6 }}>{label}</label>
      {aspectHint && <p style={{ fontSize: 11, color: T.textTertiary, margin: '0 0 8px' }}>{aspectHint}</p>}

      {/* Crop modal */}
      {showCrop && rawUrl && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: T.surface, borderRadius: 16, padding: 24, maxWidth: 520, width: '90%', boxShadow: '0 24px 80px rgba(0,0,0,0.15)' }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: T.text, margin: '0 0 16px' }}>Crop {label}</p>
            <div style={{ maxHeight: 400, overflow: 'auto', borderRadius: 8, background: T.bg, display: 'flex', justifyContent: 'center' }}>
              <ReactCrop crop={crop} onChange={setCrop} onComplete={setCompletedCrop}>
                <img ref={imgRef} src={rawUrl} alt="" style={{ maxHeight: 380, maxWidth: '100%', objectFit: 'contain' }} />
              </ReactCrop>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={cancelCrop} style={{ height: 36, padding: '0 16px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, color: T.textSecondary, fontSize: 13, cursor: 'pointer', fontFamily: T.font }}>Cancel</button>
              <button onClick={saveCrop} disabled={uploading} style={{ height: 36, padding: '0 20px', borderRadius: 8, border: 'none', background: T.accent, color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 6 }}>
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload zone */}
      <div onClick={() => fileRef.current?.click()} style={{
        border: `1px dashed ${T.border}`, borderRadius: 12, padding: 16, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 90,
        transition: 'border-color 0.15s', background: T.bg,
      }}
        onMouseOver={e => e.currentTarget.style.borderColor = T.borderHover}
        onMouseOut={e => e.currentTarget.style.borderColor = T.border}
      >
        {preview ? (
          <img src={preview} alt="" style={{ maxHeight: 100, borderRadius: 8, objectFit: 'contain' }} />
        ) : (
          <div style={{ textAlign: 'center' }}>
            <Upload size={20} color={T.textTertiary} style={{ margin: '0 auto 6px' }} />
            <p style={{ fontSize: 12, color: T.textTertiary, margin: 0 }}>Click to upload</p>
          </div>
        )}
        {uploading && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.8)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loader2 size={20} className="animate-spin" color={T.accent} />
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
      {error && <p style={{ fontSize: 12, color: '#C62828', marginTop: 6 }}>{error}</p>}
    </div>
  )
}
