// src/components/settings/SignatureEditor.jsx
// Single paste box. Paste your full Gmail/Apple Mail signature.
// On paste: extracts any inline base64/blob images, uploads to Supabase Storage,
// rewrites src URLs to public, stores clean HTML. You paste once. It just works.
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import T from '@/lib/theme'

export default function SignatureEditor({ value, onChange, userId, label, placeholder, minHeight = 140 }) {
  const ref = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  // Load initial value into the contentEditable on mount and when value changes externally
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (value || '')) {
      ref.current.innerHTML = value || ''
    }
  }, [value])

  // Upload a base64 data URL to Supabase storage, return public https URL
  async function uploadDataUrl(dataUrl, idx) {
    const match = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/)
    if (!match) return null
    const mime = match[1]
    const ext = mime.split('/')[1].replace('+xml', '') || 'png'
    const b64 = match[2]
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    const blob = new Blob([bytes], { type: mime })
    const path = `signatures/${userId || 'anon'}-${Date.now()}-${idx}.${ext}`
    const { error: upErr } = await supabase.storage.from('brand-assets').upload(path, blob, { contentType: mime, upsert: true })
    if (upErr) throw upErr
    const { data } = supabase.storage.from('brand-assets').getPublicUrl(path)
    return data?.publicUrl || null
  }

  // Process pasted HTML: find <img src="data:..."> and upload them all to Supabase
  async function processHtml(html) {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const imgs = doc.querySelectorAll('img')
    if (imgs.length === 0) return doc.body.innerHTML
    setUploading(true)
    setError('')
    try {
      let i = 0
      for (const img of imgs) {
        const src = img.getAttribute('src') || ''
        // Skip already-public URLs
        if (src.startsWith('http://') || src.startsWith('https://')) continue
        // Skip cid: refs (Gmail inline) — replace with broken-image marker
        if (src.startsWith('cid:')) {
          img.removeAttribute('src')
          img.setAttribute('alt', '[image — paste from a rendered email instead]')
          continue
        }
        // Upload base64 data URLs
        if (src.startsWith('data:')) {
          const url = await uploadDataUrl(src, i++)
          if (url) {
            img.setAttribute('src', url)
            // Constrain width if not set
            if (!img.getAttribute('width') && !img.style.width) img.setAttribute('width', '120')
          }
        }
      }
    } catch (e) {
      setError(e.message || 'Image upload failed')
    } finally {
      setUploading(false)
    }
    return doc.body.innerHTML
  }

  // Handle paste — capture HTML, process images, set into editor
  async function handlePaste(e) {
    const html = e.clipboardData.getData('text/html')
    if (!html) return // let plain text paste through
    e.preventDefault()
    const cleanHtml = await processHtml(html)
    // Insert into the contentEditable
    if (ref.current) {
      ref.current.innerHTML = cleanHtml
      onChange(cleanHtml)
    }
  }

  // Handle ongoing edits (typing, deleting)
  function handleInput() {
    if (ref.current) onChange(ref.current.innerHTML)
  }

  return (
    <div>
      {label && <label style={{ display: 'block', fontSize: 11, color: T.textSecondary, marginBottom: 6, fontFamily: T.font }}>{label}</label>}
      <p style={{ fontSize: 11, color: T.textTertiary, margin: '0 0 6px', fontFamily: T.font }}>
        Paste your full email signature directly from Gmail or Apple Mail. Images upload automatically.
      </p>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onPaste={handlePaste}
        onInput={handleInput}
        spellCheck={false}
        style={{
          width: '100%', minHeight, padding: '14px 16px',
          borderRadius: 8, border: `1px solid ${uploading ? 'rgba(167,139,250,0.30)' : 'rgba(255,255,255,0.10)'}`,
          background: '#ffffff', color: '#000000',
          fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 13, lineHeight: 1.5,
          outline: 'none', overflow: 'auto', boxSizing: 'border-box',
          transition: 'border-color 0.15s',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span style={{ fontSize: 10, color: T.textTertiary, fontFamily: T.font }}>
          {uploading ? '⏳ Uploading images...' : 'Live preview — what you see is what gets sent'}
        </span>
        {error && <span style={{ fontSize: 10, color: '#f87171' }}>{error}</span>}
      </div>
    </div>
  )
}
