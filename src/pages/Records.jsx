// src/pages/Records.jsx
// Redesign v2 — merged Contacts + Organisations with toggle
// Wraps existing Contacts.jsx and Organisations.jsx components
// until they're fully migrated into the redesigned layout

import { useState } from 'react'
import Contacts from './Contacts'
import Organisations from './Organisations'

export default function Records({ user }) {
  const [view, setView] = useState('people')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toggle bar — sits above the existing page content */}
      <div style={{
        padding: '12px 44px 0',
        display: 'flex', alignItems: 'center', gap: 12,
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex',
          background: 'rgba(0,0,0,0.03)',
          borderRadius: 24, padding: 2,
        }}>
          {['people', 'companies'].map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '6px 18px', borderRadius: 24,
                border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 500,
                fontFamily: "'Inter', system-ui, sans-serif",
                background: view === v ? '#FFFFFF' : 'transparent',
                color: view === v ? '#0A0A0A' : '#6B6B6B',
                boxShadow: view === v ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {v === 'people' ? 'People' : 'Companies'}
            </button>
          ))}
        </div>
      </div>

      {/* Render existing page component based on toggle */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {view === 'people' ? <Contacts user={user} /> : <Organisations user={user} />}
      </div>
    </div>
  )
}
