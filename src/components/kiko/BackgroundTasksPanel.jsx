// src/components/kiko/BackgroundTasksPanel.jsx
// Fixed right-edge panel showing background task status (running/done/error).
// Realtime subscription on kiko_background_tasks + 60s safety poll (mirrors ThreadIndicator pattern).
// Phase 2 of background task system. Phase 3 (chat integration) is separate.

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Loader2, CheckCircle2, AlertCircle, X, ChevronRight, ChevronLeft, Layers } from 'lucide-react'
import T from '@/lib/theme'

function elapsed(startedAt) {
  if (!startedAt) return '0s'
  const secs = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const rem = secs % 60
  return `${mins}m ${rem}s`
}

function timeAgo(d) {
  if (!d) return ''
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ago`
}

export default function BackgroundTasksPanel({ user }) {
  const [tasks, setTasks] = useState([])
  const [expanded, setExpanded] = useState(false)
  const panelRef = useRef(null)

  // Fetch tasks
  useEffect(() => {
    if (!user?.id) return
    let alive = true

    const fetchTasks = async () => {
      try {
        const { data, error } = await supabase
          .from('kiko_background_tasks')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20)
        if (!alive || error) return
        setTasks(data || [])
      } catch {}
    }

    fetchTasks()

    // Realtime channel — mirror ThreadIndicator pattern
    const channel = supabase
      .channel(`bg_tasks:${user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'kiko_background_tasks', filter: `user_id=eq.${user.id}` },
        () => { fetchTasks() }
      )
      .subscribe()

    // 60s safety poll
    const poll = setInterval(fetchTasks, 60_000)

    return () => {
      alive = false
      clearInterval(poll)
      try { supabase.removeChannel(channel) } catch {}
    }
  }, [user?.id])

  // Tick elapsed time for running tasks
  useEffect(() => {
    const hasRunning = tasks.some(t => t.status === 'running')
    if (!hasRunning) return
    const interval = setInterval(() => setTasks(prev => [...prev]), 1000)
    return () => clearInterval(interval)
  }, [tasks])

  // Auto-hide done tasks from local state after 5 min
  useEffect(() => {
    const doneTasks = tasks.filter(t => t.status === 'done' && t.completed_at)
    if (doneTasks.length === 0) return
    const timers = doneTasks.map(t => {
      const age = Date.now() - new Date(t.completed_at).getTime()
      const remaining = Math.max(0, 5 * 60 * 1000 - age)
      if (remaining === 0) return null
      return setTimeout(() => {
        setTasks(prev => prev.filter(p => p.id !== t.id))
      }, remaining)
    }).filter(Boolean)
    return () => timers.forEach(clearTimeout)
  }, [tasks])

  // Click outside to collapse
  useEffect(() => {
    if (!expanded) return
    const handle = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setExpanded(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [expanded])

  const runningCount = tasks.filter(t => t.status === 'running').length
  const activeCount = tasks.filter(t => ['running', 'queued'].includes(t.status)).length

  // Open in chat handler (Phase 3 will listen for this)
  const openInChat = (task) => {
    console.log('[BackgroundTasksPanel] Open in chat:', task.id, task.conversation_id)
    window.dispatchEvent(new CustomEvent('kiko_open_task_result', {
      detail: { task_id: task.id, conversation_id: task.conversation_id, result_text: task.result_text }
    }))
  }

  // Retry handler
  const retryTask = async (task) => {
    try {
      await fetch('/api/kiko-task-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: task.conversation_id,
          query: task.query,
          user_id: user.id,
        }),
      })
    } catch {}
  }

  // Dismiss single task
  const dismissTask = async (task) => {
    if (task.status === 'running' && !window.confirm('Cancel this running task?')) return
    try { await fetch(`/api/kiko-task-dismiss?id=${task.id}`, { method: 'DELETE' }) } catch {}
    setTasks(prev => prev.filter(t => t.id !== task.id))
  }

  // Clear all done/error/cancelled tasks
  const clearableCount = tasks.filter(t => ['done', 'error', 'cancelled'].includes(t.status)).length
  const clearDone = async () => {
    const toClear = tasks.filter(t => ['done', 'error', 'cancelled'].includes(t.status))
    if (toClear.length === 0) return
    if (!window.confirm(`Clear ${toClear.length} completed task${toClear.length > 1 ? 's' : ''}?`)) return
    const ids = toClear.map(t => t.id).join(',')
    try { await fetch(`/api/kiko-task-dismiss?ids=${ids}`, { method: 'DELETE' }) } catch {}
    setTasks(prev => prev.filter(t => !['done', 'error', 'cancelled'].includes(t.status)))
  }

  if (tasks.length === 0) return null

  return (
    <div ref={panelRef} style={{
      position: 'fixed', right: 0, top: 80, zIndex: 9990,
      display: 'flex', flexDirection: 'row',
    }}>
      {/* Collapsed tab */}
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          style={{
            writingMode: 'vertical-rl', textOrientation: 'mixed',
            padding: '12px 8px', borderRadius: '8px 0 0 8px',
            background: T.surface, border: `1px solid ${T.border}`, borderRight: 'none',
            color: T.textSecondary, fontSize: 11, fontWeight: 500,
            fontFamily: 'var(--font)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
            transition: 'all 0.15s',
          }}
          onMouseOver={e => { e.currentTarget.style.background = T.surfaceHover; e.currentTarget.style.color = T.text }}
          onMouseOut={e => { e.currentTarget.style.background = T.surface; e.currentTarget.style.color = T.textSecondary }}
        >
          <Layers size={12} />
          <span>Tasks</span>
          {activeCount > 0 && (
            <span style={{
              writingMode: 'horizontal-tb',
              background: T.accent, color: '#fff',
              fontSize: 9, fontWeight: 700, borderRadius: 50,
              padding: '1px 6px', minWidth: 16, textAlign: 'center',
            }}>
              {activeCount}
            </span>
          )}
        </button>
      )}

      {/* Expanded panel */}
      {expanded && (
        <div style={{
          width: 360, maxHeight: 'calc(100vh - 100px)',
          background: T.surface,
          border: `1px solid ${T.border}`, borderRight: 'none',
          borderRadius: '12px 0 0 12px',
          boxShadow: T.glassShadowFloat,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', borderBottom: `1px solid ${T.border}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Layers size={14} color={T.accent} />
              <span style={{ fontSize: 13, fontWeight: 600, color: T.text, fontFamily: 'var(--font)' }}>
                Background tasks
              </span>
              {activeCount > 0 && (
                <span style={{
                  background: T.accent, color: '#fff',
                  fontSize: 9, fontWeight: 700, borderRadius: 50,
                  padding: '1px 6px',
                }}>
                  {activeCount}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {clearableCount > 0 && (
                <button onClick={clearDone} style={{
                  padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 500,
                  background: 'transparent', border: `1px solid ${T.border}`,
                  color: T.textTertiary, cursor: 'pointer', fontFamily: 'var(--font)',
                }}>Clear done</button>
              )}
              <button
                onClick={() => setExpanded(false)}
                style={{
                  width: 24, height: 24, borderRadius: 6,
                  background: 'transparent', border: 'none',
                  color: T.textTertiary, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Task list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {tasks.map(task => (
              <TaskRow key={task.id} task={task} onOpenChat={openInChat} onRetry={retryTask} onDismiss={dismissTask} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function TaskRow({ task, onOpenChat, onRetry, onDismiss }) {
  const queryPreview = (task.query || '').slice(0, 60) + (task.query?.length > 60 ? '…' : '')
  const resultPreview = (task.result_text || '').slice(0, 100) + (task.result_text?.length > 100 ? '…' : '')

  // Safety guardrail: auto-cancel running tasks older than 30 minutes (client-side backstop)
  const runawayRef = useRef(false)
  const isRunaway = task.status === 'running' && task.started_at && (Date.now() - new Date(task.started_at).getTime()) > 30 * 60 * 1000
  if (isRunaway && !runawayRef.current) {
    runawayRef.current = true
    supabase.from('kiko_background_tasks').update({ status: 'cancelled', error_message: 'Task exceeded 30 min runtime — auto-cancelled', completed_at: new Date().toISOString() }).eq('id', task.id).then(() => {})
  }

  const statusConfig = {
    queued: { icon: Loader2, color: T.textTertiary, label: 'Queued', spin: false },
    running: { icon: Loader2, color: T.accent, label: 'Running', spin: true },
    done: { icon: CheckCircle2, color: '#4ade80', label: 'Done', spin: false },
    error: { icon: AlertCircle, color: '#f87171', label: 'Error', spin: false },
    cancelled: { icon: X, color: T.textTertiary, label: 'Cancelled', spin: false },
  }
  const effectiveStatus = isRunaway ? 'error' : task.status
  const cfg = statusConfig[effectiveStatus] || statusConfig.queued
  const Icon = cfg.icon

  return (
    <div style={{
      padding: '10px 12px', borderRadius: 8,
      background: 'transparent',
      marginBottom: 4,
      transition: 'background 0.12s',
    }}
      onMouseOver={e => e.currentTarget.style.background = T.surfaceHover}
      onMouseOut={e => e.currentTarget.style.background = 'transparent'}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, position: 'relative' }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, marginTop: 1,
        }}>
          <Icon
            size={14}
            color={cfg.color}
            style={cfg.spin ? { animation: 'spin 1.5s linear infinite' } : {}}
          />
        </div>
        {/* Dismiss × */}
        <button onClick={(e) => { e.stopPropagation(); onDismiss(task) }} style={{
          position: 'absolute', top: -2, right: -4, width: 18, height: 18, borderRadius: 50,
          background: 'transparent', border: 'none', color: T.textMuted, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, padding: 0,
          opacity: 0.5, transition: 'opacity 0.15s',
        }}
          onMouseOver={e => e.currentTarget.style.opacity = '1'}
          onMouseOut={e => e.currentTarget.style.opacity = '0.5'}
          title="Dismiss task"
        ><X size={10} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 500, color: T.text,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            fontFamily: 'var(--font)',
          }}>
            {queryPreview}
          </div>
          <div style={{ fontSize: 10, color: T.textTertiary, marginTop: 2, fontFamily: 'var(--font)' }}>
            {effectiveStatus === 'running' && task.started_at && (
              <span>{elapsed(task.started_at)} elapsed</span>
            )}
            {effectiveStatus === 'done' && (
              <span>{timeAgo(task.completed_at)} · {task.elapsed_seconds}s</span>
            )}
            {effectiveStatus === 'error' && (
              <span style={{ color: '#f87171' }}>{isRunaway ? 'Task exceeded 30 min runtime — auto-cancelled' : (task.error_message || 'Unknown error').slice(0, 80)}</span>
            )}
            {effectiveStatus === 'queued' && <span>Waiting…</span>}
          </div>

          {/* Result preview for done tasks */}
          {effectiveStatus === 'done' && resultPreview && (
            <div style={{
              fontSize: 11, color: T.textSecondary, marginTop: 4,
              lineHeight: 1.4, fontFamily: 'var(--font)',
            }}>
              {resultPreview}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {effectiveStatus === 'done' && (
              <button
                onClick={() => onOpenChat(task)}
                style={{
                  padding: '3px 10px', borderRadius: 6,
                  background: T.accentSoft, border: `1px solid ${T.accentBorder}`,
                  color: T.accent, fontSize: 10, fontWeight: 500,
                  fontFamily: 'var(--font)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                Open in chat <ChevronRight size={10} />
              </button>
            )}
            {effectiveStatus === 'error' && (
              <button
                onClick={() => onRetry(task)}
                style={{
                  padding: '3px 10px', borderRadius: 6,
                  background: 'transparent', border: `1px solid ${T.border}`,
                  color: T.textSecondary, fontSize: 10, fontWeight: 500,
                  fontFamily: 'var(--font)', cursor: 'pointer',
                }}
              >
                Retry
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Spin animation */}
      {cfg.spin && (
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      )}
    </div>
  )
}
