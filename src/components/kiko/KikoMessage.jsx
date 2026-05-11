// src/components/kiko/KikoMessage.jsx
// Renders a single Kiko message with markdown, code highlighting, and streaming cursor

import React, { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Strip tool calls, tool responses, and internal narration from display text
function cleanForDisplay(text) {
  if (!text) return ''
  return text
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
    .replace(/<tool_response>[\s\S]*?<\/tool_response>/g, '')
    .replace(/<tool_call>[\s\S]*/g, '')
    .replace(/<tool_response>[\s\S]*/g, '')
    .replace(/\{"success"\s*:\s*true[\s\S]*?\}\s*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Split text into complete markdown (safe to parse) and partial (still streaming)
function splitAtSafeBoundary(text) {
  const lastBreak = text.lastIndexOf('\n\n')
  if (lastBreak === -1 || lastBreak < text.length - 200) {
    return { complete: text, partial: '' }
  }
  return {
    complete: text.slice(0, lastBreak),
    partial: text.slice(lastBreak + 2),
  }
}

// Custom components for react-markdown
const mdComponents = {
  // Code blocks with copy button
  code({ node, inline, className, children, ...props }) {
    if (inline) {
      return <code style={{
        background: 'rgba(0,0,0,0.04)', padding: '2px 6px', borderRadius: 4,
        fontSize: '0.9em', fontFamily: "'SF Mono', 'Fira Code', monospace",
      }} {...props}>{children}</code>
    }
    const text = String(children).replace(/\n$/, '')
    return (
      <div style={{ position: 'relative', margin: '12px 0', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: 'rgba(0,0,0,0.03)', borderBottom: '1px solid rgba(0,0,0,0.04)', fontSize: 11, color: 'rgba(0,0,0,0.4)' }}>
          <span>{(className || '').replace('language-', '') || 'code'}</span>
          <button onClick={() => navigator.clipboard.writeText(text)} style={{
            border: 'none', background: 'rgba(0,0,0,0.04)', borderRadius: 4, padding: '2px 8px',
            cursor: 'pointer', fontSize: 11, color: 'rgba(0,0,0,0.5)',
          }}>Copy</button>
        </div>
        <pre style={{ margin: 0, padding: 12, overflow: 'auto', background: 'rgba(0,0,0,0.02)', fontSize: 13, lineHeight: 1.5 }}>
          <code className={className} {...props}>{children}</code>
        </pre>
      </div>
    )
  },
  // Tables
  table({ children }) {
    return (
      <div style={{ overflowX: 'auto', margin: '12px 0' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>{children}</table>
      </div>
    )
  },
  th({ children }) {
    return <th style={{ borderBottom: '2px solid rgba(0,0,0,0.08)', padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'rgba(0,0,0,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{children}</th>
  },
  td({ children }) {
    return <td style={{ borderBottom: '1px solid rgba(0,0,0,0.04)', padding: '8px 12px' }}>{children}</td>
  },
  // Blockquotes
  blockquote({ children }) {
    return <blockquote style={{ borderLeft: '3px solid rgba(180,90,40,0.3)', margin: '12px 0', padding: '8px 16px', color: 'rgba(0,0,0,0.6)', background: 'rgba(180,90,40,0.02)', borderRadius: '0 6px 6px 0' }}>{children}</blockquote>
  },
  // Headers
  h1({ children }) { return <h1 style={{ fontSize: 20, fontWeight: 600, margin: '20px 0 8px', color: '#0A0A0A', lineHeight: 1.3 }}>{children}</h1> },
  h2({ children }) { return <h2 style={{ fontSize: 16, fontWeight: 600, margin: '16px 0 6px', color: '#0A0A0A', lineHeight: 1.3 }}>{children}</h2> },
  h3({ children }) { return <h3 style={{ fontSize: 14, fontWeight: 600, margin: '12px 0 4px', color: '#1a1a1a', lineHeight: 1.4 }}>{children}</h3> },
  // Links
  a({ href, children }) {
    return <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#B45A28', textDecoration: 'none', borderBottom: '1px solid rgba(180,90,40,0.2)' }}>{children}</a>
  },
  // Lists
  ul({ children }) { return <ul style={{ paddingLeft: 20, margin: '8px 0', lineHeight: 1.7 }}>{children}</ul> },
  ol({ children }) { return <ol style={{ paddingLeft: 20, margin: '8px 0', lineHeight: 1.7 }}>{children}</ol> },
  li({ children }) { return <li style={{ marginBottom: 4 }}>{children}</li> },
  // Paragraphs
  p({ children }) { return <p style={{ margin: '8px 0', lineHeight: 1.7 }}>{children}</p> },
}

export default function KikoMessage({ content, isStreaming, role }) {
  const cleaned = useMemo(() => cleanForDisplay(content), [content])

  if (role === 'user') {
    return (
      <div style={{
        background: 'rgba(180,90,40,0.04)', borderRadius: '16px 16px 4px 16px',
        padding: '10px 16px', marginLeft: 60, fontSize: 14, lineHeight: 1.6,
        color: '#1a1a1a', fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        {cleaned}
      </div>
    )
  }

  // Assistant message — full markdown rendering
  const { complete, partial } = isStreaming ? splitAtSafeBoundary(cleaned) : { complete: cleaned, partial: '' }

  return (
    <div style={{
      fontSize: 14, lineHeight: 1.7, color: '#2a2a2a',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {complete && (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
          {complete}
        </ReactMarkdown>
      )}
      {partial && <span>{partial}</span>}
      {isStreaming && <span style={{ display: 'inline-block', animation: 'kikoCursorBlink 1s step-end infinite', color: '#B45A28', marginLeft: 2, fontWeight: 300 }}>▊</span>}
    </div>
  )
}
