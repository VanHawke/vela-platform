// src/components/settings/SignatureEditor.jsx
// Single paste box for email signatures.
// Handles three image source types from Gmail/Apple Mail clipboard:
//   1. data:image/...;base64,... → upload to Supabase, swap src
//   2. blob:https://mail.google.com/... → fetch the blob (works for ~5s after copy), upload, swap src
//   3. cid:... → look for matching image in clipboardData.items (Gmail puts PNG there alongside HTML), upload, swap src
// Anything we can't resolve gets a placeholder marker so the user knows.
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import T from '@/lib/theme'

export default function SignatureEditor({ value, onChange, userId, label, minHeight = 140 }) {
  const ref = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (value || '')) {
      ref.current.innerHTML = value || ''
    }
  }, [value])

  async function uploadBlob(blob, idx, ext = 'png') {
    const path = `signatures/${userId || 'anon'}-${Date.now()}-${idx}.${ext}`
    const { error: upErr } = await supabase.storage.from('brand-assets').upload(path, blob, { contentType: blob.type || 'image/png', upsert: true })
    if (upErr) throw upErr
    const { data } = supabase.storage.from('brand-assets').getPublicUrl(path)
    return data?.publicUrl || null
  }

  function dataUrlToBlob(dataUrl) {
    const m = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/)
    if (!m) return null
    const bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0))
    return new Blob([bytes], { type: m[1] })
  }

  async function processHtml(html, clipboardItems) {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const imgs = Array.from(doc.querySelectorAll('img'))

    // Collect any image files attached to the clipboard (Gmail puts the PNG of the
    // signature logo here alongside the HTML, so we can use it to resolve cid: refs)
    const clipboardImages = []
    if (clipboardItems) {
      for (const item of clipboardItems) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) clipboardImages.push(file)
        }
      }
    }

    if (imgs.length === 0 && clipboardImages.length === 0) return doc.body.innerHTML
    setUploading(true)
    setError('')
    let uploadCount = 0
    try {
      let i = 0
      let clipboardIdx = 0
      for (const img of imgs) {
        const src = img.getAttribute('src') || ''
        if (src.startsWith('http://') || src.startsWith('https://')) continue

        // 1. data: URL — decode + upload
        if (src.startsWith('data:')) {
          const blob = dataUrlToBlob(src)
          if (blob) {
            const url = await uploadBlob(blob, i++, src.match(/^data:image\/([a-zA-Z+]+)/)?.[1] || 'png')
            if (url) {
              img.setAttribute('src', url)
              if (!img.getAttribute('width') && !img.style.width) img.setAttribute('width', '160')
              uploadCount++
            }
          }
          continue
        }

        // 2. blob: URL (Gmail's local blob — usually fetchable for a few seconds)
        if (src.startsWith('blob:')) {
          try {
            const r = await fetch(src)
            const blob = await r.blob()
            const url = await uploadBlob(blob, i++, blob.type.split('/')[1] || 'png')
            if (url) {
              img.setAttribute('src', url)
              if (!img.getAttribute('width') && !img.style.width) img.setAttribute('width', '160')
              uploadCount++
              continue
            }
          } catch (err) {
            // Blob expired — fall through to clipboard fallback below
          }
        }

        // 3. cid: URL or unresolvable blob — try matching to a clipboard image file
        if ((src.startsWith('cid:') || src.startsWith('blob:')) && clipboardImages[clipboardIdx]) {
          try {
            const file = clipboardImages[clipboardIdx++]
            const url = await uploadBlob(file, i++, file.type.split('/')[1] || 'png')
            if (url) {
              img.setAttribute('src', url)
              if (!img.getAttribute('width') && !img.style.width) img.setAttribute('width', '160')
              uploadCount++
              continue
            }
          } catch (err) { /* fall through */ }
        }

        // 4. Last resort — leave a marker the user can replace
        img.setAttribute('src', '')
        img.setAttribute('alt', '[image — re-upload below]')
        img.style.display = 'none'
      }

      // If we still have unused clipboard images and no img tags consumed them, append at top
      while (clipboardIdx < clipboardImages.length) {
        const file = clipboardImages[clipboardIdx++]
        const url = await uploadBlob(file, i++, file.type.split('/')[1] || 'png')
        if (url) {
          const img = doc.createElement('img')
          img.setAttribute('src', url)
          img.setAttribute('width', '160')
          img.setAttribute('alt', 'logo')
          doc.body.insertBefore(img, doc.body.firstChild)
          uploadCount++
        }
      }
    } catch (e) {
      setError(e.message || 'Image upload failed')
    } finally {
      setUploading(false)
    }
    return doc.body.innerHTML
  }

  async function handlePaste(e) {
    const html = e.clipboardData.getData('text/html')
    const items = e.clipboardData.items
    if (!html && (!items || items.length === 0)) return
    e.preventDefault()
    const cleanHtml = await processHtml(html || '', items)
    if (ref.current) {
      ref.current.innerHTML = cleanHtml
      onChange(cleanHtml)
    }
  }

  function handleInput() {
    if (ref.current) onChange(ref.current.innerHTML)
  }

  // Manual upload — for cases where paste doesn't carry the image
  async function handleManualUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError('')
    try {
      const url = await uploadBlob(file, Date.now(), file.type.split('/')[1] || 'png')
      if (url && ref.current) {
        // Insert at cursor or at top
        const imgHtml = `<img src="${url}" width="160" alt="logo" />`
        ref.current.innerHTML = imgHtml + (ref.current.innerHTML || '')
        onChange(ref.current.innerHTML)
      }
    } catch (err) {
      setError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      {label && <label style={{ display: 'block', fontSize: 12, color: T.textSecondary, marginBottom: 6, fontFamily: T.font }}>{label}</label>}
      <p style={{ fontSize: 11, color: T.textTertiary, margin: '0 0 8px', fontFamily: T.font }}>
        Paste your full email signature directly from Gmail or Apple Mail. Logo images are uploaded automatically. If your logo doesn't appear, use the <strong>Upload logo</strong> button below.
      </p>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onPaste={handlePaste}
        onInput={handleInput}
        spellCheck={false}
        style={{
          width: '100%', minHeight, padding: '16px 18px',
          borderRadius: 8, border: `1px solid ${uploading ? 'rgba(167,139,250,0.30)' : 'rgba(255,255,255,0.12)'}`,
          background: '#ffffff', color: '#000000',
          fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 14, lineHeight: 1.5,
          outline: 'none', overflow: 'auto', boxSizing: 'border-box',
          transition: 'border-color 0.15s',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 12 }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(167,139,250,0.30)', background: 'rgba(167,139,250,0.08)', color: '#a78bfa', fontSize: 11, fontWeight: 500, cursor: uploading ? 'wait' : 'pointer', fontFamily: T.font }}>
          {uploading ? '⏳ Uploading...' : '+ Upload logo'}
          <input type="file" accept="image/*" disabled={uploading} onChange={handleManualUpload} style={{ display: 'none' }} />
        </label>
        <span style={{ fontSize: 10, color: T.textTertiary, fontFamily: T.font }}>
          {error ? <span style={{ color: '#f87171' }}>{error}</span> : 'Live preview — what you see is what gets sent'}
        </span>
      </div>
    </div>
  )
}
