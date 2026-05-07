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
    email: user?.email || 'sunny@vanhawke.agency',
    location: 'Weybridge, United Kingdom',
    timezone: 'Europe/London (BST · UTC+1)',
    workStart: '08:00',
    workEnd: '19:00',
    weekendMode: true,
    appendKiko: false,
    tone: 'Direct',
    mode: 'Strategic advisor (default)',
    signature: `Sunny Sidhu\nCEO · Van Hawke Group\nsunny@vanhawke.agency · +44 (0) 20 8004 3300\nvanhawke.agency`,
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
                  { icon: 'gmail', name: 'Gmail · sunny@vanhawke.agency', meta: <>Connected · <strong>read & send</strong> · syncing every 2 min</> },
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
            <>
              <div className="st-content-h">
                <div className="st-eyebrow"><span className="cat">{SECTIONS.find(s => s.items.find(i => i.id === active))?.group.toUpperCase()}</span><span className="sep">/</span>{SECTIONS.flatMap(s => s.items).find(i => i.id === active)?.label}</div>
                <h2 className="st-content-title">{SECTIONS.flatMap(s => s.items).find(i => i.id === active)?.label}</h2>
                <p className="st-content-sub">{SECTION_DESCRIPTIONS[active] || 'Settings panel.'}</p>
              </div>
              {SECTION_PANELS[active] || (
                <div className="st-panel">
                  <div className="st-panel-h"><div className="pt">Coming soon</div></div>
                  <div style={{ padding: '20px 22px', fontSize: 12.5, color: '#6B6B6B' }}>This panel is being built.</div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}


const SECTION_DESCRIPTIONS = {
  email:        'How Kiko sends emails on your behalf — sender identity, reply-to address, signature variants, and per-sequence overrides.',
  password:     'Change your sign-in password.',
  security:     'Two-factor authentication, active sessions, sign-in history, and trusted devices.',
  workspace:    'Workspace name, default settings, and what every team member sees by default.',
  members:      'Invite teammates, set roles, and control who can access what across the platform.',
  branding:     'Custom logo, color tokens, and white-label settings shown on the login page and shared exports.',
  personality:  'Full personality config: tone variants per-recipient, signature mode, brutality slider, voice mode personality.',
  memory:       'View, edit, and prune what Kiko remembers about you, your business, and your prospects.',
  autoactions:  'What Kiko is allowed to do without asking — schedule sends, pause sequences, archive emails, etc.',
  voice:        'Voice mode setup — STT/TTS provider, wake word, voice ID, push-to-talk binding.',
  apps:         'Connect and manage Gmail, Calendar, LinkedIn, Lemlist, Slack, Notion and other integrations.',
  plan:         'Your current plan, usage this billing period, and how to upgrade.',
  invoices:     'Past invoices and payment method.',
}

const SECTION_PANELS = {
  email: (
    <>
      <div className="st-panel">
        <div className="st-panel-h"><div className="pt">Sending identity</div><div className="ps">Who emails appear to be from</div></div>
        <div className="st-field"><div className="field-label">From name</div><div className="field-input"><input className="input" defaultValue="Sunny Sidhu" /></div></div>
        <div className="st-field"><div className="field-label">From email</div><div className="field-input"><input className="input" defaultValue="sunny@vanhawke.agency" /></div></div>
        <div className="st-field"><div className="field-label">Reply-to<div className="field-help">Where replies should land. Defaults to From email if blank.</div></div><div className="field-input"><input className="input" placeholder="(same as From)" /></div></div>
        <div className="st-field"><div className="field-label">Daily send cap<div className="field-help">Max outbound emails per day across all sequences. Protects deliverability.</div></div><div className="field-input"><input className="input" defaultValue="120" style={{ width: 100 }} /></div></div>
      </div>
      <div className="st-panel">
        <div className="st-panel-h"><div className="pt">Send windows</div><div className="ps">When Kiko is allowed to send</div></div>
        <div className="st-field"><div className="field-label">Working hours</div><div className="field-input"><input className="input" defaultValue="08:00" style={{ width: 90 }} /><span style={{ color: '#A0A0A0' }}>→</span><input className="input" defaultValue="19:00" style={{ width: 90 }} /></div></div>
        <div className="st-field"><div className="field-label">Pause weekends</div><div className="field-input"><div className="toggle on"></div></div></div>
        <div className="st-field"><div className="field-label">Respect prospect timezone<div className="field-help">Send at the prospect's local 09:00–11:00 window.</div></div><div className="field-input"><div className="toggle on"></div></div></div>
      </div>
    </>
  ),
  workspace: (
    <>
      <div className="st-panel">
        <div className="st-panel-h"><div className="pt">Workspace identity</div><div className="ps">Visible to all members</div></div>
        <div className="st-field"><div className="field-label">Workspace name</div><div className="field-input"><input className="input" defaultValue="Van Hawke Group" /></div></div>
        <div className="st-field"><div className="field-label">Domain</div><div className="field-input"><input className="input" defaultValue="vanhawke.com" /></div></div>
        <div className="st-field"><div className="field-label">Industry</div><div className="field-input"><select className="select" defaultValue="Sports & Sponsorship Advisory"><option>Sports & Sponsorship Advisory</option><option>Luxury Goods</option><option>Capital Allocation</option></select></div></div>
      </div>
      <div className="st-panel">
        <div className="st-panel-h"><div className="pt">Defaults for new members</div><div className="ps">Applied when someone joins</div></div>
        <div className="st-field"><div className="field-label">Default role</div><div className="field-input"><select className="select" defaultValue="Member"><option>Owner</option><option>Admin</option><option>Member</option><option>Viewer</option></select></div></div>
        <div className="st-field"><div className="field-label">Default timezone</div><div className="field-input"><select className="select" defaultValue="Europe/London"><option>Europe/London</option><option>Asia/Qatar</option><option>America/New_York</option></select></div></div>
      </div>
    </>
  ),
  personality: (
    <>
      <div className="st-panel">
        <div className="st-panel-h"><div className="pt">Tone variants</div><div className="ps">How Kiko writes for different audiences</div></div>
        <div className="st-field"><div className="field-label">For prospects (cold)</div><div className="field-input"><div className="seg"><button>Warm</button><button className="active">Direct</button><button>Authority</button></div></div></div>
        <div className="st-field"><div className="field-label">For replies</div><div className="field-input"><div className="seg"><button>Casual</button><button className="active">Direct</button><button>Formal</button></div></div></div>
        <div className="st-field"><div className="field-label">For internal team</div><div className="field-input"><div className="seg"><button className="active">Casual</button><button>Direct</button><button>Formal</button></div></div></div>
      </div>
      <div className="st-panel">
        <div className="st-panel-h"><div className="pt">Operating doctrine</div><div className="ps">How Kiko speaks to you in the app</div></div>
        <div className="st-field"><div className="field-label">Format every reply<div className="field-help">Hard truth → action steps → direct challenge.</div></div><div className="field-input"><div className="toggle on"></div></div></div>
        <div className="st-field"><div className="field-label">No tolerance for excuses<div className="field-help">Push back on surface-level fixes. Focus on root causes.</div></div><div className="field-input"><div className="toggle on"></div></div></div>
        <div className="st-field"><div className="field-label">Skip preamble<div className="field-help">Jump straight into output. No "I hope this helps" pleasantries.</div></div><div className="field-input"><div className="toggle on"></div></div></div>
      </div>
    </>
  ),
  autoactions: (
    <div className="st-panel">
      <div className="st-panel-h"><div className="pt">What Kiko can do without asking</div><div className="ps">Toggle on to grant Kiko autonomy</div></div>
      {[
        ['Send drafted replies after I approve', true],
        ['Schedule outbound sends within working hours', true],
        ['Pause sequences when a prospect replies', true],
        ['Auto-archive low-priority emails older than 30 days', false],
        ['Move deals to next stage when criteria met', false],
        ['Auto-decline meeting invites that conflict with focus time', false],
        ['Send LinkedIn connection requests to enrolled prospects', true],
      ].map(([label, on], i) => (
        <div className="st-field" key={i}>
          <div className="field-label">{label}</div>
          <div className="field-input"><div className={`toggle ${on ? 'on' : ''}`}></div></div>
        </div>
      ))}
    </div>
  ),
  apps: (
    <div className="st-panel">
      <div className="st-panel-h"><div className="pt">All integrations</div><div className="ps">Connect or disconnect</div></div>
      {[
        { icon: 'gmail', name: 'Gmail', state: 'Connected · sunny@vanhawke.agency', cta: 'Disconnect' },
        { icon: 'gcal', name: 'Google Calendar', state: 'Connected · 4 events synced today', cta: 'Disconnect' },
        { icon: 'linkedin', name: 'LinkedIn (via Hetzner worker)', state: 'Connected · 178.104.73.22', cta: 'Disconnect' },
        { icon: 'lemlist', name: 'Lemlist', state: 'Connected · 5 active sequences', cta: 'Disconnect' },
        { icon: 'supabase', name: 'Supabase', state: 'Connected · vanhawke-crm · RLS enforced', cta: 'Manage' },
      ].map(c => (
        <div className="conn-row" key={c.icon}>
          <div className={`conn-icon ${c.icon}`}>{c.icon === 'gmail' ? 'M' : c.icon === 'gcal' ? 'G' : c.icon === 'linkedin' ? 'in' : c.icon === 'lemlist' ? 'L' : 'S'}</div>
          <div className="conn-info"><div className="conn-name">{c.name}</div><div className="conn-meta"><span className="conn-dot"></span>{c.state}</div></div>
          <button className="ghost-btn">{c.cta}</button>
        </div>
      ))}
    </div>
  ),
  password: (
    <div className="st-panel">
      <div className="st-panel-h"><div className="pt">Change password</div><div className="ps">Sign-in password for sunny@vanhawke.agency</div></div>
      <div className="st-field"><div className="field-label">Current password</div><div className="field-input"><input className="input" type="password" placeholder="••••••••" /></div></div>
      <div className="st-field"><div className="field-label">New password</div><div className="field-input"><input className="input" type="password" placeholder="At least 12 characters" /></div></div>
      <div className="st-field"><div className="field-label">Confirm new password</div><div className="field-input"><input className="input" type="password" /></div></div>
      <div className="st-field"><div className="field-label"></div><div className="field-input"><button className="ghost-btn" style={{ background: '#0A0A0A', color: 'white', border: 'none' }}>Update password</button></div></div>
    </div>
  ),
  security: (
    <>
      <div className="st-panel">
        <div className="st-panel-h"><div className="pt">Two-factor authentication</div><div className="ps">Strongly recommended</div></div>
        <div className="st-field"><div className="field-label">Enable 2FA<div className="field-help">Use an authenticator app like 1Password or Authy.</div></div><div className="field-input"><div className="toggle"></div></div></div>
        <div className="st-field"><div className="field-label">Backup codes<div className="field-help">Generate 10 single-use codes you can use if you lose your device.</div></div><div className="field-input"><button className="ghost-btn">Generate codes</button></div></div>
      </div>
      <div className="st-panel">
        <div className="st-panel-h"><div className="pt">Active sessions</div><div className="ps">Sign out anywhere you don't recognise</div></div>
        <div className="conn-row">
          <div className="conn-icon" style={{ background: '#0A0A0A', color: 'white' }}>💻</div>
          <div className="conn-info"><div className="conn-name">MacBook Air · Chrome · Weybridge UK</div><div className="conn-meta"><span className="conn-dot"></span>This device · last active just now</div></div>
          <button className="ghost-btn" disabled>Current</button>
        </div>
        <div className="conn-row">
          <div className="conn-icon" style={{ background: '#6B6B6B', color: 'white' }}>📱</div>
          <div className="conn-info"><div className="conn-name">iPhone · Safari · London UK</div><div className="conn-meta"><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#6B6B6B', marginRight: 5, verticalAlign: 'middle' }}></span>Last active 3h ago</div></div>
          <button className="ghost-btn danger">Sign out</button>
        </div>
      </div>
    </>
  ),
  members: (
    <div className="st-panel">
      <div className="st-panel-h"><div className="pt">Team members</div><div className="ps">2 members · 1 pending invite</div></div>
      <div className="conn-row">
        <div className="conn-icon" style={{ background: '#0A0A0A', color: 'white' }}>S</div>
        <div className="conn-info"><div className="conn-name">Sunny Sidhu (you)</div><div className="conn-meta">CEO · Owner · sunny@vanhawke.agency</div></div>
        <button className="ghost-btn" disabled>Owner</button>
      </div>
      <div className="conn-row">
        <div className="conn-icon" style={{ background: '#7d8a64', color: 'white' }}>L</div>
        <div className="conn-info"><div className="conn-name">Lotty Marston</div><div className="conn-meta">Member · lotty@vanhawke.com</div></div>
        <button className="ghost-btn">Edit role</button>
      </div>
      <div className="conn-row">
        <div className="conn-icon" style={{ background: 'rgba(184,156,92,0.20)', color: '#8a6f2c' }}>?</div>
        <div className="conn-info"><div className="conn-name">giacomo@vanhawkemaison.com</div><div className="conn-meta"><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#B89C5C', marginRight: 5, verticalAlign: 'middle' }}></span>Invite pending · sent 2 days ago</div></div>
        <button className="ghost-btn">Resend</button>
      </div>
      <div style={{ padding: '14px 22px', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
        <button className="ghost-btn" style={{ background: '#0A0A0A', color: 'white', border: 'none' }}>+ Invite member</button>
      </div>
    </div>
  ),
  branding: (
    <>
      <div className="st-panel">
        <div className="st-panel-h"><div className="pt">Custom branding</div><div className="ps">Shown on your login page and shared exports</div></div>
        <div className="st-field"><div className="field-label">Custom logo<div className="field-help">PNG or SVG, ≤200KB. Replaces the Kiko mark for your workspace.</div></div><div className="field-input"><button className="ghost-btn">Upload logo</button></div></div>
        <div className="st-field"><div className="field-label">Accent color<div className="field-help">Used for primary CTAs and active states.</div></div><div className="field-input"><input className="input" defaultValue="#0A0A0A" style={{ width: 120 }} /></div></div>
        <div className="st-field"><div className="field-label">Login page background</div><div className="field-input"><button className="ghost-btn">Upload image</button></div></div>
      </div>
      <div className="st-panel">
        <div className="st-panel-h"><div className="pt">Email branding</div><div className="ps">Applied to Kiko-drafted sends</div></div>
        <div className="st-field"><div className="field-label">Email signature image<div className="field-help">Shown above your text signature.</div></div><div className="field-input"><button className="ghost-btn">Upload</button></div></div>
        <div className="st-field"><div className="field-label">Footer disclaimer</div><div className="field-input"><textarea className="textarea" placeholder="Confidentiality notice, etc." /></div></div>
      </div>
    </>
  ),
  memory: (
    <div className="st-panel">
      <div className="st-panel-h"><div className="pt">What Kiko remembers</div><div className="ps">Persistent context · stored in kiko_memories table</div></div>
      {[
        { type: 'identity',     label: 'CEO of Van Hawke Group · based Weybridge UK · moving Doha' },
        { type: 'doctrine',     label: 'Communication: hard truth → action steps → direct challenge' },
        { type: 'doctrine',     label: 'Avoid generic openings ("hope this finds you well") · use "intelligent age" not "AI generation"' },
        { type: 'commercial',   label: 'Haas F1 primary sponsorship client · 5-email authority sequence locked' },
        { type: 'product',      label: 'Van Hawke Maison Archive 01 · "Cultural Performance Eyewear" category' },
        { type: 'preferences',  label: 'All financials in USD · "board-level" framing for cost/benefit/risk/time-to-value' },
        { type: 'identity',     label: 'Child in Year 1 at Oatlands School Weybridge' },
      ].map((m, i) => (
        <div className="conn-row" key={i}>
          <div className="conn-icon" style={{ background: 'rgba(0,0,0,0.06)', color: '#0A0A0A', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>{m.type.slice(0, 3)}</div>
          <div className="conn-info"><div className="conn-name" style={{ fontSize: 12.5, fontWeight: 400 }}>{m.label}</div><div className="conn-meta">{m.type}</div></div>
          <button className="ghost-btn danger">Forget</button>
        </div>
      ))}
      <div style={{ padding: '14px 22px', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
        <button className="ghost-btn">+ Add memory</button>
      </div>
    </div>
  ),
  voice: (
    <>
      <div className="st-panel">
        <div className="st-panel-h"><div className="pt">Voice mode</div><div className="ps">Push-to-talk and continuous voice interaction</div></div>
        <div className="st-field"><div className="field-label">Enable voice mode<div className="field-help">Requires microphone permission.</div></div><div className="field-input"><div className="toggle on"></div></div></div>
        <div className="st-field"><div className="field-label">STT provider</div><div className="field-input"><select className="select" defaultValue="Deepgram"><option>Deepgram</option><option>OpenAI Whisper</option></select></div></div>
        <div className="st-field"><div className="field-label">TTS provider</div><div className="field-input"><select className="select" defaultValue="Cartesia"><option>Cartesia (Serafina)</option><option>ElevenLabs</option></select></div></div>
        <div className="st-field"><div className="field-label">Voice ID<div className="field-help">Cartesia voice identifier for Kiko's spoken voice.</div></div><div className="field-input"><input className="input" defaultValue="4tRn1lSkEn13EVTuqb0g" /></div></div>
        <div className="st-field"><div className="field-label">Push-to-talk binding<div className="field-help">Hold this key to speak.</div></div><div className="field-input"><input className="input" defaultValue="Space (long press)" style={{ width: 220 }} /></div></div>
      </div>
    </>
  ),
  plan: (
    <>
      <div className="st-panel">
        <div className="st-panel-h"><div className="pt">Current plan</div><div className="ps">Renews 13 May 2026</div></div>
        <div style={{ padding: '20px 22px', display: 'flex', alignItems: 'flex-end', gap: 18 }}>
          <div>
            <div style={{ fontSize: 10.5, color: '#A0A0A0', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>Plan</div>
            <div style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 32, fontWeight: 300, letterSpacing: '-0.018em', lineHeight: 1, marginTop: 4 }}>Team</div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 10.5, color: '#A0A0A0', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>Monthly</div>
            <div style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 26, fontWeight: 300, letterSpacing: '-0.018em', lineHeight: 1, marginTop: 4 }}><span style={{ fontSize: '0.6em', color: '#6B6B6B', verticalAlign: '0.18em' }}>$</span>180</div>
          </div>
        </div>
      </div>
      <div className="st-panel">
        <div className="st-panel-h"><div className="pt">Usage this month</div><div className="ps">As of today</div></div>
        <div className="st-field"><div className="field-label">Emails sent</div><div className="field-input" style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}><strong>1,847</strong> <span style={{ color: '#A0A0A0' }}>/ unlimited</span></div></div>
        <div className="st-field"><div className="field-label">Kiko AI requests</div><div className="field-input" style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}><strong>4,213</strong> <span style={{ color: '#A0A0A0' }}>/ 10,000</span></div></div>
        <div className="st-field"><div className="field-label">Storage</div><div className="field-input" style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}><strong>2.4 GB</strong> <span style={{ color: '#A0A0A0' }}>/ 50 GB</span></div></div>
        <div className="st-field"><div className="field-label">Team seats</div><div className="field-input" style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}><strong>2</strong> <span style={{ color: '#A0A0A0' }}>of 5 included</span></div></div>
      </div>
    </>
  ),
  invoices: (
    <div className="st-panel">
      <div className="st-panel-h"><div className="pt">Invoices</div><div className="ps">Last 6 months · paid by Visa ending 6411</div></div>
      {[
        { month: 'April 2026',    amount: '$180.00', status: 'Pending' },
        { month: 'March 2026',    amount: '$180.00', status: 'Paid' },
        { month: 'February 2026', amount: '$180.00', status: 'Paid' },
        { month: 'January 2026',  amount: '$180.00', status: 'Paid' },
        { month: 'December 2025', amount: '$180.00', status: 'Paid' },
        { month: 'November 2025', amount: '$180.00', status: 'Paid' },
      ].map((inv, i) => (
        <div className="conn-row" key={i}>
          <div className="conn-icon" style={{ background: 'rgba(0,0,0,0.04)', color: '#0A0A0A' }}>$</div>
          <div className="conn-info"><div className="conn-name">{inv.month}</div><div className="conn-meta">{inv.amount} · {inv.status}</div></div>
          <button className="ghost-btn">Download PDF</button>
        </div>
      ))}
    </div>
  ),
}
