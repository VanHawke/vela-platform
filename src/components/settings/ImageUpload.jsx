import { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, X, Loader2, ZoomIn, ZoomOut, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import ReactCrop from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'

const MAX_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

const T = {
  bg: '#000000', surface: 'rgba(124,92,252,0.04)', border: '#26262f',
  borderHover: '#26262f', text: '#f4f4f6',
  textSecondary: '#9b9ba3', textTertiary: '#7e7e88',
  accent: '#3a3a42', font: "'DM Sans', sans-serif",
}

// Crop helper: produces a canvas blob from crop data
// Safari-safe: validates image decode state, crop dimensions, and handles null toBlob callbacks
function getCroppedBlob(image, crop) {
  return new Promise((resolve, reject) => {
    // Safari bail 1: image not fully decoded yet (naturalWidth can be 0 during load)
    if (!image?.naturalWidth || !image?.naturalHeight) {
      return reject(new Error('Image still loading, please try again'))
    }
    const scaleX = image.naturalWidth / image.width
    const scaleY = image.naturalHeight / image.height
    const cw = Math.round((crop.width || 0) * scaleX)
    const ch = Math.round((crop.height || 0) * scaleY)
    // Safari bail 2: zero-dimension canvas — Safari returns null from toBlob on these, Chrome returns empty blob
    if (cw <= 0 || ch <= 0) {
      return reject(new Error('Crop area is empty — drag to select a region first'))
    }
    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      canvas.width = cw
      canvas.height = ch
      ctx.drawImage(
        image,
        crop.x * scaleX, crop.y * scaleY,
        crop.width * scaleX, crop.height * scaleY,
        0, 0, cw, ch
      )
      // Safari bail 3: toBlob callback can be invoked with null even when canvas is valid
      canvas.toBlob(
        (blob) => {
          if (!blob) reject(new Error('Safari could not encode the image — try a smaller or different image'))
          else resolve(blob)
        },
        'image/jpeg',
        0.92
      )
    } catch (err) {
      reject(err)
    }
  })
}

export default function ImageUpload({ label, storageKey, folder = 'uploads', aspectHint, onUploaded, currentUrl }) {
  const [preview, setPreview] = useState(currentUrl || null)

  // Sync preview whenever currentUrl changes — including removal (null)
  useEffect(() => {
    setPreview(currentUrl || null)
  }, [currentUrl])
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

  const uploadImage = async (blob, mimeTypeOverride) => {
    setUploading(true)
    setError('')
    try {
      // Respect the actual MIME type instead of hardcoding jpeg — Safari is stricter about mismatches
      const mime = mimeTypeOverride || blob?.type || 'image/jpeg'
      const extMap = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }
      const ext = extMap[mime] || 'jpg'
      const path = `${folder}/${storageKey}_${Date.now()}.${ext}`
      const { error: err } = await supabase.storage.from('vela-assets').upload(path, blob, { upsert: true, contentType: mime })
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
      // No crop drawn — upload original file with its real MIME type
      if (rawFile) uploadImage(rawFile, rawFile.type)
      return
    }
    try {
      const blob = await getCroppedBlob(imgRef.current, completedCrop)
      await uploadImage(blob, 'image/jpeg')
    } catch (err) {
      // Safari fallback: if canvas cropping fails, upload the uncropped original so user isn't stuck
      if (rawFile) {
        setError((err.message || 'Crop failed') + ' — uploading original instead')
        try { await uploadImage(rawFile, rawFile.type) } catch (e2) { setError(e2.message || 'Upload failed') }
      } else {
        setError(err.message || 'Could not process image')
      }
    }
  }

  const cancelCrop = () => { setShowCrop(false); setRawUrl(null); setRawFile(null) }

  return (
    <div style={{ fontFamily: T.font }}>
      <label style={{ fontSize: 14, fontWeight: 500, color: T.text, display: 'block', marginBottom: 6 }}>{label}</label>
      {aspectHint && <p style={{ fontSize: 12, color: T.textTertiary, margin: '0 0 8px' }}>{aspectHint}</p>}

      {/* Crop modal */}
      {showCrop && rawUrl && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(24px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: T.surface, borderRadius: 18, padding: 24, maxWidth: 520, width: '90%', boxShadow: '0 24px 80px #3a3a42' }}>
            <p style={{ fontSize: 16, fontWeight: 400, color: T.text, margin: '0 0 16px' }}>Crop {label}</p>
            <div style={{ maxHeight: 400, overflow: 'auto', borderRadius: 50, background: T.bg, display: 'flex', justifyContent: 'center' }}>
              <ReactCrop crop={crop} onChange={setCrop} onComplete={setCompletedCrop}>
                <img ref={imgRef} src={rawUrl} alt="" style={{ maxHeight: 380, maxWidth: '100%', objectFit: 'contain' }} />
              </ReactCrop>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={cancelCrop} style={{ height: 36, padding: '0 16px', borderRadius: 50, border: `1px solid ${T.border}`, background: T.surface, color: T.textSecondary, fontSize: 14, cursor: 'pointer', fontFamily: T.font }}>Cancel</button>
              <button onClick={saveCrop} disabled={uploading} style={{ height: 36, padding: '0 20px', borderRadius: 50, border: 'none', background: T.accent, color: '#f4f4f6', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 6 }}>
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload zone */}
      <div onClick={() => fileRef.current?.click()} style={{
        border: `1px dashed ${T.border}`, borderRadius: 50, padding: 16, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 90,
        transition: 'border-color 0.15s', background: T.bg,
      }}
        onMouseOver={e => e.currentTarget.style.borderColor = T.borderHover}
        onMouseOut={e => e.currentTarget.style.borderColor = T.border}
      >
        {preview ? (
          <img src={preview} alt="" style={{ maxHeight: 100, borderRadius: 50, objectFit: 'contain' }} />
        ) : (
          <div style={{ textAlign: 'center' }}>
            <Upload size={20} color={T.textTertiary} style={{ margin: '0 auto 6px' }} />
            <p style={{ fontSize: 13, color: T.textTertiary, margin: 0 }}>Click to upload</p>
          </div>
        )}
        {uploading && (
          <div style={{ position: 'absolute', inset: 0, background: '#f4f4f6', borderRadius: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loader2 size={20} className="animate-spin" color={T.accent} />
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
      {error && <p style={{ fontSize: 13, color: '#C62828', marginTop: 6 }}>{error}</p>}
    </div>
  )
}
