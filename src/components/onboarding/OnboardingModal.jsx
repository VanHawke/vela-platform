// src/components/onboarding/OnboardingModal.jsx
// 3-step onboarding for new org members. Shown once on first login.
// Dismissed via user_settings.onboarded = true.
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import T from '@/lib/theme'

const STEPS = [
  {
    title: 'Welcome to Van Hawke',
    body: 'This is the Kiko Intelligence Operating System — your AI-powered command centre for sponsorship origination, pipeline management, and strategic execution. Everything you need is here.',
  },
  {
    title: 'Private chats, shared CRM',
    body: 'Your conversations with Kiko are private — no one else sees them. But the CRM is shared across the organisation: pipeline, contacts, campaigns, and the partnership matrix are visible to all team members in real time.',
  },
  {
    title: 'Meet Kiko',
    body: 'Kiko lives in the chat bar at the bottom of every page. Ask her anything — pipeline status, draft an email, research a company, brief me on priorities. She has full access to the CRM, your calendar, and the web. Just type or click the waveform for voice.',
  },
]

export default function OnboardingModal({ user, onDismiss }) {
  const [step, setStep] = useState(0)

  const dismiss = async () => {
    try {
      await supabase.from('user_settings').upsert({ user_id: user?.id, onboarded: true, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    } catch {}
    onDismiss()
  }

  const current = STEPS[step]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        width: 440, background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: T.radiusXl, padding: 32, boxShadow: T.glassShadowFloat,
      }}>
        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 24 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: 50,
              background: i === step ? T.accent : T.border,
              transition: 'background 0.2s',
            }} />
          ))}
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 500, color: T.text, margin: '0 0 12px', fontFamily: T.font, textAlign: 'center' }}>
          {current.title}
        </h2>
        <p style={{ fontSize: 14, color: T.textSecondary, lineHeight: 1.7, margin: '0 0 28px', fontFamily: T.font, textAlign: 'center' }}>
          {current.body}
        </p>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={dismiss} style={{
            padding: '8px 16px', borderRadius: 50, border: `1px solid ${T.border}`,
            background: 'transparent', color: T.textTertiary, fontSize: 13,
            cursor: 'pointer', fontFamily: T.font,
          }}>Skip</button>

          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)} style={{
                padding: '8px 16px', borderRadius: 50, border: `1px solid ${T.border}`,
                background: 'transparent', color: T.textSecondary, fontSize: 13,
                cursor: 'pointer', fontFamily: T.font,
              }}>Back</button>
            )}
            <button onClick={() => step < STEPS.length - 1 ? setStep(s => s + 1) : dismiss()} style={{
              padding: '8px 20px', borderRadius: 50, border: 'none',
              background: T.accent, color: '#fff', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', fontFamily: T.font,
            }}>{step < STEPS.length - 1 ? 'Next' : 'Get started'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
