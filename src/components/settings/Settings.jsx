// Settings.jsx — two-pane Settings with section sidebar
// Mockup-faithful port of kiko-settings.html

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import PageHeader from '@/components/layout/PageHeader'
import './Settings.css'

const SECTIONS = [
  { group: 'Account', items: [
    { id: 'profile',  label: 'Profile' },
    { id: 'email',    label: 'Email & sending' },
    { id: 'password', label: 'Password' },
    { id: 'security', label: 'Sign-in & security' },
  ]},
  { group: 'Workspace', items: [
    { id: 'workspace', label: 'Van Hawke Group' },
    { id: 'members',   label: 'Members & roles' },
    { id: 'branding',  label: 'Branding' },
  ]},
  { group: 'Kiko', items: [
    { id: 'personality', label: 'Personality & tone' },
    { id: 'memory',      label: 'Memory & rules' },
    { id: 'autoactions', label: 'Auto-actions' },
    { id: 'voice',       label: 'Voice mode' },
  ]},
  { group: 'Integrations', items: [
    { id: 'apps', label: 'Connected apps' },
  ]},
  { group: 'Billing', items: [
    { id: 'plan',     label: 'Plan & usage' },
    { id: 'invoices', label: 'Invoices' },
  ]},
]

export default function Settings({ user }) {
  const [active, setActive] = useState('profile')
  const [profile, setProfile] = useState({
    name: 'Sunny Sidhu',
    display: 'Sunny',
    title: 'CEO, Van Hawke Group',
    email: user?.email || 'sunny@vanhawke.com',
    location: 'Weybridge, United Kingdom',
    timezone: 'Europe/London (BST · UTC+1)',
    workStart: '08:00',
    workEnd: '19:00',
    weekendMode: true,
    appendKiko: false,
    tone: 'Direct',
    mode: 'Strategic advisor (default)',
    signature: `Sunny Sidhu\nCEO · Van Hawke Group\nsunny@vanhawke.com · +44 (0) 20 8004 3300\nvanhawke.com`,
  })
  const [hasChanges, setHasChanges] = useState(false)
  const upd = (k, v) => { setProfile(p => ({ ...p, [k]: v })); setHasChanges(true) }


  return (
    <div className="st">
      <PageHeader
        eyebrowCategory="ACCOUNT"
        eyebrowSuffix="Workspace settings"
        title="Settings"
      />

      <div className="st-body">
        {/* LEFT: side nav */}
        <aside className="st-side">
          {SECTIONS.map(grp => (
            <div key={grp.group}>
              <div className="st-side-h">{grp.group}</div>
              {grp.items.map(item => (
                <button
                  key={item.id}
                  className={`st-side-link ${active === item.id ? 'active' : ''}`}
                  onClick={() => setActive(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </aside>

        {/* RIGHT: content */}
        <main className="st-content">
          {active === 'profile' && (
            <>
              <div className="st-content-h">
                <div className="st-eyebrow"><span className="cat">ACCOUNT</span><span className="sep">/</span>Profile</div>
                <h2 className="st-content-title">Profile</h2>
                <p className="st-content-sub">How you appear inside Kiko and to anyone you're working with. Some of this also controls how Kiko addresses you and signs off your drafts.</p>
              </div>

              <div className="st-panel">
                <div className="st-panel-h"><div className="pt">Identity</div><div className="ps">Visible to your workspace</div></div>
                <div className="st-field">
                  <div className="field-label">Profile photo<div className="field-help">Square, ≥256px. Used for meeting avatars and team views.</div></div>
                  <div className="field-input">
                    <div className="avatar-upload">
                      <div className="avatar-big">{profile.display[0]}</div>
                      <div className="avatar-actions">
                        <button className="ghost-btn">Upload</button>
                        <button className="ghost-btn danger">Remove</button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="st-field">
                  <div className="field-label">Full name<span className="req">*</span></div>
                  <div className="field-input"><input className="input" value={profile.name} onChange={e => upd('name', e.target.value)} /></div>
                </div>
                <div className="st-field">
                  <div className="field-label">Display name<div className="field-help">How Kiko addresses you in the app.</div></div>
                  <div className="field-input"><input className="input" value={profile.display} onChange={e => upd('display', e.target.value)} /></div>
                </div>
                <div className="st-field">
                  <div className="field-label">Job title</div>
                  <div className="field-input"><input className="input" value={profile.title} onChange={e => upd('title', e.target.value)} /></div>
                </div>
                <div className="st-field">
                  <div className="field-label">Email<span className="req">*</span></div>
                  <div className="field-input"><input className="input" value={profile.email} onChange={e => upd('email', e.target.value)} type="email" /></div>
                </div>
              </div>


              <div className="st-panel">
                <div className="st-panel-h"><div className="pt">Location & time</div><div className="ps">Used by Kiko to schedule sends, briefs, and meeting prep</div></div>
                <div className="st-field">
                  <div className="field-label">Primary location</div>
                  <div className="field-input"><input className="input" value={profile.location} onChange={e => upd('location', e.target.value)} /></div>
                </div>
                <div className="st-field">
                  <div className="field-label">Timezone</div>
                  <div className="field-input">
                    <select className="select" value={profile.timezone} onChange={e => upd('timezone', e.target.value)}>
                      <option>Europe/London (BST · UTC+1)</option>
                      <option>Asia/Qatar (Doha · UTC+3)</option>
                      <option>America/New_York (EDT · UTC−4)</option>
                    </select>
                  </div>
                </div>
                <div className="st-field">
                  <div className="field-label">Working hours<div className="field-help">Kiko avoids scheduling sends and briefs outside this window.</div></div>
                  <div className="field-input">
                    <input className="input" value={profile.workStart} onChange={e => upd('workStart', e.target.value)} style={{width:90}} />
                    <span style={{color:'#A0A0A0'}}>→</span>
                    <input className="input" value={profile.workEnd} onChange={e => upd('workEnd', e.target.value)} style={{width:90}} />
                  </div>
                </div>
                <div className="st-field">
                  <div className="field-label">Weekend mode<div className="field-help">Pause non-urgent sends Sat–Sun.</div></div>
                  <div className="field-input">
                    <div className={`toggle ${profile.weekendMode ? 'on' : ''}`} onClick={() => upd('weekendMode', !profile.weekendMode)}></div>
                  </div>
                </div>
              </div>

              <div className="st-panel">
                <div className="st-panel-h"><div className="pt">Email signature</div><div className="ps">Appended to every Kiko-drafted send</div></div>
                <div className="st-field">
                  <div className="field-label">Signature block</div>
                  <div className="field-input"><textarea className="textarea" value={profile.signature} onChange={e => upd('signature', e.target.value)} /></div>
                </div>
                <div className="st-field">
                  <div className="field-label">Append "Sent via Kiko"<div className="field-help">Adds a small attribution at the bottom.</div></div>
                  <div className="field-input"><div className={`toggle ${profile.appendKiko ? 'on' : ''}`} onClick={() => upd('appendKiko', !profile.appendKiko)}></div></div>
                </div>
              </div>

              <div className="st-panel">
                <div className="st-panel-h"><div className="pt">How Kiko speaks to you</div><div className="ps">Personality preview · full settings under <strong>Kiko / Personality & tone</strong></div></div>
                <div className="st-field">
                  <div className="field-label">Tone with you<div className="field-help">How Kiko addresses you in the app.</div></div>
                  <div className="field-input">
                    <div className="seg">
                      {['Casual','Direct','Formal'].map(t => (
                        <button key={t} className={profile.tone === t ? 'active' : ''} onClick={() => upd('tone', t)}>{t}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="st-field">
                  <div className="field-label">Default mode<div className="field-help">Per your operating doctrine: hard truth → action steps → direct challenge.</div></div>
                  <div className="field-input">
                    <select className="select" value={profile.mode} onChange={e => upd('mode', e.target.value)}>
                      <option>Strategic advisor (default)</option>
                      <option>Coach</option>
                      <option>Operator</option>
                      <option>Devil's advocate</option>
                    </select>
                  </div>
                </div>
              </div>


              <div className="st-panel">
                <div className="st-panel-h">
                  <div className="pt">Connected accounts</div>
                  <div className="ps"><a className="pri-link">Manage all →</a></div>
                </div>
                {[
                  { icon: 'gmail', name: 'Gmail · sunny@vanhawke.com', meta: <>Connected · <strong>read & send</strong> · syncing every 2 min</> },
                  { icon: 'gcal', name: 'Google Calendar', meta: <>Connected · <strong>read & write</strong> · 4 meetings auto-prepped this week</> },
                  { icon: 'linkedin', name: 'LinkedIn', meta: <>Connected via Hetzner worker · <strong>178.104.73.22</strong> · 28 connections accepted this week</> },
                  { icon: 'lemlist', name: 'Lemlist', meta: <>Connected · 5 active sequences · webhook last fired 3m ago</> },
                  { icon: 'supabase', name: 'Supabase · vanhawke-crm', meta: <>Connected · <strong>RLS enforced</strong> · 247 contacts · 8 isolation tests passed</> },
                ].map(c => (
                  <div className="conn-row" key={c.icon}>
                    <div className={`conn-icon ${c.icon}`}>{c.icon === 'gmail' ? 'M' : c.icon === 'gcal' ? 'G' : c.icon === 'linkedin' ? 'in' : c.icon === 'lemlist' ? 'L' : 'S'}</div>
                    <div className="conn-info">
                      <div className="conn-name">{c.name}</div>
                      <div className="conn-meta"><span className="conn-dot"></span>{c.meta}</div>
                    </div>
                    <button className="ghost-btn">Manage</button>
                  </div>
                ))}
              </div>

              {/* SAVE BAR */}
              {hasChanges && (
                <div className="save-bar">
                  <div className="changes"><strong>Unsaved changes</strong> · review and save</div>
                  <div className="save-bar-btns">
                    <button className="ghost-btn" onClick={() => { setHasChanges(false) }}>Discard</button>
                    <button className="pri-btn" onClick={() => { setHasChanges(false); /* TODO: persist to supabase */ }}>Save changes</button>
                  </div>
                </div>
              )}
            </>
          )}

          {active !== 'profile' && (
            <div className="st-content-h">
              <div className="st-eyebrow"><span className="cat">{SECTIONS.find(s => s.items.find(i => i.id === active))?.group.toUpperCase()}</span><span className="sep">/</span>{SECTIONS.flatMap(s => s.items).find(i => i.id === active)?.label}</div>
              <h2 className="st-content-title">{SECTIONS.flatMap(s => s.items).find(i => i.id === active)?.label}</h2>
              <p className="st-content-sub">This panel is being built. Profile is fully functional — other sections coming next.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
