// src/hooks/useDynamicChips.js — Context-aware suggestion chips
// Homepage: pulls LIVE data — follow-ups due, recent replies, stale deals, tasks
// Each chip can carry an action (navigate to a page) alongside a prompt
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useKikoLive } from '@/contexts/KikoLiveContext'

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
  const live = useKikoLive()

  useEffect(() => {
    if (page === 'home' && !isFloat) {
      buildHomeChips(live).then(setChips)
    } else if (isFloat) {
      const statics = (PAGE_CHIPS[page] || PAGE_CHIPS.pipeline).map(l => ({ label: l, prompt: l }))
      setChips(statics.slice(0, 4))
    }
  }, [page, isFloat, live.followUps, live.tasks, live.alerts])

  return chips
}

async function buildHomeChips(live) {
  try {
    const chips = []
    const now = Date.now()

    // Use context data directly — no independent queries for followUps/tasks
    const followUpsData = live.followUps || []
    const tasksData = live.tasks || []

    // Still need deals and predictions from Supabase (not in context)
    const [dealRes, predRes] = await Promise.all([
      supabase.from('deals').select('data,updated_at')
        .not('data->>status', 'in', '("won","lost")')
        .order('updated_at', { ascending: false }).limit(50),
      supabase.from('kiko_alerts')
        .select('title,entity_name')
        .eq('type', 'prediction').eq('dismissed', false)
        .order('created_at', { ascending: false }).limit(2),
    ])

    // 1. Follow-ups due (from context)
    const followUps = followUpsData.filter(f => f.follow_up_due_at && new Date(f.follow_up_due_at) <= new Date(now + 7 * 86400000))
    for (const fu of followUps.slice(0, 2)) {
      const name = fu.recipient_name || fu.company || 'prospect'
      const isOverdue = new Date(fu.follow_up_due_at) < new Date()
      chips.push({
        label: isOverdue ? `⚡ ${name.split(' ')[0]} overdue` : `Follow up with ${name.split(' ')[0]}`,
        prompt: `Draft a follow-up email for ${name}${fu.company ? ' at ' + fu.company : ''}. Use a fresh angle — don't just "check in."`,
        navigate: '/command-centre',
      })
    }

    // 2. Recent replies (from context alerts)
    const replies = (live.alerts || []).filter(a => a.type?.includes('reply') || a.type?.includes('connection'))
    if (replies.length > 0) {
      const r = replies[0]
      const name = r.entity_name || 'prospect'
      chips.push({
        label: `Reply to ${name.split(' ')[0]}`,
        prompt: `We got a reply from ${name}. Brief me on their account and draft a response.`,
        navigate: '/command-centre',
      })
    }

    // 3. Top stale deal
    const deals = (dealRes.data || []).map(d => d.data).filter(Boolean)
    const stale = deals.filter(d => d.lastActivity && (now - new Date(d.lastActivity)) > 30 * 86400000 && (now - new Date(d.lastActivity)) < 365 * 86400000)
      .sort((a, b) => (parseFloat(b.value) || 0) - (parseFloat(a.value) || 0))
    if (stale.length > 0 && chips.length < 3) {
      const d = stale[0]
      chips.push({
        label: `${d.company || 'Deal'} needs attention`,
        prompt: `Brief me on ${d.company}. It's been ${Math.floor((now - new Date(d.lastActivity)) / 86400000)} days since last activity. What should I do?`,
        navigate: '/pipeline',
      })
    }

    // 4. Overdue tasks (from context)
    const overdue = tasksData.filter(t => !t.data?.completed && t.data?.dueDate && new Date(t.data.dueDate) < new Date())
    if (overdue.length > 0 && chips.length < 3) {
      chips.push({
        label: `${overdue.length} overdue tasks`,
        prompt: `I have ${overdue.length} overdue tasks. Prioritise them for me.`,
        navigate: '/command-centre',
      })
    }

    // 5. Prediction chip
    const preds = predRes.data || []
    if (preds.length > 0 && chips.length < 3) {
      chips.push({
        label: `🔮 ${preds[0].entity_name || 'Prediction'}`,
        prompt: `Tell me about the prediction for ${preds[0].entity_name || 'the portfolio'}. What should I do about it?`,
      })
    }

    // Fill with smart defaults
    const defaults = [
      { label: 'Brief me', prompt: 'Brief me' },
      { label: 'Pipeline update', prompt: 'Pipeline update' },
      { label: 'Check emails', prompt: 'Check emails' },
      { label: "What's on today?", prompt: "What's on today?" },
    ]
    while (chips.length < 4 && defaults.length) {
      const d = defaults.shift()
      if (!chips.find(c => c.label === d.label)) chips.push(d)
    }

    return chips.slice(0, 5)
  } catch (err) {
    console.error('[useDynamicChips] buildHomeChips failed:', err)
    return FALLBACK_HOME
  }
}
