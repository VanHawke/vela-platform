import { useState, useEffect, useCallback, useRef } from 'react'
import Editor from '@monaco-editor/react'
import {
  FolderOpen, File, ChevronRight, ChevronDown, RefreshCw,
  Send, Loader2, Rocket, GitBranch, Copy, RotateCcw
} from 'lucide-react'
import { Button } from '@/components/ui/button'

const LANG_MAP = {
  js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  json: 'json', css: 'css', html: 'html', md: 'markdown', py: 'python',
  sql: 'sql', sh: 'shell', yml: 'yaml', yaml: 'yaml',
}

export default function VelaCode({ user }) {
  const [tree, setTree] = useState([])
  const [expandedDirs, setExpandedDirs] = useState(new Set(['src', 'api']))
  const [activeFile, setActiveFile] = useState(null)
  const [originalContent, setOriginalContent] = useState('')
  const [content, setContent] = useState('')
  const [loadingFile, setLoadingFile] = useState(false)
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatStreaming, setChatStreaming] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const chatEndRef = useRef(null)

  useEffect(() => {
    fetchTree()
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const fetchTree = async () => {
    try {
      const res = await fetch('/api/vela-code?action=files')
      const data = await res.json()
      if (data.tree) setTree(data.tree)
    } catch (err) {
      console.error('[VelaCode] Tree fetch error:', err)
    }
  }

  const fetchFile = async (path) => {
    setLoadingFile(true)
    setActiveFile(path)
    try {
      const res = await fetch(`/api/vela-code?action=file&path=${encodeURIComponent(path)}`)
      const data = await res.json()
      setContent(data.content || '')
      setOriginalContent(data.content || '')
    } catch (err) {
      console.error('[VelaCode] File fetch error:', err)
    } finally {
      setLoadingFile(false)
    }
  }

  const toggleDir = (path) => {
    setExpandedDirs(prev => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }

  const handleChatSend = async () => {
    if (!chatInput.trim() || chatStreaming) return
    const msg = chatInput.trim()
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: msg }])
    setChatStreaming(true)

    try {
      const res = await fetch('/api/vela-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ai',
          message: msg,
          file_path: activeFile,
          file_content: content,
          history: chatMessages.slice(-10),
        }),
      })

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let full = ''
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const d = line.slice(6)
          if (d === '[DONE]') continue
          try {
            const j = JSON.parse(d)
            if (j.delta) full += j.delta
          } catch {}
        }
      }

      setChatMessages(prev => [...prev, { role: 'assistant', content: full }])

      // Check if response contains a code block — offer to apply
      if (full.includes('```')) {
        const codeMatch = full.match(/```(?:\w+)?\n([\s\S]*?)```/)
        if (codeMatch) {
          setChatMessages(prev => [...prev, {
            role: 'system',
            content: 'Code suggestion ready. Click "Apply to Editor" to use it.',
            code: codeMatch[1],
          }])
        }
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }])
    } finally {
      setChatStreaming(false)
    }
  }

  const applyCode = (code) => {
    setContent(code)
  }

  const handleDeploy = async () => {
    if (!activeFile || content === originalContent) return
    setDeploying(true)
    try {
      // Save file to GitHub
      const res = await fetch('/api/vela-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', path: activeFile, content }),
      })
      const data = await res.json()
      if (data.ok) {
        setOriginalContent(content)
        setChatMessages(prev => [...prev, { role: 'system', content: `File saved to GitHub. ${data.deployed ? 'Deploy triggered.' : ''}` }])
      } else {
        setChatMessages(prev => [...prev, { role: 'system', content: `Save failed: ${data.error}` }])
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'system', content: `Deploy error: ${err.message}` }])
    } finally {
      setDeploying(false)
    }
  }

  const ext = activeFile?.split('.').pop() || ''
  const language = LANG_MAP[ext] || 'plaintext'
  const isModified = content !== originalContent

  // Build tree structure
  const treeItems = buildTreeItems(tree)

  return (
    <div className="flex h-full">
      {/* Left — File tree */}
      <div className="w-[240px] border-r border-white/8 flex flex-col flex-shrink-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/8">
          <span className="text-xs font-medium text-white/50">FILES</span>
          <button onClick={fetchTree} className="text-white/20 hover:text-white/50">
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1 text-xs">
          {renderTree(treeItems, 0, expandedDirs, toggleDir, fetchFile, activeFile)}
        </div>
      </div>

      {/* Centre — Monaco editor */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeFile && (
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/8 bg-white/[0.02]">
            <div className="flex items-center gap-2 text-xs text-white/50">
              <File className="h-3 w-3" />
              <span>{activeFile}</span>
              {isModified && <span className="text-yellow-400">●</span>}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => navigator.clipboard.writeText(content)}
                className="text-white/20 hover:text-white/50 p-1"
                title="Copy"
              >
                <Copy className="h-3 w-3" />
              </button>
              <button
                onClick={() => setContent(originalContent)}
                disabled={!isModified}
                className="text-white/20 hover:text-white/50 disabled:opacity-20 p-1"
                title="Reset"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
              <Button
                onClick={handleDeploy}
                disabled={!isModified || deploying}
                size="sm"
                className="h-7 text-xs bg-green-600 hover:bg-green-500 text-white ml-2"
              >
                {deploying ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Rocket className="h-3 w-3 mr-1" />}
                Save & Deploy
              </Button>
            </div>
          </div>
        )}
        <div className="flex-1">
          {loadingFile ? (
            <div className="flex items-center justify-center h-full text-white/20">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : activeFile ? (
            <Editor
              height="100%"
              language={language}
              value={content}
              onChange={(v) => setContent(v || '')}
              theme="vs-dark"
              options={{
                fontSize: 13,
                minimap: { enabled: false },
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                padding: { top: 8 },
                renderLineHighlight: 'line',
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-white/15 text-sm">
              Select a file to edit
            </div>
          )}
        </div>
      </div>

      {/* Right — Kiko code chat */}
      <div className="w-[340px] border-l border-white/8 flex flex-col flex-shrink-0">
        <div className="px-4 py-3 border-b border-white/8 flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-white/30" />
          <span className="text-sm font-medium text-white/60">Kiko Code</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {chatMessages.length === 0 && (
            <p className="text-xs text-white/20 text-center mt-8">
              Ask Kiko to modify code, explain logic, or suggest improvements.
            </p>
          )}
          {chatMessages.map((msg, i) => (
            <div key={i} className={msg.role === 'user' ? 'text-right' : 'text-left'}>
              {msg.role === 'system' ? (
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2 text-xs text-green-400">
                  {msg.content}
                  {msg.code && (
                    <button
                      onClick={() => applyCode(msg.code)}
                      className="block mt-1 text-green-300 underline text-[10px]"
                    >
                      Apply to Editor
                    </button>
                  )}
                </div>
              ) : (
                <div className={`inline-block px-3 py-2 rounded-xl text-xs max-w-[90%] ${
                  msg.role === 'user'
                    ? 'bg-white text-black'
                    : 'bg-white/5 text-white/70'
                }`}>
                  <pre className="whitespace-pre-wrap font-mono text-[11px]">{msg.content}</pre>
                </div>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <div className="p-3 border-t border-white/8">
          <div className="flex items-center gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
              placeholder="Ask Kiko about this code..."
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/20 outline-none"
            />
            <button
              onClick={handleChatSend}
              disabled={chatStreaming || !chatInput.trim()}
              className="text-white/30 hover:text-white/60 disabled:opacity-20 p-1"
            >
              {chatStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Tree helpers ---
function buildTreeItems(flatTree) {
  const root = { children: {} }
  for (const item of flatTree) {
    const parts = item.path.split('/')
    let current = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      if (!current.children[part]) {
        current.children[part] = {
          name: part,
          path: parts.slice(0, i + 1).join('/'),
          type: i === parts.length - 1 ? item.type : 'tree',
          children: {},
        }
      }
      current = current.children[part]
    }
  }
  return root.children
}

function renderTree(items, depth, expandedDirs, toggleDir, fetchFile, activeFile) {
  const sorted = Object.values(items).sort((a, b) => {
    if (a.type === 'tree' && b.type !== 'tree') return -1
    if (a.type !== 'tree' && b.type === 'tree') return 1
    return a.name.localeCompare(b.name)
  })

  return sorted.map(item => {
    const isDir = item.type === 'tree'
    const isExpanded = expandedDirs.has(item.path)
    const isActive = activeFile === item.path

    return (
      <div key={item.path}>
        <button
          onClick={() => isDir ? toggleDir(item.path) : fetchFile(item.path)}
          className={`w-full text-left flex items-center gap-1 px-2 py-1 hover:bg-white/5 transition-colors ${
            isActive ? 'bg-white/8 text-white' : 'text-white/40'
          }`}
          style={{ paddingLeft: depth * 12 + 8 }}
        >
          {isDir ? (
            isExpanded ? <ChevronDown className="h-3 w-3 flex-shrink-0" /> : <ChevronRight className="h-3 w-3 flex-shrink-0" />
          ) : (
            <File className="h-3 w-3 flex-shrink-0 text-white/20" />
          )}
          <span className="truncate">{item.name}</span>
        </button>
        {isDir && isExpanded && Object.keys(item.children).length > 0 && (
          renderTree(item.children, depth + 1, expandedDirs, toggleDir, fetchFile, activeFile)
        )}
      </div>
    )
  })
}
