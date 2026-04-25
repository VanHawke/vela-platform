// src/hooks/useDynamicChips.js — Context-aware suggestion chips
// Homepage: pulls LIVE data — follow-ups due, recent replies, stale deals, tasks
// Each chip can carry an action (navigate to a page) alongside a prompt
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const FALLBACK_HOME = [
  { label: 'Brief me', prompt: 'Brief me' },
  { label: 'Pipeline update', prompt: 'Pipeline update' },
  { label: 'Check emails', prompt: 'Check emails' },
  { label: "What's on today?", prompt: "What's on today?" },
]

const PAGE_CHIPS = {
  pipeline: ['Show stale deals', 'Pipeline forecast', 'Move a deal forward', 'Draft outreach'],
  contacts: ['Who needs follow-up?', 'Stale contacts', 'Enrich new contacts', 'Search contacts'],
  'command-centre': ['Overdue tasks', "This week's priorities", 'Create a task', 'Check emails'],
  'partnership-matrix': ['Open categories on Haas', 'Recent partner changes', 'Category conflicts', 'Competitor analysis'],
  organisations: ['Top prospects by funding', 'Due diligence check', 'Sponsorship readiness', 'Compare organisations'],
  calendar: ["What's on today?", 'Schedule a meeting', 'F1 race calendar', 'Free time this week'],
  news: ['Deal signals this week', 'F1 partnership news', 'Funding announcements', 'Industry trends'],
}

export function useDynamicChips(page = 'home', isFloat = false) {
  const [chips, setChips] = useState(isFloat ? PAGE_CHIPS[page]?.map(l => ({ label: l, prompt: l })) || FALLBACK_HOME : FALLBACK_HOME)

  useEffect(() => {
    if (page === 'home' && !isFloat) {
      loadHomeChips().then(setChips)
    } else if (isFloat) {
      const statics = (PAGE_CHIPS[page] || PAGE_CHIPS.pipeline).map(l => ({ label: l, prompt: l }))
      setChips(statics.slice(0, 4))
    }
  }, [page, isFloat])

  return chips
}

async function loadHomeChips() {
  try {
    const chips = []
    const now = Date.now()
    const [followUpRes, replyRes, taskRes, dealRes, predRes] = await Promise.all([
      // Follow-ups due or overdue
      supabase.from('kiko_follow_ups')
        .select('recipient_name,company,follow_up_due_at')
        .in('status', ['awaiting_reply', 'followed_up'])
        .order('follow_up_due_at', { ascending: true }).limit(5),
      // Recent replies (last 48h)
      supabase.from('kiko_alerts')
        .select('entity_name,title,type')
        .or('type.like.reply_from%,type.eq.email_reply,type.eq.linkedin_reply,type.eq.linkedin_connection_accepted')
        .gte('created_at', new Date(now - 48 * 3600000).toISOString())
        .eq('dismissed', false)
        .order('created_at', { ascending: false }).limit(3),
      // Overdue tasks with entity names
      supabase.from('tasks').select('data')
        .order('updated_at', { ascending: false }).limit(30),
      // Stale deals — most valuable first
      supabase.from('deals').select('data,updated_at')
        .not('data->>status', 'in', '("won","lost")')
        .order('updated_at', { ascending: false }).limit(50),
      // Recent predictions
      supabase.from('kiko_alerts')
        .select('title,entity_name')
        .eq('type', 'prediction').eq('dismissed', false)
        .order('created_at', { ascending: false }).limit(2),
    ])

    // 1. Follow-ups due — "Follow up with [Name]"
    const followUps = (followUpRes.data || []).filter(f => f.follow_up_due_at && new Date(f.follow_up_due_at) <= new Date(now + 2 * 86400000))
    if (followUps.length > 0) {
      const fu = followUps[0]
      const name = fu.recipient_name || fu.company || 'prospect'
      chips.push({
        label: `Follow up with ${name.split(' ')[0]}`,
        prompt: `Draft a follow-up email for ${name}${fu.company ? ' at ' + fu.company : ''}. Use a fresh angle — don't just "check in."`,
        navigate: '/command-centre',
      })
    }

    // 2. Unreplied recent reply — "Reply to [Name]"
    const replies = replyRes.data || []
    if (replies.length > 0) {
      const r = replies[0]
      const name = r.entity_name || 'prospect'
      const isLinkedIn = r.type?.includes('linkedin')
      chips.push({
        label: `Reply to ${name.split(' ')[0]}`,
        prompt: isLinkedIn
          ? `${name} accepted our LinkedIn connection. Draft a first message — warm, referencing why we connected.`
          : `We got a reply from ${name}. Brief me on their account and draft a response.`,
        navigate: '/command-centre',
      })
    }

    // 3. Top stale deal — "[Company] needs attention"
    const deals = (dealRes.data || []).map(d => d.data).filter(Boolean)
    const stale = deals.filter(d => d.lastActivity && (now - new Date(d.lastActivity)) > 30 * 86400000)
      .sort((a, b) => (parseFloat(b.value) || 0) - (parseFloat(a.value) || 0))
    if (stale.length > 0) {
      const d = stale[0]
      chips.push({
        label: `${d.company || 'Deal'} needs attention`,
        prompt: `Brief me on ${d.company}. It's been ${Math.floor((now - new Date(d.lastActivity)) / 86400000)} days since last activity. What should I do?`,
        navigate: '/pipeline',
      })
    }

    // 4. Overdue tasks
    const tasks = (taskRes.data || []).map(t => t.data).filter(Boolean)
    const overdue = tasks.filter(t => !t.completed && t.dueDate && new Date(t.dueDate) < new Date())
    if (overdue.length > 0 && overdue[0].company) {
      chips.push({
        label: `${overdue.length} overdue — ${overdue[0].company || 'tasks'}`,
        prompt: `I have ${overdue.length} overdue tasks. Prioritise them and tell me what to do first.`,
        navigate: '/command-centre',
      })
    } else if (overdue.length > 0) {
      chips.push({
        label: `${overdue.length} overdue tasks`,
        prompt: `I have ${overdue.length} overdue tasks. Prioritise them for me.`,
        navigate: '/command-centre',
      })
    }

    // 5. Prediction chip — "Kiko predicts: [entity]"
    const preds = predRes.data || []
    if (preds.length > 0 && chips.length < 4) {
      const p = preds[0]
      chips.push({
        label: `🔮 ${p.entity_name || 'Prediction'}`,
        prompt: `Tell me about the prediction for ${p.entity_name || 'the portfolio'}. What should I do about it?`,
      })
    }

    // Always include brief me if not enough
    if (chips.length < 2) chips.push({ label: 'Brief me', prompt: 'Brief me' })

    // Fill remaining with smart defaults
    const defaults = [
      { label: 'Pipeline update', prompt: 'Pipeline update' },
      { label: 'Check emails', prompt: 'Check emails' },
      { label: "What's on today?", prompt: "What's on today?" },
    ]
    while (chips.length < 4 && defaults.length) {
      const d = defaults.shift()
      if (!chips.find(c => c.label === d.label)) chips.push(d)
    }

    return chips.slice(0, 5)
  } catch {
    return FALLBACK_HOME
  }
}
