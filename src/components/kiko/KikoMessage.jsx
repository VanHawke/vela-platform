// src/components/kiko/KikoMessage.jsx
// Renders a single Kiko message with markdown, code highlighting, and streaming cursor

import React, { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github.css' // Light theme syntax highlighting

// Strip tool calls, tool responses, and internal narration from display text
// Extract tool names from message for collapsible display
function extractToolNames(text) {
  if (!text) return []
  const matches = text.match(/"name"\s*:\s*"([^"]+)"/g) || []
  return [...new Set(matches.map(m => m.replace(/"name"\s*:\s*"/, '').replace('"', '')))].filter(n => !['text'].includes(n))
}

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

// Collapsible tool usage indicator
function ToolsUsed({ tools }) {
  const [expanded, setExpanded] = React.useState(false)
  if (!tools.length) return null
  const TOOL_LABELS = {
    ask_data_agent: 'CRM lookup', ask_deal_agent: 'Deal analysis', ask_outreach_agent: 'Outreach', 
    ask_strategy_agent: 'Strategy', ask_memory_engine: 'Memory', read_bible: 'Knowledge base',
    ask_negotiation_agent: 'Negotiation', ask_signal_agent: 'Signals', create_email_draft: 'Email draft',
    run_code: 'Code execution', kiko_self_modify: 'Self-edit', navigate_page: 'Navigation',
    manage_knowledge: 'Knowledge', query_relationships: 'Relationships', check_follow_ups: 'Follow-ups',
  }
  return (
    <div style={{ margin: '8px 0 4px', fontSize: 11, color: 'rgba(0,0,0,0.35)' }}>
      <button onClick={() => setExpanded(!expanded)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'rgba(0,0,0,0.35)', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>▸</span>
        {tools.length} tool{tools.length > 1 ? 's' : ''} used
      </button>
      {expanded && (
        <div style={{ marginTop: 4, paddingLeft: 12, borderLeft: '2px solid rgba(0,0,0,0.06)' }}>
          {tools.map((t, i) => <div key={i} style={{ padding: '1px 0' }}>{TOOL_LABELS[t] || t}</div>)}
        </div>
      )}
    </div>
  )
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


// ═══ ARTIFACT RENDERER — interactive HTML/SVG/chart rendering in chat ═══
function ArtifactFrame({ code, language }) {
  const ref = React.useRef(null)
  const [expanded, setExpanded] = React.useState(false)
  const [showCode, setShowCode] = React.useState(false)
  const height = expanded ? 600 : 340

  React.useEffect(() => {
    if (!ref.current) return
    const doc = ref.current.contentDocument
    if (!doc) return
    doc.open()
    if (language === 'svg') {
      doc.write('<html><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#fafafa">' + code + '</body></html>')
    } else {
      doc.write(code)
    }
    doc.close()
  }, [code, language])

  return (
    <div style={{ margin: '12px 0', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.08)', background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
        <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)', fontWeight: 500 }}>Interactive {language.toUpperCase()}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setShowCode(!showCode)} style={{ border: 'none', background: 'rgba(0,0,0,0.04)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 10, color: 'rgba(0,0,0,0.5)' }}>{showCode ? 'Preview' : 'Code'}</button>
          <button onClick={() => setExpanded(!expanded)} style={{ border: 'none', background: 'rgba(0,0,0,0.04)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 10, color: 'rgba(0,0,0,0.5)' }}>{expanded ? 'Collapse' : 'Expand'}</button>
          <button onClick={() => { const w = window.open(); w.document.write(code); w.document.close() }} style={{ border: 'none', background: 'rgba(0,0,0,0.04)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 10, color: 'rgba(0,0,0,0.5)' }}>Pop out</button>
        </div>
      </div>
      {showCode ? (
        <pre style={{ margin: 0, padding: 12, overflow: 'auto', background: 'rgba(0,0,0,0.02)', fontSize: 12, maxHeight: height }}><code>{code}</code></pre>
      ) : (
        <iframe ref={ref} sandbox="allow-scripts allow-same-origin" style={{ width: '100%', height, border: 'none', background: '#fff' }} title="Kiko Artifact" />
      )}
    </div>
  )
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
    const lang = (className || '').replace('language-', '')
    // ARTIFACT RENDERING — render HTML/SVG/chart blocks interactively
    if (['html', 'svg', 'artifact', 'dashboard', 'chart'].includes(lang)) {
      return <ArtifactFrame code={text} language={lang} />
    }
    return (
      <div style={{ position: 'relative', margin: '12px 0', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: 'rgba(0,0,0,0.03)', borderBottom: '1px solid rgba(0,0,0,0.04)', fontSize: 11, color: 'rgba(0,0,0,0.4)' }}>
          <span>{lang || 'code'}</span>
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

  // Extract tools used (before cleaning strips them)
  const toolsUsed = useMemo(() => extractToolNames(content), [content])

  // Assistant message — full markdown rendering
  const { complete, partial } = isStreaming ? splitAtSafeBoundary(cleaned) : { complete: cleaned, partial: '' }

  return (
    <div style={{
      fontSize: 14, lineHeight: 1.7, color: '#2a2a2a',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {complete && (
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={mdComponents}>
          {complete}
        </ReactMarkdown>
      )}
      {partial && <span>{partial}</span>}
      {isStreaming && <span style={{ display: 'inline-block', animation: 'kikoCursorBlink 1s step-end infinite', color: '#B45A28', marginLeft: 2, fontWeight: 300 }}>▊</span>}
      {!isStreaming && toolsUsed.length > 0 && <ToolsUsed tools={toolsUsed} />}
    </div>
  )
}
