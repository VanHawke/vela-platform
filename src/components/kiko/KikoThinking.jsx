// src/components/kiko/KikoThinking.jsx
// Shows what Kiko is doing: thinking, searching, checking CRM, etc.

import React from 'react'

const TOOL_LABELS = {
  read_email: 'Reading email...',
  search_conversations: 'Searching conversations...',
  ask_data_agent: 'Checking CRM...',
  create_email_draft: 'Drafting email...',
  get_cognitive_analysis: 'Reviewing analysis...',
  navigate_page: 'Navigating...',
  web_search: 'Searching the web...',
  ask_deal_agent: 'Checking deal...',
  ask_outreach_agent: 'Checking outreach...',
  ask_memory_engine: 'Recalling...',
  log_activity: 'Logging activity...',
  manage_knowledge: 'Updating knowledge...',
}

export function getToolLabel(toolName) {
  return TOOL_LABELS[toolName] || 'Processing...'
}

export default function KikoThinking({ status }) {
  // status: null | 'thinking' | 'Searching Gmail...' | etc.
  if (!status) return null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 0', color: 'rgba(90,100,112,0.6)',
      fontSize: 13, fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{ display: 'flex', gap: 3 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 5, height: 5, borderRadius: '50%',
            background: 'rgba(180,90,40,0.4)',
            animation: `kikoDotPulse 1.4s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
      <span>{status === 'thinking' ? 'Kiko is thinking...' : status}</span>
    </div>
  )
}
