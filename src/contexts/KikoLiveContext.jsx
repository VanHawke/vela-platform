// src/contexts/KikoLiveContext.jsx
// Single source of truth for all Kiko intelligence surfaces.
// Subscribes to Supabase Realtime on key tables. All components read from here.
// Every user action (dismiss, complete, clear) is logged to activities so Kiko remembers.
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'

const KikoLiveContext = createContext(null)

export function KikoLiveProvider({ children, user }) {
  const [alerts, setAlerts] = useState([])
  const [alertCount, setAlertCount] = useState(0)
  const [tasks, setTasks] = useState([])
  const [followUps, setFollowUps] = useState([])
  const [draftActions, setDraftActions] = useState([])
  const [loading, setLoading] = useState(true)
  const channelRef = useRef(null)

  // ── Load all data ──
  const reload = useCallback(async () => {
    try {
      const [alertRes, alertCountRes, taskRes, fuRes, draftRes] = await Promise.all([
        supabase.from('kiko_alerts')
          .select('id,type,severity,title,detail,entity_name,entity_id,metadata,created_at')
          .eq('dismissed', false)
          .order('created_at', { ascending: false }).limit(50),
        supabase.from('kiko_alerts')
          .select('id', { count: 'exact', head: true })
          .eq('dismissed', false)
          .in('type', ['email_reply', 'email_reply_manual', 'linkedin_reply', 'linkedin_connection_accepted', 'reply_from_prospect', 'follow_up_overdue', 'ooo_detected', 'email_bounced']),
        supabase.from('tasks')
          .select('*')
          .order('updated_at', { ascending: false }).limit(80),
        supabase.from('kiko_follow_ups')
          .select('id,sender_email,recipient_email,recipient_name,company,subject,sent_at,follow_up_due_at,status')
          .in('status', ['awaiting_reply', 'followed_up'])
          .order('follow_up_due_at', { ascending: true }).limit(20),
        supabase.from('kiko_draft_actions')
          .select('id,action_type,payload,created_at')
          .eq('status', 'pending')
          .order('created_at', { ascending: false }).limit(10),
      ])
      setAlerts(alertRes.data || [])
      setAlertCount(alertCountRes.count || 0)
      setTasks((taskRes.data || []).filter(t => !t.data?.completed))
      setFollowUps(fuRes.data || [])
      setDraftActions(draftRes.data || [])
    } catch (err) {
      console.error('[KikoLive] reload error:', err)
    }
    setLoading(false)
  }, [])

  // ── Initial load + Supabase Realtime subscriptions ──
  useEffect(() => {
    reload()

    // Subscribe to changes on key tables
    const channel = supabase.channel('kiko-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kiko_alerts' }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kiko_follow_ups' }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kiko_draft_actions' }, () => reload())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activities' }, () => reload())
      .subscribe()

    channelRef.current = channel
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [reload])

  // Expose alertCount on window for backward compat with KikoChat polling
  useEffect(() => {
    if (window) window.__kikoAlertCount = alertCount + draftActions.length
  }, [alertCount, draftActions])

  // ── Activity logger — Kiko reads this to understand what happened ──
  const logActivity = useCallback(async (type, entityName, detail) => {
    try {
      await supabase.from('activities').insert({
        type,
        entity_name: entityName,
        subject: detail,
        direction: 'internal',
        source: 'command_centre',
        created_at: new Date().toISOString(),
        org_id: user?.app_metadata?.org_id || '35975d96-c2c9-4b6c-b4d4-bb947ae817d5',
      })
    } catch {}
  }, [user])

  // ── Actions — modify DB + log for Kiko ──
  const dismissAlert = useCallback(async (alert) => {
    setAlerts(prev => prev.filter(a => a.id !== alert.id))
    setAlertCount(prev => Math.max(0, prev - 1))
    await supabase.from('kiko_alerts').update({ dismissed: true }).eq('id', alert.id)
    await logActivity('alert_dismissed', alert.entity_name || alert.title, `Dismissed alert: ${alert.title}`)
  }, [logActivity])

  const dismissAllAlerts = useCallback(async () => {
    const count = alerts.length
    setAlerts([])
    setAlertCount(0)
    await supabase.from('kiko_alerts').update({ dismissed: true }).eq('dismissed', false)
    await logActivity('alerts_cleared', 'All', `Cleared ${count} alerts`)
  }, [alerts.length, logActivity])

  const completeTask = useCallback(async (task) => {
    setTasks(prev => prev.filter(t => t.id !== task.id))
    const updated = { ...task.data, completed: true, completedAt: new Date().toISOString() }
    await supabase.from('tasks').update({ data: updated, updated_at: new Date().toISOString() }).eq('id', task.id)
    await logActivity('task_completed', task.data?.contact || task.data?.company || 'Task', `Completed: ${task.data?.title || task.data?.type || 'task'}`)
  }, [logActivity])

  const clearAllOverdue = useCallback(async () => {
    const overdue = tasks.filter(t => t.data?.dueDate && new Date(t.data.dueDate) < new Date())
    setTasks(prev => prev.filter(t => !(t.data?.dueDate && new Date(t.data.dueDate) < new Date())))
    for (const t of overdue) {
      await supabase.from('tasks').update({
        data: { ...t.data, completed: true, completedAt: new Date().toISOString(), autoCompleted: 'bulk_cleared' },
        updated_at: new Date().toISOString()
      }).eq('id', t.id)
    }
    await logActivity('tasks_bulk_cleared', 'Overdue', `Cleared ${overdue.length} overdue tasks`)
  }, [tasks, logActivity])

  const clearFollowUp = useCallback(async (fu) => {
    setFollowUps(prev => prev.filter(f => f.id !== fu.id))
    await supabase.from('kiko_follow_ups').update({ status: 'closed', updated_at: new Date().toISOString() }).eq('id', fu.id)
    await logActivity('followup_cleared', fu.recipient_name || fu.company, `Follow-up cleared: ${fu.recipient_name} at ${fu.company}`)
  }, [logActivity])

  const approveDraft = useCallback(async (draft) => {
    setDraftActions(prev => prev.filter(d => d.id !== draft.id))
    await supabase.from('kiko_draft_actions').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', draft.id)
    await logActivity('action_approved', draft.payload?.entity || 'Action', `Approved: ${draft.payload?.suggested_action || 'action'}`)
    return `Execute the approved action: ${draft.payload?.suggested_action || 'follow up'} for ${draft.payload?.entity || 'the contact'}`
  }, [logActivity])

  const dismissDraft = useCallback(async (draft) => {
    setDraftActions(prev => prev.filter(d => d.id !== draft.id))
    await supabase.from('kiko_draft_actions').update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', draft.id)
    await logActivity('action_dismissed', draft.payload?.entity || 'Action', `Dismissed: ${draft.payload?.suggested_action || 'action'}`)
  }, [logActivity])

  const value = {
    // State
    alerts, alertCount, tasks, followUps, draftActions, loading,
    // Actions
    reload, dismissAlert, dismissAllAlerts, completeTask, clearAllOverdue,
    clearFollowUp, approveDraft, dismissDraft, logActivity,
  }

  return (
    <KikoLiveContext.Provider value={value}>
      {children}
    </KikoLiveContext.Provider>
  )
}

export function useKikoLive() {
  const ctx = useContext(KikoLiveContext)
  if (!ctx) {
    // Fallback for components rendered outside provider (login, admin)
    return {
      alerts: [], alertCount: 0, tasks: [], followUps: [], draftActions: [], loading: false,
      reload: () => {}, dismissAlert: () => {}, dismissAllAlerts: () => {},
      completeTask: () => {}, clearAllOverdue: () => {}, clearFollowUp: () => {},
      approveDraft: () => {}, dismissDraft: () => {}, logActivity: () => {},
    }
  }
  return ctx
}
