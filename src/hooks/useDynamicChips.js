// src/hooks/useDynamicChips.js — Context-aware suggestion chips
// Homepage: based on live pipeline/task/email state
// Float: based on current page + visible content
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const FALLBACK_HOME = ['Brief me', 'Pipeline update', 'Check emails', "What's on today?"]
const FALLBACK_FLOAT = ['Brief me on my pipeline', "What's happening in F1?", 'Draft a follow-up email', 'Summarise yesterday']

// Page-specific static chips (used when no live data available)
const PAGE_CHIPS = {
  pipeline: ['Show stale deals', 'Pipeline forecast', 'Move a deal forward', 'Draft outreach'],
  contacts: ['Who needs follow-up?', 'Stale contacts', 'Enrich new contacts', 'Search contacts'],
  'command-centre': ['Overdue tasks', 'This week\'s priorities', 'Create a task', 'Check emails'],
  'partnership-matrix': ['Open categories on Haas', 'Recent partner changes', 'Category conflicts', 'Competitor analysis'],
  organisations: ['Top prospects by funding', 'Due diligence check', 'Sponsorship readiness', 'Compare organisations'],
  calendar: ['What\'s on today?', 'Schedule a meeting', 'F1 race calendar', 'Free time this week'],
  lemlist: ['Campaign performance', 'Warm leads', 'Bounced emails', 'Credit balance'],
  news: ['Deal signals this week', 'F1 partnership news', 'Funding announcements', 'Industry trends'],
}

export function useDynamicChips(page = 'home', isFloat = false) {
  const [chips, setChips] = useState(isFloat ? FALLBACK_FLOAT : FALLBACK_HOME)

  useEffect(() => {
    if (page === 'home' && !isFloat) {
      loadHomeChips().then(setChips)
    } else if (isFloat) {
      loadFloatChips(page).then(setChips)
    }
  }, [page, isFloat])

  return chips
}

async function loadHomeChips() {
  try {
    const chips = []
    const [taskRes, dealRes, alertRes, triageRes] = await Promise.all([
      supabase.from('tasks').select('data').order('updated_at', { ascending: false }).limit(20),
      supabase.from('deals').select('data').eq('data->>status', 'active').order('updated_at', { ascending: false }).limit(20),
      supabase.from('kiko_alerts').select('id', { count: 'exact', head: true }).eq('dismissed', false),
      supabase.from('kiko_inbox_triage').select('summary,priority_emails').order('triage_date', { ascending: false }).limit(1),
    ])

    const tasks = (taskRes.data || []).map(t => t.data).filter(Boolean)
    const deals = (dealRes.data || []).map(d => d.data).filter(Boolean)
    const alertCount = alertRes.count || 0
    const triage = triageRes.data?.[0]

    // Overdue tasks
    const overdue = tasks.filter(t => !t.completed && t.dueDate && new Date(t.dueDate) < new Date())
    if (overdue.length > 0) chips.push(`${overdue.length} overdue tasks`)

    // Stale deals
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)
    const stale = deals.filter(d => d.lastActivity && new Date(d.lastActivity) < thirtyDaysAgo)
    if (stale.length > 0) chips.push(`${stale.length} stale deals`)

    // Inbox
    if (triage?.priority_emails?.length) {
      const actions = triage.priority_emails.filter(e => e.priority === 'ACTION_REQUIRED')
      if (actions.length) chips.push(`${actions.length} email${actions.length > 1 ? 's' : ''} need action`)
    }

    // Always include brief
    chips.push('Brief me')

    // Fill to 4 with sensible defaults
    const defaults = ['Pipeline update', 'Check emails', 'What\'s on today?']
    while (chips.length < 4 && defaults.length) {
      const d = defaults.shift()
      if (!chips.includes(d)) chips.push(d)
    }

    return chips.slice(0, 4)
  } catch {
    return FALLBACK_HOME
  }
}

async function loadFloatChips(page) {
  try {
    const staticChips = PAGE_CHIPS[page]
    if (!staticChips) return FALLBACK_FLOAT

    // Enrich with live data where possible
    const chips = []

    if (page === 'pipeline') {
      const { data: deals } = await supabase.from('deals').select('data').eq('data->>status', 'active').order('updated_at', { ascending: false }).limit(5)
      const d = (deals || []).map(x => x.data).filter(Boolean)
      const stale = d.filter(x => x.lastActivity && new Date(x.lastActivity) < new Date(Date.now() - 30 * 86400000))
      if (stale.length) chips.push(`${stale.length} stale deal${stale.length > 1 ? 's' : ''} — what to do?`)
      if (d[0]?.company) chips.push(`Update on ${d[0].company}`)
      chips.push('Pipeline forecast', 'Draft outreach for top deal')
    } else if (page === 'contacts') {
      const { data: contacts } = await supabase.from('contacts').select('data').order('updated_at', { ascending: false }).limit(3)
      const c = (contacts || []).map(x => x.data).filter(Boolean)
      if (c[0]?.firstName) chips.push(`What do we know about ${c[0].firstName}?`)
      chips.push('Who needs follow-up?', 'Stale contacts', 'Search contacts')
    } else if (page === 'command-centre') {
      const { data: tasks } = await supabase.from('tasks').select('data').order('updated_at', { ascending: false }).limit(10)
      const t = (tasks || []).map(x => x.data).filter(Boolean)
      const overdue = t.filter(x => !x.completed && x.dueDate && new Date(x.dueDate) < new Date())
      if (overdue.length) chips.push(`${overdue.length} overdue — prioritise`)
      chips.push('Check emails', 'This week\'s priorities', 'Create a task')
    } else {
      chips.push(...staticChips)
    }

    return chips.slice(0, 4)
  } catch {
    return PAGE_CHIPS[page] || FALLBACK_FLOAT
  }
}
