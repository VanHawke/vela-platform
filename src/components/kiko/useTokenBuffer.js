// src/components/kiko/useTokenBuffer.js
// Smooth token-by-token rendering from chunked SSE streams
// Usage: const { displayText, pushChunk, isBuffering, reset } = useTokenBuffer()

import { useState, useRef, useCallback, useEffect } from 'react'

const CHARS_PER_FRAME = 3 // Adjust for speed: 2=slow/smooth, 4=fast
const FRAME_MS = 16 // ~60fps

export default function useTokenBuffer() {
  const buffer = useRef([])
  const [displayText, setDisplayText] = useState('')
  const displayRef = useRef('')
  const rafRef = useRef(null)
  const isBuffering = useRef(false)

  const tick = useCallback(() => {
    if (buffer.current.length === 0) {
      isBuffering.current = false
      rafRef.current = null
      return
    }
    const batch = buffer.current.splice(0, CHARS_PER_FRAME).join('')
    displayRef.current += batch
    setDisplayText(displayRef.current)
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  const pushChunk = useCallback((chunk) => {
    if (!chunk) return
    buffer.current.push(...chunk.split(''))
    if (!rafRef.current) {
      isBuffering.current = true
      rafRef.current = requestAnimationFrame(tick)
    }
  }, [tick])

  // Flush remaining buffer immediately (for when streaming ends)
  const flush = useCallback(() => {
    if (buffer.current.length > 0) {
      displayRef.current += buffer.current.join('')
      buffer.current = []
      setDisplayText(displayRef.current)
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    isBuffering.current = false
  }, [])

  const reset = useCallback(() => {
    buffer.current = []
    displayRef.current = ''
    setDisplayText('')
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    isBuffering.current = false
  }, [])

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return { displayText, pushChunk, flush, reset, isBuffering: isBuffering.current }
}
