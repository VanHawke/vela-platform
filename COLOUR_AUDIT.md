# COLOUR_AUDIT.md — Warm Charcoal Cascade
# Generated Sun 12 Apr 2026 10:10:00 BST
# 40 files to process

## src/index.css (53 occurrences)
```
5:  --surface: rgba(167,139,250,0.04);
6:  --surface-hover: rgba(167,139,250,0.07);
7:  --border: rgba(167,139,250,0.50);
8:  --border-hover: rgba(167,139,250,0.20);
9:  --text: rgba(238,238,238,0.9);
10:  --text-secondary: rgba(238,238,238,0.5);
11:  --text-tertiary: rgba(238,238,238,0.22);
12:  --text-muted: rgba(238,238,238,0.12);
13:  --accent: #A78BFA;
14:  --accent-teal: #A78BFA;
18:  --accent-soft: rgba(167,139,250,0.1);
26:  --glass-border: rgba(167,139,250,0.50);
27:  --glass-border-top: rgba(167,139,250,0.12);
28:  --glass-border-hover: rgba(167,139,250,0.25);
29:  --glass-shadow: 0 4px 16px rgba(0,0,0,0.25), 0 0 0 1px rgba(167,139,250,0.06), inset 3px 3px 0.5px -3.5px rgba(167,139,250,0.12), inset -3px -3px 0.5px -3.5px rgba(167,139,250,0.10), inset 1px 1px 1px -0.5px rgba(167,139,250,0.08), inset -1px -1px 1px -0.5px rgba(167,139,250,0.08);
30:  --glass-shadow-deep: 0 12px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(167,139,250,0.06);
31:  --glass-shadow-card: 0 4px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(167,139,250,0.06);
35:  --shadow-kiko: 0 0 60px rgba(167,139,250,0.15), 0 0 120px rgba(167,139,250,0.08);
46:::-webkit-scrollbar-thumb { background: rgba(167,139,250,0.4); border-radius: 3px; }
47:::-webkit-scrollbar-thumb:hover { background: rgba(167,139,250,0.12); }
50:.glass { background: rgba(25,25,25,0.30); backdrop-filter: blur(40px) saturate(1.6); -webkit-backdrop-filter: blur(40px) saturate(1.6); border: 1px solid rgba(167,139,250,0.50); box-shadow: inset 3px 3px 0.5px -3.5px rgba(167,139,250,0.12), inset -3px -3px 0.5px -3.5px rgba(167,139,250,0.10), inset 1px 1px 1px -0.5px rgba(167,139,250,0.08), inset -1px -1px 1px -0.5px rgba(167,139,250,0.08), inset 0 0 6px 6px rgba(167,139,250,0.04), 0 4px 16px rgba(0,0,0,0.25); border-radius: var(--radius); }
51:.glass:hover { border-color: rgba(167,139,250,0.20); box-shadow: inset 3px 3px 0.5px -3.5px rgba(167,139,250,0.22), inset -3px -3px 0.5px -3.5px rgba(167,139,250,0.16), inset 1px 1px 1px -0.5px rgba(167,139,250,0.14), inset -1px -1px 1px -0.5px rgba(167,139,250,0.14), inset 0 0 6px 6px rgba(167,139,250,0.07), 0 0 20px rgba(167,139,250,0.10); }
52:.glass-subtle { background: rgba(25,25,25,0.15); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); border: 0.5px solid rgba(167,139,250,0.30); border-radius: var(--radius); box-shadow: inset 0 1px 0 rgba(167,139,250,0.04); }
95:.btn-primary { height: 44px; padding: 0 24px; border-radius: 8px; background: var(--accent); color: #0A0A0C; border: none; font-size: 14px; font-weight: 500; font-family: var(--font); cursor: pointer; transition: all 0.15s; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
106:.card { background: rgba(25,25,25,0.30); backdrop-filter: blur(40px) saturate(1.5); -webkit-backdrop-filter: blur(40px) saturate(1.5); border-radius: var(--radius); border: 1px solid rgba(167,139,250,0.50); box-shadow: inset 3px 3px 0.5px -3.5px rgba(167,139,250,0.12), inset -3px -3px 0.5px -3.5px rgba(167,139,250,0.10), 0 4px 16px rgba(0,0,0,0.25); transition: all 0.4s cubic-bezier(0.2,0,0,1); }
107:.card:hover { border-color: rgba(167,139,250,0.18); transform: translateY(-3px); box-shadow: inset 3px 3px 0.5px -3.5px rgba(167,139,250,0.22), inset -3px -3px 0.5px -3.5px rgba(167,139,250,0.16), 0 12px 40px rgba(0,0,0,0.4); }
112:.status-active { background: rgba(45,212,191,0.08); color: rgba(45,212,191,0.7); }
113:.status-qualified { background: rgba(167,139,250,0.08); color: rgba(167,139,250,0.7); }
114:.status-proposal { background: rgba(167,139,250,0.08); color: rgba(167,139,250,0.7); }
116:.status-won { background: rgba(45,212,191,0.08); color: rgba(45,212,191,0.7); }
123:table { color: rgba(238,238,238,0.6); }
124:th { color: rgba(238,238,238,0.4); border-color: rgba(167,139,250,0.3); }
125:td { border-color: rgba(167,139,250,0.2); }
126:select { background: rgba(167,139,250,0.03); color: rgba(238,238,238,0.7); border-color: rgba(167,139,250,0.4); }
127:textarea { background: rgba(167,139,250,0.03); color: rgba(238,238,238,0.7); border-color: rgba(167,139,250,0.4); }
128:hr { border-color: rgba(167,139,250,0.3); }
129:a { color: rgba(167,139,250,0.7); }
130:strong { color: rgba(238,238,238,0.85); }
131:h1, h2, h3, h4, h5, h6 { color: rgba(238,238,238,0.9); }
147:  0%, 100% { box-shadow: 0 0 8px rgba(167,139,250,0.2), 0 0 20px rgba(167,139,250,0.1); }
148:  50% { box-shadow: 0 0 14px rgba(167,139,250,0.4), 0 0 32px rgba(167,139,250,0.2); }
160:.vela-calendar .fc { --fc-border-color: rgba(167,139,250,0.3); --fc-button-bg-color: rgba(167,139,250,0.04); --fc-button-border-color: rgba(167,139,250,0.4); --fc-button-hover-bg-color: rgba(167,139,250,0.08); --fc-button-hover-border-color: rgba(167,139,250,0.12); --fc-button-active-bg-color: rgba(167,139,250,0.12); --fc-button-active-border-color: rgba(167,139,250,0.20); --fc-today-bg-color: rgba(167,139,250,0.04); --fc-highlight-color: rgba(167,139,250,0.08); --fc-neutral-bg-color: rgba(167,139,250,0.02); --fc-list-event-hover-bg-color: rgba(167,139,250,0.04); --fc-page-bg-color: transparent; --fc-now-indicator-color: #A78BFA; }
161:.vela-calendar .fc .fc-toolbar-title { color: rgba(238,238,238,0.9); font-weight: 300; font-size: 18px; }
162:.vela-calendar .fc .fc-button { color: rgba(238,238,238,0.6); font-weight: 300; font-size: 12px; border-radius: 6px; }
163:.vela-calendar .fc .fc-button-active { color: rgba(238,238,238,0.9); }
164:.vela-calendar .fc .fc-col-header-cell { color: rgba(238,238,238,0.3); font-weight: 300; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
165:.vela-calendar .fc .fc-daygrid-day-number, .vela-calendar .fc .fc-timegrid-slot-label { color: rgba(238,238,238,0.3); font-weight: 300; }
166:.vela-calendar .fc .fc-list-day-text, .vela-calendar .fc .fc-list-day-side-text { color: rgba(238,238,238,0.6); font-weight: 300; }
171:dialog, [role="dialog"] { background: rgba(17,17,17,0.9); backdrop-filter: blur(40px); border: 0.5px solid rgba(167,139,250,0.4); border-radius: 12px; color: rgba(238,238,238,0.9); }
244:  border: 0.5px solid rgba(167,139,250,0.50) !important;
245:  border-top-color: rgba(167,139,250,0.10) !important;
246:  box-shadow: 0 0 8px rgba(0,0,0,0.03), 0 2px 6px rgba(0,0,0,0.08), inset 0 1px 0 rgba(167,139,250,0.06), 0 0 12px rgba(0,0,0,0.15) !important;
251:  box-shadow: 0 0 10px rgba(167,139,250,0.06), 0 4px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(167,139,250,0.10), 0 0 20px rgba(167,139,250,0.08) !important;
```
- [ ] DONE

## src/components/settings/MemoryTab.jsx (19 occurrences)
```
21:  text: '#EEEEEE',
22:  textTertiary: 'rgba(238,238,238,0.45)',
23:  accent: '#A78BFA',
24:  accentTeal: '#2DD4BF',
25:  border: 'rgba(238,238,238,0.10)',
26:  surface: 'rgba(238,238,238,0.04)',
27:  surfaceHover: 'rgba(238,238,238,0.07)',
29:  glassBorder: 'rgba(238,238,238,0.08)',
222:        borderTop: `0.5px solid rgba(238,238,238,0.15)`, padding: 20,
238:                background: 'rgba(45,212,191,0.10)', border: `1px solid rgba(45,212,191,0.30)`,
250:                background: bulkMode ? 'rgba(167,139,250,0.18)' : 'rgba(167,139,250,0.06)',
251:                border: `1px solid ${bulkMode ? T.accent : 'rgba(167,139,250,0.20)'}`,
261:              background: 'rgba(167,139,250,0.12)', border: `1px solid ${T.accent}`,
318:                style={{ padding: '7px 14px', borderRadius: 6, background: T.accent, border: 'none', color: '#0A0A0C', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: T.font }}>
339:              background: category === c.id ? 'rgba(167,139,250,0.12)' : 'transparent',
357:              background: 'rgba(167,139,250,0.08)', border: `1px solid rgba(167,139,250,0.20)`,
396:                  background: selectedIds.has(row.id) ? 'rgba(167,139,250,0.10)' : T.surface,
419:                          style={{ padding: '5px 10px', borderRadius: 5, background: T.accentTeal, border: 'none', color: '#0A0A0C', fontSize: 10, fontWeight: 500, cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 4 }}>
452:                  background: 'rgba(167,139,250,0.08)', border: `1px solid rgba(167,139,250,0.20)`,
```
- [ ] DONE

## src/components/settings/SkillsManager.jsx (3 occurrences)
```
50:  const inp = { width: '100%', background: 'rgba(238,238,238,0.03)', border: `1px solid ${T.border}`, borderRadius: 10, padding: '8px 12px', fontSize: 14, color: T.text, fontFamily: T.font, fontWeight: 300, outline: 'none' }
61:        <button onClick={startNew} style={{ padding: '6px 16px', borderRadius: 50, background: T.accentSoft, border: `1px solid ${T.accentBorder}`, color: 'rgba(167,139,250,0.7)', fontSize: 13, cursor: 'pointer', fontFamily: T.font, fontWeight: 400 }}>+ New Skill</button>
73:              <button onClick={save} disabled={!form.name || !form.content} style={{ padding: '6px 16px', borderRadius: 50, background: T.accentGradient, border: 'none', color: 'rgba(238,238,238,0.9)', fontSize: 13, cursor: 'pointer', fontFamily: T.font, fontWeight: 400, opacity: form.name && form.content ? 1 : 0.4 }}>Save</button>
```
- [ ] DONE

## src/components/settings/Settings.jsx (21 occurrences)
```
261:  const cardStyle = { background: T.glass, backdropFilter: 'blur(24px) saturate(1.2)', WebkitBackdropFilter: 'blur(24px) saturate(1.2)', borderRadius: T.radius, border: `0.5px solid ${T.glassBorder}`, borderTop: `0.5px solid rgba(238,238,238,0.15)`, padding: 20, boxShadow: T.glassShadow }
374:                <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(45,212,191,0.05)', border: '0.5px solid rgba(45,212,191,0.20)', marginBottom: 14, fontSize: 12, color: T.textSecondary, fontFamily: T.font }}>
384:                  <button onClick={async () => { await fetch('/api/cron-email-voice-learning', { method: 'POST' }); alert('Voice learning queued — refresh in ~30s') }} style={{ padding: '3px 10px', borderRadius: 5, background: 'rgba(167,139,250,0.10)', color: T.accent, border: '0.5px solid rgba(167,139,250,0.30)', fontSize: 11, cursor: 'pointer', fontFamily: T.font }}>Run now</button>
389:              <div style={{ padding: '14px 16px', borderRadius: 8, background: 'rgba(45,212,191,0.05)', border: '0.5px solid rgba(45,212,191,0.20)', marginBottom: 14, fontSize: 12, color: T.textSecondary, fontFamily: T.font, lineHeight: 1.6 }}>
411:                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(238,238,238,0.07)', position: 'absolute', top: 2, transition: 'right 0.2s', right: on ? 2 : 22, boxShadow: '0 1px 3px rgba(238,238,238,0.12)' }} />
436:                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(238,238,238,0.07)', position: 'absolute', top: 2, transition: 'right 0.2s', right: on ? 2 : 22, boxShadow: '0 1px 3px rgba(238,238,238,0.12)' }} />
450:              style={{ height: 44, borderRadius: 50, background: T.accent, color: 'rgba(238,238,238,0.9)', border: 'none', fontSize: 15, fontWeight: 500, cursor: 'pointer', fontFamily: T.font, width: 'fit-content', padding: '0 28px' }}>
469:                      color: isSelected ? 'rgba(238,238,238,0.9)' : T.text,
479:                        background: isSelected ? 'rgba(238,238,238,0.2)' : T.accentSoft,
480:                        color: isSelected ? 'rgba(238,238,238,0.9)' : T.textSecondary,
496:                    color: parseFloat(settings.kiko_speed || 1.0) === s.id ? 'rgba(238,238,238,0.9)' : T.textSecondary,
529:                      color: sel ? 'rgba(238,238,238,0.9)' : T.textSecondary,
573:                          <button onClick={() => moveItem(-1)} disabled={!canMoveUp} style={{ background: 'none', border: 'none', cursor: canMoveUp ? 'pointer' : 'default', color: canMoveUp ? T.textSecondary : 'rgba(238,238,238,0.1)', fontSize: 10, padding: '0 2px', lineHeight: 1 }}>▲</button>
574:                          <button onClick={() => moveItem(1)} disabled={!canMoveDown} style={{ background: 'none', border: 'none', cursor: canMoveDown ? 'pointer' : 'default', color: canMoveDown ? T.textSecondary : 'rgba(238,238,238,0.1)', fontSize: 10, padding: '0 2px', lineHeight: 1 }}>▼</button>
588:                          background: isOn ? T.accent : 'rgba(238,238,238,0.08)',
592:                            width: 16, height: 16, borderRadius: '50%', background: 'rgba(238,238,238,0.07)',
594:                            transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(238,238,238,0.12)',
631:                          <button onClick={() => moveMore(-1)} disabled={!canUp} style={{ background: 'none', border: 'none', cursor: canUp ? 'pointer' : 'default', color: canUp ? T.textSecondary : 'rgba(238,238,238,0.1)', fontSize: 10, padding: '0 2px', lineHeight: 1 }}>▲</button>
632:                          <button onClick={() => moveMore(1)} disabled={!canDown} style={{ background: 'none', border: 'none', cursor: canDown ? 'pointer' : 'default', color: canDown ? T.textSecondary : 'rgba(238,238,238,0.1)', fontSize: 10, padding: '0 2px', lineHeight: 1 }}>▼</button>
667:                    height: 44, padding: '0 16px', borderRadius: 50, background: T.accent, color: 'rgba(238,238,238,0.9)',
823:                    height: 36, padding: '0 16px', borderRadius: T.radiusSm, background: T.accent, color: 'rgba(238,238,238,0.9)',
```
- [ ] DONE

## src/components/settings/ImageUpload.jsx (7 occurrences)
```
11:  bg: '#000000', surface: 'rgba(238,238,238,0.04)', border: 'rgba(238,238,238,0.08)',
12:  borderHover: 'rgba(238,238,238,0.1)', text: 'rgba(238,238,238,0.95)',
13:  textSecondary: 'rgba(238,238,238,0.55)', textTertiary: 'rgba(238,238,238,0.32)',
14:  accent: 'rgba(238,238,238,0.12)', font: "'DM Sans', sans-serif",
100:          <div style={{ background: T.surface, borderRadius: 18, padding: 24, maxWidth: 520, width: '90%', boxShadow: '0 24px 80px rgba(238,238,238,0.12)' }}>
109:              <button onClick={saveCrop} disabled={uploading} style={{ height: 36, padding: '0 20px', borderRadius: 50, border: 'none', background: T.accent, color: 'rgba(238,238,238,0.9)', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 6 }}>
135:          <div style={{ position: 'absolute', inset: 0, background: 'rgba(238,238,238,0.8)', borderRadius: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
```
- [ ] DONE

## src/components/PipelineNotifications.jsx (6 occurrences)
```
5:  bg: '#000000', surface: 'rgba(238,238,238,0.04)',
6:  border: 'rgba(238,238,238,0.08)', borderHover: 'rgba(238,238,238,0.1)',
7:  text: 'rgba(238,238,238,0.95)', textSecondary: 'rgba(238,238,238,0.55)', textTertiary: 'rgba(238,238,238,0.32)',
8:  accent: 'rgba(238,238,238,0.12)', accentSoft: 'rgba(238,238,238,0.04)',
17:  new_partnership: { icon: Trophy, color: '#A78BFA', bg: 'rgba(167,139,250,0.08)', label: 'F1 Partnership' },
89:            <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(238,238,238,0.9)', background: T.red, borderRadius: 50, padding: '1px 6px', minWidth: 18, textAlign: 'center' }}>{unread}</span>
```
- [ ] DONE

## src/components/CompanyLogo.jsx (3 occurrences)
```
15:        background: 'rgba(167,139,250,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
16:        fontSize: size * 0.4, fontWeight: 600, color: 'rgba(167,139,250,0.5)', ...style,
26:      style={{ width: size, height: size, borderRadius: size > 20 ? 8 : 6, flexShrink: 0, objectFit: 'contain', background: 'rgba(238,238,238,0.06)', ...style }}
```
- [ ] DONE

## src/components/auth/LoginPage.jsx (26 occurrences)
```
49:    border: '1px solid rgba(167,139,250,0.10)',
50:    background: 'rgba(167,139,250,0.04)',
52:    padding: '0 18px', fontSize: 14, color: 'rgba(238,238,238,0.85)', outline: 'none',
56:    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100vw', height: '100vh', background: '#262624', fontFamily: T.font, position: 'relative', overflow: 'hidden' }}>
60:      <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(167,139,250,0.06) 0%, transparent 70%)', top: '50%', left: '50%', transform: 'translate(-50%, -65%)', zIndex: 1, pointerEvents: 'none' }} />
70:              <span style={{ fontSize: 12, fontWeight: 400, color: 'rgba(167,139,250,0.5)', letterSpacing: '0.15em', fontFamily: T.font }}>VAN HAWKE</span>
71:              <span style={{ fontSize: 9, verticalAlign: 'super', color: 'rgba(167,139,250,0.3)', marginLeft: 2 }}>™</span>
84:        <h1 style={{ fontSize: 33, fontWeight: 200, color: 'rgba(238,238,238,0.9)', letterSpacing: '-0.04em', margin: '0 0 6px', ...fade(0.4) }}>Kiko</h1>
85:        <p style={{ fontSize: 13, color: 'rgba(167,139,250,0.25)', fontWeight: 300, margin: '0 0 48px', letterSpacing: '0.02em', ...fade(0.5) }}>Intelligence, Applied</p>
91:            border: '1px solid rgba(167,139,250,0.12)',
92:            background: 'rgba(167,139,250,0.05)',
95:            fontSize: 14, fontWeight: 400, color: 'rgba(238,238,238,0.8)', cursor: 'pointer', fontFamily: T.font,
99:            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(167,139,250,0.10)'; e.currentTarget.style.borderColor = 'rgba(167,139,250,0.20)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
100:            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(167,139,250,0.05)'; e.currentTarget.style.borderColor = 'rgba(167,139,250,0.12)'; e.currentTarget.style.transform = 'translateY(0)' }}
110:            background: 'none', border: 'none', color: 'rgba(167,139,250,0.20)', fontSize: 12, cursor: 'pointer',
114:            onMouseEnter={e => e.currentTarget.style.color = 'rgba(238,238,238,0.45)'}
115:            onMouseLeave={e => e.currentTarget.style.color = 'rgba(167,139,250,0.20)'}
125:              onFocus={e => e.target.style.borderColor = 'rgba(167,139,250,0.30)'}
126:              onBlur={e => e.target.style.borderColor = 'rgba(167,139,250,0.10)'} />
131:                onFocus={e => e.target.style.borderColor = 'rgba(167,139,250,0.30)'}
132:                onBlur={e => e.target.style.borderColor = 'rgba(167,139,250,0.10)'} />
135:                background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(167,139,250,0.20)', padding: 0,
142:              background: 'linear-gradient(135deg, rgba(167,139,250,0.55), rgba(57,48,40,0.55))',
143:              color: 'rgba(238,238,238,0.95)', border: 'none',
146:              boxShadow: '0 4px 24px rgba(167,139,250,0.15)',
156:        <p style={{ fontSize: 11, color: 'rgba(167,139,250,0.15)', marginTop: 48, fontWeight: 300, ...fade(0.8) }}>By Van Hawke</p>
```
- [ ] DONE

## src/components/layout/Layout.jsx (45 occurrences)
```
7:  bg: '#262624',
8:  card: '#1F1F1D',
9:  cardHover: '#2C2C2A',
16:  purple: '#A78BFA',
17:  teal: '#2DD4BF',
386:                <span style={{ fontSize: 15, fontWeight: 600, color: 'rgba(238,238,238,0.55)', fontFamily: C.font, letterSpacing: '0.12em' }}>VAN HAWKE<sup style={{ fontSize: 8, verticalAlign: 'super', opacity: 0.5 }}>™</sup></span>
433:                  borderRadius: 14, border: `0.5px solid rgba(238,238,238,0.12)`,
434:                  boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 1px 0 rgba(238,238,238,0.06) inset', padding: '6px', zIndex: 300, animation: 'fadeIn 0.12s ease-out',
441:                      background: loc.pathname === item.path ? 'rgba(238,238,238,0.08)' : 'transparent',
442:                      color: loc.pathname === item.path ? 'rgba(238,238,238,0.85)' : 'rgba(238,238,238,0.4)', textAlign: 'left',
446:                      onMouseOver={e => { e.currentTarget.style.background = 'rgba(238,238,238,0.06)'; e.currentTarget.style.color = 'rgba(238,238,238,0.8)' }}
447:                      onMouseOut={e => { e.currentTarget.style.background = loc.pathname === item.path ? 'rgba(238,238,238,0.08)' : 'transparent'; e.currentTarget.style.color = loc.pathname === item.path ? 'rgba(238,238,238,0.85)' : 'rgba(238,238,238,0.4)' }}
450:                  {MORE_ITEMS.length > 0 && <div style={{ height: 1, background: 'rgba(238,238,238,0.05)', margin: '4px 8px' }} />}
453:                    background: 'transparent', color: 'rgba(238,238,238,0.4)', textAlign: 'left',
457:                    onMouseOver={e => { e.currentTarget.style.background = 'rgba(238,238,238,0.06)'; e.currentTarget.style.color = 'rgba(238,238,238,0.8)' }}
458:                    onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(238,238,238,0.4)' }}
490:            width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(238,238,238,0.1)',
491:            background: mobileMenuOpen ? 'rgba(238,238,238,0.08)' : 'rgba(238,238,238,0.04)',
494:            {mobileMenuOpen ? <X size={16} color="rgba(238,238,238,0.7)" /> : <Menu size={16} color="rgba(238,238,238,0.5)" />}
499:            padding: '7px 14px', borderRadius: 50, border: '0.5px solid rgba(238,238,238,0.1)',
500:            background: 'rgba(238,238,238,0.04)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
502:            color: 'rgba(238,238,238,0.25)', fontSize: 13, transition: 'all 0.15s',
503:            boxShadow: 'inset 0 1px 0 rgba(238,238,238,0.06)',
505:            onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(238,238,238,0.15)'; e.currentTarget.style.background = 'rgba(238,238,238,0.07)' }}
506:            onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(238,238,238,0.1)'; e.currentTarget.style.background = 'rgba(238,238,238,0.04)' }}
515:              width: 28, height: 28, borderRadius: '50%', border: '0.5px solid rgba(238,238,238,0.08)', cursor: 'pointer',
522:                <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(238,238,238,0.9)', fontFamily: 'var(--font)' }}>{initials}</span>
528:                width: 200, background: 'rgba(238,238,238,0.035)', backdropFilter: 'blur(40px) saturate(1.6)', WebkitBackdropFilter: 'blur(40px) saturate(1.6)',
529:                borderRadius: 18, border: '0.5px solid rgba(238,238,238,0.1)',
530:                boxShadow: 'inset 0 1px 0 rgba(238,238,238,0.08), 0 8px 40px rgba(0,0,0,0.5)',
533:                <div style={{ padding: '8px 12px 10px', borderBottom: '0.5px solid rgba(238,238,238,0.06)', marginBottom: 4 }}>
534:                  <div style={{ fontSize: 14, fontWeight: 500, color: 'rgba(238,238,238,0.8)', fontFamily: 'var(--font)' }}>
537:                  <div style={{ fontSize: 12, color: 'rgba(238,238,238,0.2)', fontFamily: 'var(--font)', marginTop: 2 }}>{user?.email}</div>
541:                  background: 'transparent', color: 'rgba(238,238,238,0.4)', textAlign: 'left',
545:                  onMouseOver={e => { e.currentTarget.style.background = 'rgba(238,238,238,0.06)'; e.currentTarget.style.color = 'rgba(238,238,238,0.8)' }}
546:                  onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(238,238,238,0.4)' }}
571:            background: 'rgba(238,238,238,0.035)', borderBottom: '0.5px solid rgba(238,238,238,0.08)',
583:                  background: active ? 'rgba(238,238,238,0.08)' : 'transparent',
584:                  color: active ? 'rgba(238,238,238,0.9)' : 'rgba(238,238,238,0.5)',
592:            <div style={{ height: 1, background: 'rgba(238,238,238,0.06)', margin: '6px 8px' }} />
595:              background: 'transparent', color: 'rgba(238,238,238,0.4)',
645:        background: 'rgba(238,238,238,0.03)', backdropFilter: 'blur(40px) saturate(1.6)', WebkitBackdropFilter: 'blur(40px) saturate(1.6)',
646:        borderTop: '0.5px solid rgba(238,238,238,0.06)',
662:              color: active ? 'rgba(238,238,238,0.95)' : 'rgba(238,238,238,0.32)',
673:          color: 'rgba(238,238,238,0.32)', fontFamily: C.font,
```
- [ ] DONE

## src/components/layout/CommandPalette.jsx (8 occurrences)
```
7:  text: 'rgba(238,238,238,0.95)', sub: 'rgba(238,238,238,0.55)', muted: 'rgba(238,238,238,0.32)',
8:  border: 'rgba(238,238,238,0.08)', soft: 'rgba(238,238,238,0.04)',
98:        boxShadow: 'inset 0 1px 0 rgba(238,238,238,0.08), 0 16px 64px rgba(0,0,0,0.5)',
99:        border: '1.5px solid rgba(238,238,238,0.1)', overflow: 'hidden',
103:        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1.5px solid rgba(238,238,238,0.07)' }}>
126:                  background: i === selected ? 'rgba(238,238,238,0.07)' : 'transparent',
147:        <div style={{ padding: '8px 16px', borderTop: '1.5px solid rgba(238,238,238,0.07)', display: 'flex', gap: 16, justifyContent: 'center' }}>
150:              <kbd style={{ padding: '1px 5px', borderRadius: 4, background: 'rgba(238,238,238,0.04)', border: '1.5px solid rgba(238,238,238,0.1)', fontSize: 11, fontFamily: 'inherit' }}>{key}</kbd>
```
- [ ] DONE

## src/components/kiko/ChatHistory.jsx (16 occurrences)
```
102:    <div style={{ width: 28, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid rgba(238,238,238,0.04)', cursor: 'pointer' }} onClick={onToggle}>
123:              <span style={{ fontSize: 13, fontWeight: 400, color: 'rgba(238,238,238,0.8)', fontFamily: T.font, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 280 }}>
127:                <span style={{ fontSize: 10, fontWeight: 400, color: 'rgba(238,238,238,0.40)', fontFamily: T.font, marginTop: 2, display: 'block' }}>
136:            style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(238,238,238,0.15)', transition: 'color 0.15s' }}
137:            onMouseOver={e => e.currentTarget.style.color = 'rgba(238,238,238,0.5)'}
138:            onMouseOut={e => { if (menuOpenId !== conv.id) e.currentTarget.style.color = 'rgba(238,238,238,0.15)' }}>
145:                onMouseOver={e => e.currentTarget.style.background = 'rgba(238,238,238,0.06)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
146:                <Pencil size={12} style={{ color: 'rgba(238,238,238,0.4)' }} /> Rename
161:    <div style={{ width: 300, flexShrink: 0, height: '100%', background: '#262624', borderRight: '1px solid rgba(238,238,238,0.04)', display: 'flex', flexDirection: 'column' }}>
167:          <button onClick={onToggle} style={{ width: 30, height: 30, borderRadius: 50, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(238,238,238,0.4)' }}><ChevronLeft size={14} /></button>
172:      <div style={{ padding: '4px 16px 8px', fontSize: 11, fontWeight: 500, color: 'rgba(238,238,238,0.35)', fontFamily: T.font, letterSpacing: '0.03em' }}>
179:          <p style={{ textAlign: 'center', padding: 20, color: 'rgba(238,238,238,0.3)', fontSize: 13, fontFamily: T.font }}>Loading…</p>
181:          <p style={{ textAlign: 'center', padding: 20, color: 'rgba(238,238,238,0.3)', fontSize: 13, fontFamily: T.font }}>No conversations yet</p>
190:          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderTop: `1px solid ${T.border}`, background: 'transparent', border: 'none', borderTop: `1px solid ${T.border}`, cursor: 'pointer', color: 'rgba(238,238,238,0.5)', fontFamily: T.font, fontSize: 13, fontWeight: 400, transition: 'color 0.15s', width: '100%', textAlign: 'left' }}
191:          onMouseOver={e => e.currentTarget.style.color = 'rgba(238,238,238,0.8)'}
192:          onMouseOut={e => e.currentTarget.style.color = 'rgba(238,238,238,0.5)'}>
```
- [ ] DONE

## src/components/kiko/KikoWaveform.jsx (6 occurrences)
```
141:        border: `1px solid ${active ? `rgba(167,139,250,${0.18 + (state === 'speaking' ? level * 0.25 : 0.1)})` : T.glassBorder}`,
143:          ? `0 0 16px rgba(167,139,250,0.12), 0 2px 10px rgba(0,0,0,0.15), inset 3px 3px 0.5px -3.5px rgba(167,139,250,0.30), inset -3px -3px 0.5px -3.5px rgba(167,139,250,0.22), inset 1px 1px 1px -0.5px rgba(167,139,250,0.18), inset -1px -1px 1px -0.5px rgba(167,139,250,0.18)`
152:          background: `linear-gradient(90deg, transparent, rgba(167,139,250,${active ? 0.22 : 0.08}), transparent)`,
158:          boxShadow: `0 0 ${12 + level * 20}px rgba(167,139,250,${glowI})`,
187:                  background: `linear-gradient(180deg, ${T.accent} 0%, rgba(167,139,250,0.10) 100%)`,
226:              background: `linear-gradient(180deg, ${T.accent} 0%, rgba(167,139,250,0.10) 100%)`,
```
- [ ] DONE

## src/components/kiko/KikoFloat.jsx (43 occurrences)
```
7:  bg: '#262624',
8:  card: '#1F1F1D',
9:  cardHover: '#2C2C2A',
16:  purple: '#A78BFA',
17:  teal: '#2DD4BF',
128:    .replace(/```([\s\S]*?)```/g, '<pre style="background:rgba(238,238,238,0.07);padding:8px;border-radius:8px;font-size:11px;overflow-x:auto;margin:4px 0;border:0.5px solid rgba(238,238,238,0.1)"><code>$1</code></pre>')
129:    .replace(/`([^`]+)`/g, '<code style="background:rgba(238,238,238,0.07);padding:1px 4px;border-radius:3px;font-size:11px">$1</code>')
458:          background: 'rgba(238,238,238,0.035)',
461:          borderTop: `0.5px solid rgba(238,238,238,0.15)`,
462:          boxShadow: '0 12px 40px rgba(0,0,0,0.5)' || '0 16px 48px rgba(0,0,0,0.45), 0 4px 16px rgba(0,0,0,0.3), 0 1px 0 rgba(238,238,238,0.05) inset',
470:          <div style={{ padding: '12px 14px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: hasMessages ? '1.5px solid rgba(238,238,238,0.07)' : 'none' }}>
477:                <span style={{ fontSize: 10, fontWeight: 500, color: voiceSpeaking ? '#06D6A0' : voiceStatus === 'thinking' ? '#7C9CF6' : voiceStatus === 'error' ? '#FF5050' : 'rgba(238,238,238,0.4)', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 4 }}>
499:                  <div style={{ maxWidth: '82%', padding: '7px 11px', borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : 8, background: msg.role === 'user' ? C.purple : 'rgba(167,139,250,0.06)', color: msg.role === 'user' ? 'rgba(238,238,238,0.9)' : C.textSec, fontSize: 13, lineHeight: 1.55, fontFamily: C.font }}>
505:                      <button onClick={() => { navigator.clipboard?.writeText(msg.content); }} title="Copy" style={{ width: 24, height: 24, borderRadius: 5, background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(238,238,238,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.1s' }}
506:                        onMouseOver={e => { e.currentTarget.style.background = 'rgba(238,238,238,0.06)'; e.currentTarget.style.color = 'rgba(238,238,238,0.5)' }}
507:                        onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(238,238,238,0.2)' }}
509:                      <button onClick={() => { if (i > 0) { const ui = messages.slice(0, i).findLastIndex(m => m.role === 'user'); if (ui >= 0) handleSubmit(messages[ui].content) } }} title="Retry" style={{ width: 24, height: 24, borderRadius: 5, background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(238,238,238,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.1s' }}
510:                        onMouseOver={e => { e.currentTarget.style.background = 'rgba(238,238,238,0.06)'; e.currentTarget.style.color = 'rgba(238,238,238,0.5)' }}
511:                        onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(238,238,238,0.2)' }}
522:                  <div style={{ padding: '7px 11px', borderRadius: 50, background: 'rgba(167,139,250,0.06)' }}>
527:                    <div style={{ height: 2, borderRadius: 1, background: 'rgba(238,238,238,0.04)', marginTop: 5, overflow: 'hidden', width: 120 }}>
539:                    <div style={{ maxWidth: '82%', padding: '7px 11px', borderRadius: 50, background: 'rgba(167,139,250,0.06)', fontSize: 13, color: C.textSec, lineHeight: 1.55, fontFamily: C.font }}>
546:                      style={{ padding: '4px 12px', borderRadius: 14, border: '0.5px solid rgba(238,238,238,0.1)', background: 'rgba(238,238,238,0.03)', cursor: 'pointer', fontSize: 11, color: 'rgba(238,238,238,0.4)', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.1s' }}
547:                      onMouseOver={e => { e.currentTarget.style.background = 'rgba(238,238,238,0.06)'; e.currentTarget.style.color = 'rgba(238,238,238,0.6)' }}
548:                      onMouseOut={e => { e.currentTarget.style.background = 'rgba(238,238,238,0.03)'; e.currentTarget.style.color = 'rgba(238,238,238,0.4)' }}
563:                  border: '0.5px solid rgba(238,238,238,0.1)', background: 'rgba(238,238,238,0.07)',
568:                  onMouseOver={e => { e.currentTarget.style.background = 'rgba(238,238,238,0.07)'; e.currentTarget.style.borderColor = 'rgba(238,238,238,0.1)' }}
569:                  onMouseOut={e => { e.currentTarget.style.background = 'rgba(238,238,238,0.07)'; e.currentTarget.style.borderColor = 'rgba(238,238,238,0.07)' }}
580:            <div style={{ padding: '8px 12px 0', borderTop: '0.5px solid rgba(238,238,238,0.06)' }}>
581:              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: 'rgba(238,238,238,0.03)', border: '0.5px solid rgba(238,238,238,0.08)' }}>
584:                  : <div style={{ width: 36, height: 36, borderRadius: 6, background: 'rgba(167,139,250,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'rgba(167,139,250,0.7)', fontWeight: 500 }}>{pendingFile.name.split('.').pop()?.toUpperCase()}</div>
586:                <span style={{ fontSize: 11, color: 'rgba(238,238,238,0.5)', fontFamily: C.font, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pendingFile.name}</span>
587:                <button onClick={clearPendingFile} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(238,238,238,0.3)', padding: 2, fontSize: 12, lineHeight: 1 }}>✕</button>
591:          <div style={{ padding: '8px 10px 10px', display: 'flex', alignItems: 'flex-end', gap: 6, borderTop: hasMessages ? '1.5px solid rgba(238,238,238,0.07)' : 'none', marginTop: hasMessages ? 0 : 8 }}>
610:              style={{ width: 28, height: 28, borderRadius: 50, border: 'none', background: (input.trim() || pendingFile) && !streaming ? 'linear-gradient(135deg, #7C5CFC, #2DD4BF)' : 'rgba(238,238,238,0.04)', color: (input.trim() || pendingFile) && !streaming ? 'rgba(238,238,238,0.9)' : C.textTer, cursor: (input.trim() || pendingFile) && !streaming ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.15s', boxShadow: (input.trim() || pendingFile) ? '0 2px 8px rgba(167,139,250,0.2)' : 'none' }}>
626:          <div style={{ position: 'absolute', inset: -6, borderRadius: '50%', border: '2px solid rgba(167,139,250,0.25)', animation: 'kikoPulseRing 4s ease-in-out infinite', pointerEvents: 'none' }} />
627:          <div style={{ position: 'absolute', inset: -14, borderRadius: '50%', border: '1.5px solid rgba(167,139,250,0.12)', animation: 'kikoPulseRing 4s ease-in-out 1s infinite', pointerEvents: 'none' }} />
634:          border: voiceOpen ? '2px solid rgba(6,214,160,0.25)' : '2px solid rgba(167,139,250,0.35)',
635:          color: 'rgba(238,238,238,0.9)',
638:            ? '0 0 0 4px rgba(6,214,160,0.08), 0 0 32px rgba(6,214,160,0.15), 0 8px 28px rgba(0,0,0,0.4), inset 0 1px 0 rgba(238,238,238,0.06)'
639:            : '0 0 0 3px rgba(167,139,250,0.1), 0 0 28px rgba(167,139,250,0.15), 0 8px 28px rgba(0,0,0,0.4), inset 0 1px 0 rgba(238,238,238,0.08)',
646:          onMouseEnter={e => { if (!open) { e.currentTarget.style.borderColor = voiceOpen ? 'rgba(6,214,160,0.4)' : 'rgba(167,139,250,0.35)'; e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = voiceOpen ? '0 0 0 5px rgba(6,214,160,0.12), 0 0 40px rgba(6,214,160,0.2), 0 12px 36px rgba(0,0,0,0.5)' : '0 0 0 4px rgba(167,139,250,0.08), 0 0 32px rgba(167,139,250,0.12), 0 12px 36px rgba(0,0,0,0.5)' }}}
647:          onMouseLeave={e => { if (!open) { e.currentTarget.style.borderColor = voiceOpen ? 'rgba(6,214,160,0.25)' : 'rgba(167,139,250,0.18)'; e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = voiceOpen ? '0 0 0 4px rgba(6,214,160,0.08), 0 0 32px rgba(6,214,160,0.15), 0 8px 28px rgba(0,0,0,0.4)' : '0 0 0 3px rgba(167,139,250,0.05), 0 0 20px rgba(167,139,250,0.08), 0 8px 28px rgba(0,0,0,0.4)' }}}
```
- [ ] DONE

## src/components/kiko/NotificationToast.jsx (3 occurrences)
```
26:  sequence_send: { bg: 'rgba(45,212,191,0.10)', border: 'rgba(45,212,191,0.30)', icon: '#2DD4BF' },
28:  success: { bg: 'rgba(45,212,191,0.10)', border: 'rgba(45,212,191,0.30)', icon: '#2DD4BF' },
29:  default: { bg: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.30)', icon: '#A78BFA' },
```
- [ ] DONE

## src/components/kiko/KikoChat.jsx (113 occurrences)
```
7:  bg: '#262624',
8:  card: '#1F1F1D',
9:  cardHover: '#2C2C2A',
16:  purple: '#A78BFA',
17:  teal: '#2DD4BF',
69:    .replace(/\[View\/Download\]\((https:\/\/[^\s)]*generated-files[^\s)]*\.png[^\s)]*)\)/g, '<div style="margin:8px 0"><a href="$1" target="_blank" rel="noopener"><img src="$1" style="max-width:100%;max-height:360px;border-radius:12px;border:0.5px solid rgba(167,139,250,0.06);box-shadow:0 4px 16px rgba(0,0,0,0.3)" /></a></div>')
71:    .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]*generated-files[^\s)]*)\)/g, '<a href="$2" target="_blank" download="$1" style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:10px;margin:6px 0;background:rgba(167,139,250,0.06);border:1px solid rgba(167,139,250,0.15);color:rgba(167,139,250,0.8);font-size:13px;font-weight:400;text-decoration:none">📄 $1 <span style="font-size:11px">↓</span></a>')
73:    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:rgba(167,139,250,0.7);text-decoration:none;border-bottom:1px solid rgba(167,139,250,0.2)">$1</a>')
74:    .replace(/```([\s\S]*?)```/g, '<pre style="background:rgba(167,139,250,0.05);padding:12px;border-radius:8px;font-size:12px;overflow-x:auto;margin:8px 0;border:0.5px solid rgba(167,139,250,0.50)"><code>$1</code></pre>')
75:    .replace(/`([^`]+)`/g, '<code style="background:rgba(167,139,250,0.05);padding:2px 6px;border-radius:4px;font-size:12px">$1</code>')
76:    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:rgba(238,238,238,0.85);font-weight:500">$1</strong>')
80:    .replace(/^## (.+)$/gm, '<div style="font-size:15px;font-weight:500;color:rgba(238,238,238,0.85);margin:16px 0 8px">$1</div>')
81:    .replace(/^---$/gm, '<hr style="border:none;border-top:0.5px solid rgba(167,139,250,0.50);margin:16px 0"/>')
94:      h = `<details style="margin:0 0 8px;cursor:pointer"><summary style="font-size:12px;color:rgba(238,238,238,0.35);font-weight:500;padding:8px 0;list-style:none;display:flex;align-items:center;gap:8px"><span style="display:inline-flex;width:16px;height:16px;border-radius:50%;border:1px solid rgba(167,139,250,0.12);font-size:10px;align-items:center;justify-content:center;flex-shrink:0;color:rgba(167,139,250,0.25)">›</span><span style="color:rgba(167,139,250,0.5)">Kiko's reasoning</span> <span style="color:rgba(238,238,238,0.25)">· ${steps} steps</span></summary><div style="font-size:13px;color:rgba(238,238,238,0.35);padding:8px 12px;line-height:1.7;border-left:2px solid rgba(167,139,250,0.08);margin:4px 0 8px 7px;background:rgba(25,25,25,0.30);border-radius:0 6px 6px 0">${thinkHtml}</div></details>${respHtml}`
110:const KikoDots = ({ size = 40, color = 'rgba(167,139,250,0.04)', animated = false }) => {
142:        <div key={i} style={{ width: 3.5, borderRadius: 1.75, background: 'rgba(167,139,250,0.6)', height: 3, animation: `${b.anim} ${b.speed} ease-in-out ${i * 0.06}s infinite` }} />
160:        <div key={i} style={{ width: 3.5, borderRadius: 1.75, background: 'rgba(167,139,250,0.6)', height: 3, animation: `${b.anim} ${b.speed} ease-in-out ${i * 0.07}s infinite` }} />
788:        border: `1px solid ${promptFocused ? 'rgba(167,139,250,0.2)' : transcribing ? 'rgba(34,197,94,0.2)' : C.border}`,
790:          ? `0 0 0 1px rgba(167,139,250,0.1), 0 0 20px rgba(167,139,250,0.06), ${'0 2px 6px rgba(0,0,0,0.35)'}`
798:        {promptFocused && <div style={{ position: 'absolute', inset: 0, borderRadius: 24, pointerEvents: 'none', background: `radial-gradient(circle 140px at ${mousePos.x}% ${mousePos.y}%, rgba(167,139,250,0.06) 0%, transparent 70%)`, transition: `opacity 300ms ${'cubic-bezier(0.25, 0.1, 0.25, 1)'}`, opacity: 1, zIndex: 0 }} />}
800:        {promptFocused && <div onAnimationEnd={() => setShimmerDone(true)} style={{ position: 'absolute', inset: -1, borderRadius: 25, pointerEvents: 'none', background: 'linear-gradient(90deg, transparent 0%, rgba(167,139,250,0.08) 25%, rgba(167,139,250,0.12) 50%, rgba(167,139,250,0.08) 75%, transparent 100%)', backgroundSize: '200% 100%', animation: shimmerDone ? 'none' : 'glowShimmer 1.5s linear forwards', opacity: shimmerDone ? 0.15 : 0.6, transition: 'opacity 600ms ease', zIndex: 0 }} />}
803:          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 0 10px', marginBottom: 8, borderBottom: '0.5px solid rgba(167,139,250,0.06)' }}>
805:            <span style={{ fontSize: 12, color: 'rgba(238,238,238,0.4)', fontFamily: C.font, flex: 1 }}>{pendingAttachment.name}</span>
806:            <button onClick={() => { setPendingAttachment(null); setImagePreview(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(238,238,238,0.3)', padding: 4, fontSize: 14, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>✕</button>
815:            <button onClick={() => setMenuOpen(!menuOpen)} disabled={fileUploading || streaming} style={{ width: 30, height: 30, borderRadius: 9999, background: 'rgba(167,139,250,0.06)', border: `1px solid ${menuOpen ? 'rgba(167,139,250,0.2)' : C.border}`, color: menuOpen ? C.purple : '#555558', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.15)', transition: `all 250ms ${'cubic-bezier(0.34, 1.56, 0.64, 1)'}`, transform: menuOpen ? 'rotate(45deg)' : 'rotate(0deg)' }}
827:                  <button key={m.id} onClick={() => { setMenuOpen(false); if (m.id === 'attach') fileInputRef.current?.click(); else if (m.id === 'research') { setInput('Deep research: '); inputRef.current?.focus(); } else if (m.id === 'brief') { setInput('Brief me on '); inputRef.current?.focus(); } }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(238,238,238,0.75)', fontSize: 13, fontFamily: C.font, cursor: 'pointer', borderRadius: 8, transition: 'background 150ms ease' }}
828:                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(167,139,250,0.06)'}
840:              style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 15, color: 'rgba(238,238,238,0.85)', fontFamily: C.font, minHeight: 24, maxHeight: 200, fontWeight: 400, resize: 'none', lineHeight: '24px', padding: '4px 0', overflowY: 'auto', fieldSizing: 'content', verticalAlign: 'middle', display: 'block', position: 'relative', zIndex: 2 }} />
842:              <div style={{ position: 'absolute', top: 4, left: 0, fontSize: 15, color: 'rgba(238,238,238,0.25)', fontFamily: C.font, fontWeight: 400, pointerEvents: 'none', lineHeight: '24px' }}>
850:            <button onClick={transcribing ? stopTranscribe : startTranscribe} style={{ width: 30, height: 30, borderRadius: 9999, border: `1px solid ${transcribing ? 'rgba(34,197,94,0.25)' : 'rgba(167,139,250,0.12)'}`, background: transcribing ? 'rgba(34,197,94,0.08)' : 'rgba(20,20,24,0.65)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', color: transcribing ? 'rgba(34,197,94,0.9)' : '#3A3A3E', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative', boxShadow: '0 1px 2px rgba(0,0,0,0.15)', transition: `all 250ms ${'cubic-bezier(0.34, 1.56, 0.64, 1)'}` }}
855:            <button onClick={startVoice} style={{ width: 30, height: 30, borderRadius: 9999, border: '1px solid rgba(167,139,250,0.12)', background: 'rgba(167,139,250,0.06)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', color: 'rgba(167,139,250,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.15)', transition: `all 250ms ${'cubic-bezier(0.34, 1.56, 0.64, 1)'}` }}
858:              <svg width={14} height={14} viewBox="0 0 24 24" fill="none"><rect x="4" y="8" width="2" height="8" rx="1" fill="rgba(167,139,250,0.6)" /><rect x="8" y="5" width="2" height="14" rx="1" fill="rgba(167,139,250,0.8)" /><rect x="12" y="7" width="2" height="10" rx="1" fill="rgba(167,139,250,1)" /><rect x="16" y="4" width="2" height="16" rx="1" fill="rgba(167,139,250,0.8)" /><rect x="20" y="9" width="2" height="6" rx="1" fill="rgba(167,139,250,0.6)" /></svg>
864:            <button onClick={() => handleSubmit()} disabled={!hasContent} style={{ width: 30, height: 30, borderRadius: 9999, background: hasContent ? 'linear-gradient(135deg, #7C5CFC, #2DD4BF)' : 'rgba(20,20,24,0.65)', border: hasContent ? 'none' : `1px solid ${C.border}`, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', color: 'rgba(238,238,238,0.95)', cursor: hasContent ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: hasContent ? 1 : 0.25, boxShadow: hasContent ? `0 4px 16px rgba(167,139,250,0.3)` : '0 1px 2px rgba(0,0,0,0.15)', transition: `all 250ms ${'cubic-bezier(0.34, 1.56, 0.64, 1)'}` }}>
873:            <button onClick={() => setMenuOpen(!menuOpen)} disabled={fileUploading || streaming} style={{ width: 30, height: 30, borderRadius: 9999, background: 'rgba(167,139,250,0.06)', border: `1px solid ${menuOpen ? 'rgba(167,139,250,0.2)' : C.border}`, color: menuOpen ? C.purple : '#555558', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.15)', transition: `all 250ms ${'cubic-bezier(0.34, 1.56, 0.64, 1)'}`, transform: menuOpen ? 'rotate(45deg)' : 'rotate(0deg)' }}
885:                  <button key={m.id} onClick={() => { setMenuOpen(false); if (m.id === 'attach') fileInputRef.current?.click(); else if (m.id === 'research') { setInput('Deep research: '); inputRef.current?.focus(); } else if (m.id === 'brief') { setInput('Brief me on '); inputRef.current?.focus(); } }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'rgba(238,238,238,0.75)', fontSize: 13, fontFamily: C.font, cursor: 'pointer', borderRadius: 8, transition: 'background 150ms ease' }}
886:                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(167,139,250,0.06)'}
899:              style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: 15, color: 'rgba(238,238,238,0.85)', fontFamily: C.font, minHeight: 24, maxHeight: 200, fontWeight: 400, resize: 'none', lineHeight: '24px', padding: '4px 0', overflowY: 'auto', fieldSizing: 'content', verticalAlign: 'middle', display: 'block', position: 'relative', zIndex: 2 }} />
904:            <button onClick={transcribing ? stopTranscribe : startTranscribe} style={{ width: 30, height: 30, borderRadius: 9999, border: `1px solid ${transcribing ? 'rgba(34,197,94,0.25)' : 'rgba(167,139,250,0.12)'}`, background: transcribing ? 'rgba(34,197,94,0.08)' : 'rgba(20,20,24,0.65)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', color: transcribing ? 'rgba(34,197,94,0.9)' : '#3A3A3E', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative', boxShadow: '0 1px 2px rgba(0,0,0,0.15)', transition: `all 250ms ${'cubic-bezier(0.34, 1.56, 0.64, 1)'}` }}
910:            <button onClick={startVoice} style={{ width: 30, height: 30, borderRadius: 9999, border: '1px solid rgba(167,139,250,0.12)', background: 'rgba(167,139,250,0.06)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', color: 'rgba(167,139,250,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.15)', transition: `all 250ms ${'cubic-bezier(0.34, 1.56, 0.64, 1)'}` }}
913:              <svg width={14} height={14} viewBox="0 0 24 24" fill="none"><rect x="4" y="8" width="2" height="8" rx="1" fill="rgba(167,139,250,0.6)" /><rect x="8" y="5" width="2" height="14" rx="1" fill="rgba(167,139,250,0.8)" /><rect x="12" y="7" width="2" height="10" rx="1" fill="rgba(167,139,250,1)" /><rect x="16" y="4" width="2" height="16" rx="1" fill="rgba(167,139,250,0.8)" /><rect x="20" y="9" width="2" height="6" rx="1" fill="rgba(167,139,250,0.6)" /></svg>
919:            <button onClick={() => handleSubmit()} disabled={!hasContent} style={{ width: 30, height: 30, borderRadius: 9999, background: hasContent ? 'linear-gradient(135deg, #7C5CFC, #2DD4BF)' : 'rgba(20,20,24,0.65)', border: hasContent ? 'none' : `1px solid ${C.border}`, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', color: 'rgba(238,238,238,0.95)', cursor: hasContent ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: hasContent ? 1 : 0.25, boxShadow: hasContent ? `0 4px 16px rgba(167,139,250,0.3)` : '0 1px 2px rgba(0,0,0,0.15)', transition: `all 250ms ${'cubic-bezier(0.34, 1.56, 0.64, 1)'}` }}>
948:          <div style={{ width: 28, height: 28, borderRadius: 10, background: 'rgba(25,25,25,0.6)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '0.5px solid rgba(167,139,250,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 1px 0 rgba(167,139,250,0.08), 0 2px 8px rgba(0,0,0,0.2)' }}>
951:          <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(167,139,250,0.55)', fontFamily: C.font }}>Kiko</span>
962:                fontSize: 12, color: 'rgba(167,139,250,0.55)', background: isOpen ? 'rgba(20,20,24,0.65)' : 'rgba(167,139,250,0.03)',
964:                border: `1px solid ${isOpen ? 'rgba(26,26,30,0.80)' : 'rgba(167,139,250,0.08)'}`,
995:                              <circle cx="12" cy="12" r="5" fill={isAgent ? C.purple : 'rgba(167,139,250,0.4)'} opacity="0.8" />
997:                            {si < msg.steps.length - 1 && <span style={{ flex: 1, width: 1, background: 'rgba(167,139,250,0.06)', marginTop: 3 }} />}
1000:                            <span style={{ fontSize: 12, color: 'rgba(238,238,238,0.5)', fontFamily: C.font, fontWeight: 400, lineHeight: 1.5 }}>{step.label}</span>
1003:                                <span key={ti} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(167,139,250,0.04)', border: '1px solid rgba(167,139,250,0.06)', color: '#555558' }}>{tool}</span>
1021:          background: isUser ? 'rgba(167,139,250,0.04)' : 'transparent',
1023:          color: isUser ? 'rgba(238,238,238,0.95)' : 'rgba(238,238,238,0.85)',
1064:            <span style={{ fontSize: 11, color: 'rgba(238,238,238,0.4)', fontFamily: C.font, marginRight: 4 }}>
1069:                <button onClick={onClick} title={title} style={{ width: 28, height: 28, borderRadius: 6, background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(238,238,238,0.55)', transition: 'all 0.12s', padding: 0 }}
1070:                  onMouseOver={e => { e.currentTarget.style.background = 'rgba(167,139,250,0.1)'; e.currentTarget.style.color = 'rgba(238,238,238,0.9)' }}
1071:                  onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(238,238,238,0.55)' }}
1104:          <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(10,10,14,0.92)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed rgba(167,139,250,0.5)', borderRadius: 8, margin: 8, pointerEvents: 'none' }}>
1105:            <div style={{ width: 48, height: 48, borderRadius: 50, background: 'rgba(167,139,250,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
1106:              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(167,139,250,0.8)" strokeWidth="1.8"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
1108:            <p style={{ fontSize: 16, fontWeight: 500, color: 'rgba(238,238,238,0.9)', fontFamily: C.font, margin: '0 0 4px' }}>Drop file for Kiko to analyse</p>
1109:            <p style={{ fontSize: 13, color: 'rgba(238,238,238,0.4)', fontFamily: C.font, margin: 0 }}>PDF, Word, Excel, PowerPoint, images, text files</p>
1152:              <div style={{ width: '100%', height: '100%', borderRadius: 50, background: voiceState.status === 'error' ? 'linear-gradient(90deg, transparent, rgba(255,80,80,0.5), transparent)' : voiceState.status === 'connecting' ? 'linear-gradient(90deg, transparent, rgba(245,158,11,0.5), transparent)' : 'linear-gradient(90deg, transparent, rgba(167,139,250,0.5), transparent)', animation: 'kikoListenPulse 2s ease-in-out infinite' }} />
1154:            <div style={{ marginTop: 16, fontSize: 14, fontWeight: 300, fontFamily: C.font, color: voiceState.status === 'error' ? 'rgba(255,80,80,0.4)' : voiceState.status === 'connecting' ? 'rgba(245,158,11,0.3)' : voiceState.speaking ? 'rgba(167,139,250,0.25)' : 'rgba(167,139,250,0.12)', transition: 'color 0.3s' }}>
1159:              background: 'rgba(167,139,250,0.04)', border: '0.5px solid rgba(167,139,250,0.50)',
1160:              fontSize: 13, color: 'rgba(238,238,238,0.25)', cursor: 'pointer', fontFamily: C.font,
1164:              onMouseOut={e => { e.currentTarget.style.background = 'rgba(167,139,250,0.06)'; e.currentTarget.style.borderColor = 'rgba(167,139,250,0.50)'; e.currentTarget.style.color = 'rgba(238,238,238,0.25)' }}
1175:            <h1 style={{ fontSize: 42, fontWeight: 200, color: 'rgba(238,238,238,0.95)', margin: '0 0 6px', fontFamily: C.font, letterSpacing: '-0.03em', textAlign: 'center' }}>
1178:            <p style={{ fontSize: 18, color: 'rgba(238,238,238,0.35)', margin: '0 0 0', fontFamily: C.font, fontWeight: 300, textAlign: 'center' }}>What would you like to work on?</p>
1208:                    border: `1px solid ${C.border}`, color: 'rgba(238,238,238,0.55)',
1213:                    onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(26,26,30,0.80)'; e.currentTarget.style.color = 'rgba(238,238,238,0.85)'; e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
1214:                    onMouseOut={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = 'rgba(238,238,238,0.55)'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.15)'; e.currentTarget.style.transform = 'translateY(0)' }}
1241:        <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(10,10,14,0.92)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed rgba(167,139,250,0.5)', borderRadius: 8, margin: 8, pointerEvents: 'none' }}>
1242:          <div style={{ width: 48, height: 48, borderRadius: 50, background: 'rgba(167,139,250,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
1243:            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(167,139,250,0.8)" strokeWidth="1.8"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
1245:          <p style={{ fontSize: 16, fontWeight: 500, color: 'rgba(238,238,238,0.9)', fontFamily: C.font, margin: '0 0 4px' }}>Drop file for Kiko to analyse</p>
1246:          <p style={{ fontSize: 13, color: 'rgba(238,238,238,0.4)', fontFamily: C.font, margin: 0 }}>PDF, Word, Excel, PowerPoint, images, text files</p>
1265:                style={{ flex: 1, border: '0.5px solid rgba(167,139,250,0.15)', borderRadius: 8, background: 'rgba(167,139,250,0.04)', padding: '5px 10px', fontSize: 13, color: C.text, fontFamily: C.font, outline: 'none' }} />
1266:              <button onClick={confirmRename} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '0.5px solid rgba(167,139,250,0.3)', background: 'rgba(167,139,250,0.1)', color: C.purple, cursor: 'pointer', fontFamily: C.font }}>Save</button>
1270:              onMouseEnter={e => e.currentTarget.style.background = 'rgba(167,139,250,0.04)'}
1279:            <div style={{ position: 'absolute', top: '100%', left: 16, zIndex: 50, minWidth: 160, background: 'rgba(25,25,25,0.30)', backdropFilter: 'blur(40px) saturate(1.4)', WebkitBackdropFilter: 'blur(40px) saturate(1.4)', border: '0.5px solid rgba(167,139,250,0.50)', borderRadius: 10, padding: 4, boxShadow: '0 12px 40px rgba(0,0,0,0.4)' }}>
1281:                onMouseEnter={e => e.currentTarget.style.background = 'rgba(167,139,250,0.06)'}
1286:                onMouseEnter={e => e.currentTarget.style.background = 'rgba(167,139,250,0.06)'}
1290:              <div style={{ height: 1, background: 'rgba(167,139,250,0.06)', margin: '4px 8px' }} />
1307:            <button onClick={() => setShowAllMsgs(true)} style={{ display: 'block', margin: '0 auto 16px', padding: '6px 16px', borderRadius: 12, background: 'rgba(167,139,250,0.04)', border: '0.5px solid rgba(167,139,250,0.40)', color: 'rgba(238,238,238,0.4)', fontSize: 12, cursor: 'pointer', fontFamily: C.font }}>
1319:                  border: '0.5px solid rgba(167,139,250,0.50)',
1320:                  borderTop: '0.5px solid rgba(167,139,250,0.12)',
1321:                  boxShadow: '0 4px 20px rgba(0,0,0,0.25), inset 0 1px 0 rgba(167,139,250,0.06)',
1324:                    <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(167,139,250,0.04)', border: '0.5px solid rgba(167,139,250,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
1327:                    <span style={{ fontSize: 14, color: 'rgba(167,139,250,0.75)', fontFamily: C.font, fontWeight: 400, flex: 1 }}>
1330:                    <button onClick={stopKiko} style={{ padding: '5px 14px', borderRadius: 10, background: 'rgba(167,139,250,0.04)', border: '0.5px solid rgba(167,139,250,0.50)', color: 'rgba(238,238,238,0.35)', fontSize: 12, cursor: 'pointer', fontFamily: C.font, flexShrink: 0, transition: 'all 0.15s' }}
1331:                      onMouseOver={e => { e.currentTarget.style.background = 'rgba(167,139,250,0.08)'; e.currentTarget.style.color = 'rgba(238,238,238,0.7)' }}
1332:                      onMouseOut={e => { e.currentTarget.style.background = 'rgba(167,139,250,0.04)'; e.currentTarget.style.color = 'rgba(238,238,238,0.35)' }}
1336:                  <div style={{ height: 2, borderRadius: 9999, background: 'rgba(167,139,250,0.06)', marginTop: 12, overflow: 'hidden' }}>
1337:                    <div style={{ width: '40%', height: '100%', borderRadius: 9999, background: 'linear-gradient(90deg, rgba(167,139,250,0.3), rgba(167,139,250,0.6), rgba(167,139,250,0.3))', backgroundSize: '200% 100%', animation: 'glowShimmer 2s linear infinite' }} />
1344:                      fontSize: 12, color: 'rgba(167,139,250,0.6)', background: 'rgba(25,25,25,0.50)',
1346:                      border: '0.5px solid rgba(167,139,250,0.50)', borderRadius: 10,
1348:                      transition: 'all 0.2s', boxShadow: 'inset 0 1px 0 rgba(167,139,250,0.05)',
1350:                      <span style={{ width: 16, height: 16, borderRadius: '50%', border: '1.5px solid rgba(167,139,250,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
1351:                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="rgba(167,139,250,0.6)" strokeWidth="2.5"><path d={showSteps ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"}/></svg>
1354:                      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(167,139,250,0.35)' }}>{thinkingSteps.length} steps</span>
1362:                          const dotColor = isAgent ? 'rgba(167,139,250,0.6)' : isMemory ? 'rgba(167,139,250,0.5)' : 'rgba(167,139,250,0.5)'
1366:                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: isLast ? 'rgba(167,139,250,0.7)' : dotColor, flexShrink: 0, animation: isLast ? 'pulse 1.2s infinite' : 'none' }} />
1367:                                {!isLast && <span style={{ flex: 1, width: 1, background: 'rgba(167,139,250,0.08)', marginTop: 4 }} />}
1369:                              <span style={{ fontSize: 12, color: isLast ? 'rgba(167,139,250,0.65)' : 'rgba(238,238,238,0.4)', fontFamily: C.font, fontWeight: 400, lineHeight: 1.5 }}>{step.label}</span>
1383:              <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(167,139,250,0.55)', fontFamily: C.font, marginBottom: 6 }}>Kiko</div>
1384:              <div style={{ fontSize: 15, color: 'rgba(238,238,238,0.85)', lineHeight: 1.7, fontFamily: C.font, fontWeight: 400 }}>
1386:                <span style={{ display: 'inline-block', width: 2, height: 16, background: 'rgba(167,139,250,0.4)', marginLeft: 2, verticalAlign: 'text-bottom', animation: 'kikoBlink 1s infinite' }} />
1388:              <button onClick={stopKiko} style={{ marginTop: 10, padding: '6px 14px', borderRadius: 8, background: 'rgba(167,139,250,0.03)', border: '0.5px solid rgba(167,139,250,0.50)', color: 'rgba(238,238,238,0.4)', fontSize: 12, cursor: 'pointer', fontFamily: C.font, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
1402:              background: 'rgba(167,139,250,0.40)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
1403:              border: '0.5px solid rgba(167,139,250,0.15)', cursor: 'pointer',
1406:              color: 'rgba(238,238,238,0.6)',
1408:            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(167,139,250,0.12)'; e.currentTarget.style.color = 'rgba(238,238,238,0.9)' }}
1409:            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(167,139,250,0.40)'; e.currentTarget.style.color = 'rgba(238,238,238,0.6)' }}
1423:          <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(167,139,250,0.12)', fontFamily: C.font, margin: '8px 0 0', fontWeight: 300 }}>Kiko is AI and can make mistakes. Please double-check responses.</p>
```
- [ ] DONE

## src/components/kiko/EmailDraft.jsx (20 occurrences)
```
184:    <div style={{ margin: '12px 0', borderRadius: 14, overflow: 'hidden', border: '0.5px solid rgba(238,238,238,0.1)', background: 'rgba(238,238,238,0.02)' }}>
186:      <div style={{ padding: '14px 18px 12px', borderBottom: '0.5px solid rgba(238,238,238,0.06)' }}>
187:        <div style={{ fontSize: 10, color: 'rgba(238,238,238,0.25)', fontFamily: T.font, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>Email Draft</div>
188:        {to && <div style={{ fontSize: 13, color: 'rgba(238,238,238,0.45)', fontFamily: T.font, marginBottom: 4 }}><span style={{ color: 'rgba(238,238,238,0.25)' }}>To:</span> {to}</div>}
189:        <div style={{ fontSize: 15, color: 'rgba(238,238,238,0.9)', fontFamily: T.font, fontWeight: 500 }}>{subject}</div>
192:      <div style={{ padding: '16px 18px', fontSize: 14, color: 'rgba(238,238,238,0.7)', fontFamily: T.font, lineHeight: '1.7', opacity: rewriting ? 0.3 : 1, transition: 'opacity 0.3s' }}
194:      {rewriting && <div style={{ padding: '4px 18px 10px', fontSize: 11, color: 'rgba(167,139,250,0.5)', fontFamily: T.font }}>Rewriting...</div>}
196:      <div style={{ padding: '10px 18px 12px', display: 'flex', alignItems: 'center', gap: 6, borderTop: '0.5px solid rgba(238,238,238,0.06)', flexWrap: 'wrap' }}>
199:            padding: '5px 12px', borderRadius: 50, background: 'rgba(238,238,238,0.03)',
200:            border: '0.5px solid rgba(238,238,238,0.08)', color: rewriting ? 'rgba(238,238,238,0.2)' : 'rgba(238,238,238,0.4)',
204:            onMouseOver={e => { if (!rewriting) { e.currentTarget.style.background = 'rgba(238,238,238,0.06)'; e.currentTarget.style.color = 'rgba(238,238,238,0.7)' }}}
205:            onMouseOut={e => { e.currentTarget.style.background = 'rgba(238,238,238,0.03)'; e.currentTarget.style.color = 'rgba(238,238,238,0.4)' }}
210:          <button onClick={handleRevert} style={{ padding: '5px 12px', borderRadius: 50, background: 'rgba(238,238,238,0.03)', border: '0.5px solid rgba(238,238,238,0.08)', color: 'rgba(238,238,238,0.4)', fontSize: 11, cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s', marginRight: 4 }}
211:            onMouseOver={e => { e.currentTarget.style.color = 'rgba(238,238,238,0.7)' }}
212:            onMouseOut={e => { e.currentTarget.style.color = 'rgba(238,238,238,0.4)' }}
217:          background: sent === 'done' ? 'rgba(34,197,94,0.08)' : sent === 'error' ? 'rgba(255,80,80,0.08)' : 'rgba(167,139,250,0.06)',
218:          border: sent === 'done' ? '1px solid rgba(34,197,94,0.15)' : sent === 'error' ? '1px solid rgba(255,80,80,0.15)' : '1px solid rgba(167,139,250,0.12)',
219:          color: sent === 'done' ? 'rgba(34,197,94,0.8)' : sent === 'error' ? 'rgba(255,80,80,0.8)' : 'rgba(167,139,250,0.75)',
223:          onMouseOver={e => { if (!sent) e.currentTarget.style.background = 'rgba(167,139,250,0.12)' }}
224:          onMouseOut={e => { if (!sent) e.currentTarget.style.background = 'rgba(167,139,250,0.06)' }}
```
- [ ] DONE

## src/components/kiko/AllChatsView.jsx (11 occurrences)
```
64:        <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 50, border: 'none', background: 'rgba(238,238,238,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(238,238,238,0.5)', transition: 'background 0.15s' }}
65:          onMouseOver={e => e.currentTarget.style.background = 'rgba(238,238,238,0.1)'}
66:          onMouseOut={e => e.currentTarget.style.background = 'rgba(238,238,238,0.06)'}>
73:        <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(238,238,238,0.3)' }} />
80:      <div style={{ fontSize: 12, color: 'rgba(238,238,238,0.35)', fontFamily: T.font, marginBottom: 12, padding: '0 4px' }}>
87:          <p style={{ textAlign: 'center', padding: 40, color: 'rgba(238,238,238,0.3)', fontSize: 14, fontFamily: T.font }}>
93:              style={{ padding: '14px 16px', borderBottom: `1px solid rgba(238,238,238,0.04)`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'background 0.1s', borderRadius: 8 }}
101:                  <span style={{ fontSize: 12, color: 'rgba(238,238,238,0.3)', fontFamily: T.font }}>{conv.date ? timeAgo(conv.date) : ''}</span>
103:                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 50, background: 'rgba(167,139,250,0.12)', color: 'rgba(167,139,250,0.7)', fontFamily: T.font }}>in messages</span>
108:                style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(238,238,238,0.15)', transition: 'color 0.15s', flexShrink: 0 }}
110:                onMouseOut={e => e.currentTarget.style.color = 'rgba(238,238,238,0.15)'}>
```
- [ ] DONE

## src/components/kiko/DraftPreview.jsx (17 occurrences)
```
101:    <div style={{ background: 'rgba(238,238,238,0.025)', border: '1.5px solid rgba(238,238,238,0.08)', borderRadius: 16, overflow: 'hidden', marginTop: 12, maxWidth: 580, backdropFilter: 'blur(40px) saturate(1.6)', WebkitBackdropFilter: 'blur(40px) saturate(1.6)', boxShadow: 'inset 0 1px 0 rgba(238,238,238,0.06), 0 8px 32px rgba(0,0,0,0.2)' }}>
103:      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid rgba(238,238,238,0.04)' }}>
104:        <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(238,238,238,0.55)', fontFamily: T.font }}>
108:          <button onClick={handleCopy} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(238,238,238,0.1)', background: 'transparent', color: 'rgba(238,238,238,0.4)', fontSize: 12, cursor: 'pointer', fontFamily: T.font, fontWeight: 400 }}>{copied ? '✓ Copied' : 'Copy'}</button>
115:        <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(238,238,238,0.03)', display: 'flex', flexDirection: 'column', gap: 5 }}>
117:            <span style={{ fontSize: 11, color: 'rgba(238,238,238,0.15)', width: 42, textAlign: 'right', fontFamily: T.font }}>To:</span>
118:            <span style={{ fontSize: 13, color: 'rgba(238,238,238,0.55)', fontFamily: T.font, fontWeight: 300 }}>{draft.to}</span>
121:            <span style={{ fontSize: 11, color: 'rgba(238,238,238,0.15)', width: 42, textAlign: 'right', fontFamily: T.font }}>Subject:</span>
122:            <span style={{ fontSize: 13, color: 'rgba(238,238,238,0.55)', fontFamily: T.font, fontWeight: 300 }}>{draft.subject}</span>
128:      <div style={{ padding: '12px 14px', fontSize: 15, lineHeight: 1.85, color: 'rgba(238,238,238,0.85)', fontFamily: T.font, fontWeight: 400, whiteSpace: 'pre-wrap' }}>
133:      <div style={{ display: 'flex', gap: 5, padding: '10px 14px', borderTop: '1px solid rgba(238,238,238,0.03)', flexWrap: 'wrap' }}>
136:            padding: '3px 9px', borderRadius: 50, border: '1px solid rgba(238,238,238,0.06)',
137:            background: 'rgba(238,238,238,0.03)', color: 'rgba(238,238,238,0.32)',
144:      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderTop: '1px solid rgba(238,238,238,0.03)' }}>
148:          style={{ flex: 1, background: 'rgba(238,238,238,0.02)', border: '1px solid rgba(238,238,238,0.05)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'rgba(238,238,238,0.65)', fontFamily: T.font, fontWeight: 300, outline: 'none' }} />
150:          padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(167,139,250,0.15)', background: 'rgba(167,139,250,0.06)',
151:          color: 'rgba(167,139,250,0.6)', fontSize: 11, cursor: 'pointer', fontFamily: T.font, fontWeight: 400, flexShrink: 0,
```
- [ ] DONE

## src/components/kiko/KikoToast.jsx (3 occurrences)
```
41:            <div style={{ fontSize: 12, fontWeight: 400, color: 'rgba(238,238,238,0.6)', fontFamily: T.font }}>Kiko completed a task</div>
42:            <div style={{ fontSize: 11, color: 'rgba(238,238,238,0.25)', fontFamily: T.font, fontWeight: 300, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{toast.query}</div>
50:            background: 'none', border: 'none', color: 'rgba(238,238,238,0.15)',
```
- [ ] DONE

## src/components/kiko/ThreadIndicator.jsx (10 occurrences)
```
114:          background: 'rgba(167,139,250,0.06)',
115:          border: '1px solid rgba(167,139,250,0.16)',
116:          color: 'rgba(167,139,250,0.85)',
120:        onMouseOver={e => { e.currentTarget.style.background = 'rgba(167,139,250,0.10)'; e.currentTarget.style.borderColor = 'rgba(167,139,250,0.24)' }}
121:        onMouseOut={e => { e.currentTarget.style.background = 'rgba(167,139,250,0.06)'; e.currentTarget.style.borderColor = 'rgba(167,139,250,0.16)' }}
135:          border: '1px solid rgba(167,139,250,0.18)',
142:            fontSize: 10, fontWeight: 600, color: 'rgba(167,139,250,0.7)',
163:                onMouseOver={e => e.currentTarget.style.background = 'rgba(167,139,250,0.08)'}
168:                  background: isVoice ? 'rgba(45,212,191,0.10)' : 'rgba(167,139,250,0.10)',
172:                  <Icon size={13} color={isVoice ? '#2DD4BF' : '#A78BFA'} />
```
- [ ] DONE

## src/components/kiko/KikoVoice.jsx (13 occurrences)
```
13:  speaking: '#22c55e', error: '#f87171', idle: 'rgba(167,139,250,0.18)',
366:    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#262624' }}>
380:        background: 'rgba(45,212,191,0.06)', border: '1.5px solid rgba(45,212,191,0.30)',
381:        cursor: 'pointer', color: 'rgba(45,212,191,0.85)',
385:        onMouseOver={e => { e.currentTarget.style.background = 'rgba(45,212,191,0.10)'; e.currentTarget.style.borderColor = 'rgba(45,212,191,0.50)' }}
386:        onMouseOut={e => { e.currentTarget.style.background = 'rgba(45,212,191,0.06)'; e.currentTarget.style.borderColor = 'rgba(45,212,191,0.30)' }}
392:        background: 'rgba(167,139,250,0.04)', border: '1.5px solid rgba(167,139,250,0.40)',
394:        color: 'rgba(238,238,238,0.3)', transition: 'all 0.2s',
396:        onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(167,139,250,0.2)'; e.currentTarget.style.color = 'rgba(238,238,238,0.6)' }}
397:        onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(167,139,250,0.40)'; e.currentTarget.style.color = 'rgba(238,238,238,0.3)' }}
424:        background: 'rgba(167,139,250,0.04)', border: '1.5px solid rgba(167,139,250,0.40)',
425:        color: 'rgba(238,238,238,0.25)', fontSize: 13, fontWeight: 300,
429:        onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(167,139,250,0.40)'; e.currentTarget.style.color = 'rgba(238,238,238,0.25)'; e.currentTarget.style.background = 'rgba(167,139,250,0.04)' }}
```
- [ ] DONE

## src/components/kiko/KikoInsights.jsx (18 occurrences)
```
21:      <span style={{ fontSize: 12, color: 'rgba(238,238,238,0.5)', fontWeight: 400 }}>
24:      <ChevronRight size={10} style={{ color: 'rgba(238,238,238,0.25)' }} />
93:        background: '#262624', borderLeft: `1px solid ${T.border}`,
107:            {alertCount > 0 && <button onClick={dismissAll} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'rgba(238,238,238,0.04)', color: 'rgba(238,238,238,0.35)', fontSize: 11, cursor: 'pointer', fontFamily: T.font }}
108:              onMouseOver={e => { e.currentTarget.style.background = 'rgba(238,238,238,0.08)'; e.currentTarget.style.color = 'rgba(238,238,238,0.6)' }}
109:              onMouseOut={e => { e.currentTarget.style.background = 'rgba(238,238,238,0.04)'; e.currentTarget.style.color = 'rgba(238,238,238,0.35)' }}>Clear all</button>}
110:            <button onClick={onClose} style={{ ...btnBase, background: 'rgba(238,238,238,0.04)', color: 'rgba(238,238,238,0.3)' }}><X size={14} /></button>
116:          {loading && <p style={{ textAlign: 'center', padding: 20, color: 'rgba(238,238,238,0.3)', fontSize: 13, fontFamily: T.font }}>Loading...</p>}
118:          {!loading && totalCount === 0 && <p style={{ textAlign: 'center', padding: 40, color: 'rgba(238,238,238,0.25)', fontSize: 13, fontFamily: T.font }}>No notifications</p>}
123:              <div style={{ padding: '4px 8px 8px', fontSize: 11, color: 'rgba(238,238,238,0.3)', fontFamily: T.font, fontWeight: 500, letterSpacing: '0.5px' }}>PARTNERSHIP SIGNALS</div>
128:                    <span style={{ fontSize: 13, color: 'rgba(238,238,238,0.7)', fontWeight: 400, fontFamily: T.font, display: 'block', lineHeight: 1.4 }}>{alert.title}</span>
131:                    style={{ ...btnBase, background: 'rgba(167,139,250,0.06)', color: 'rgba(167,139,250,0.6)', fontSize: 10, width: 'auto', borderRadius: 6, padding: '0 8px', fontFamily: T.font }}>Discuss</button>
134:                  <button onClick={() => dismissPartnership(alert)} style={{ ...btnBase, background: 'transparent', color: 'rgba(238,238,238,0.15)' }}><X size={10} /></button>
143:              <div style={{ padding: '4px 8px 8px', fontSize: 11, color: 'rgba(238,238,238,0.3)', fontFamily: T.font, fontWeight: 500, letterSpacing: '0.5px' }}>SUGGESTED ACTIONS</div>
148:                    <span style={{ fontSize: 13, color: 'rgba(238,238,238,0.6)', fontWeight: 500, fontFamily: T.font }}>{draft.payload?.entity || 'Action'}: </span>
149:                    <span style={{ fontSize: 13, color: 'rgba(238,238,238,0.4)', fontWeight: 400, fontFamily: T.font }}>{(draft.payload?.suggested_action || 'Follow up').slice(0, 80)}</span>
152:                  <button onClick={() => dismissDraft(draft)} style={{ ...btnBase, background: 'transparent', color: 'rgba(238,238,238,0.15)' }}><Trash2 size={10} /></button>
163:              <span style={{ fontSize: 13, color: 'rgba(238,238,238,0.45)', fontFamily: T.font }}>{alertCount - partnershipAlerts.length} more alert{alertCount - partnershipAlerts.length !== 1 ? 's' : ''} — tap to brief</span>
```
- [ ] DONE

## src/components/campaigns/BulkEditStepsModal.jsx (10 occurrences)
```
9:  text: '#EEEEEE',
10:  textTertiary: 'rgba(238,238,238,0.45)',
11:  accent: '#A78BFA',
12:  accentTeal: '#2DD4BF',
13:  border: 'rgba(238,238,238,0.10)',
14:  surface: 'rgba(238,238,238,0.04)',
193:          <div style={{ fontSize: 10, color: 'rgba(238,238,238,0.7)', lineHeight: 1.5 }}>
200:          background: running ? 'rgba(167,139,250,0.10)' : T.accent,
201:          border: 'none', color: running ? T.accent : '#0A0A0C',
211:            background: 'rgba(45,212,191,0.06)', border: '1px solid rgba(45,212,191,0.30)',
```
- [ ] DONE

## src/components/documents/DocumentCard.jsx (2 occurrences)
```
38:    <div style={{ background: 'rgba(238,238,238,0.07)', borderRadius: 50, padding: 14, border: '1.5px solid rgba(238,238,238,0.1)', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
56:            <span key={i} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(238,238,238,0.04)', color: 'var(--text-secondary)', fontFamily: 'var(--font)' }}>{s}</span>
```
- [ ] DONE

## src/components/documents/DocumentSection.jsx (3 occurrences)
```
80:    <div style={{ background: 'rgba(238,238,238,0.07)', borderRadius: 18, padding: '16px 20px', border: '1.5px solid rgba(238,238,238,0.1)', boxShadow: 'none' }}>
86:        <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, color: 'var(--accent)', background: 'rgba(238,238,238,0.07)', border: '1.5px solid rgba(238,238,238,0.1)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontFamily: 'var(--font)' }}>
93:          {[...Array(2)].map((_, i) => <div key={i} style={{ height: 40, background: 'rgba(238,238,238,0.07)', borderRadius: 50, animation: 'pulse 1.5s infinite' }} />)}
```
- [ ] DONE

## src/components/KikoThinking.jsx (8 occurrences)
```
13:      border: '0.5px solid rgba(167,139,250,0.50)',
14:      borderTop: '0.5px solid rgba(167,139,250,0.08)',
15:      boxShadow: 'inset 3px 3px 0.5px -3.5px rgba(167,139,250,0.12), inset -3px -3px 0.5px -3.5px rgba(167,139,250,0.10), inset 1px 1px 1px -0.5px rgba(167,139,250,0.08), inset -1px -1px 1px -0.5px rgba(167,139,250,0.08), 0 4px 16px rgba(0,0,0,0.20)',
16:      borderLeft: isActive ? '2px solid rgba(167,139,250,0.25)' : '2px solid rgba(167,139,250,0.40)',
24:              fontSize: 12, color: done ? 'rgba(238,238,238,0.5)' : 'rgba(167,139,250,0.7)',
28:                ? <Check style={{ width: 13, height: 13, color: 'rgba(167,139,250,0.6)' }} />
29:                : <Loader2 style={{ width: 13, height: 13, color: 'rgba(167,139,250,0.5)', animation: 'spin 1s linear infinite' }} />
31:              <Wrench style={{ width: 12, height: 12, color: 'rgba(167,139,250,0.2)' }} />
```
- [ ] DONE

## src/pages/Pipeline.jsx (34 occurrences)
```
460:    'To revisit': 'rgba(167,139,250,0.10)',
461:    'Contact made': 'rgba(167,139,250,0.3)',
469:    'To revisit': 'rgba(167,139,250,0.35)',
470:    'Contact made': 'rgba(167,139,250,0.6)',
477:  const sectionTitle = { fontSize: 12, fontWeight: 300, color: 'rgba(167,139,250,0.35)', fontFamily: 'var(--font)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.06em' }
478:  const emptyText = { fontSize: 13, color: 'rgba(167,139,250,0.30)', fontFamily: 'var(--font)', fontStyle: 'italic', fontWeight: 300 }
486:        border: '0.5px solid rgba(167,139,250,0.50)', borderTop: '0.5px solid rgba(167,139,250,0.10)',
487:        boxShadow: '0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(167,139,250,0.06)',
498:            <input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} style={{ width: 14, height: 14, accentColor: 'rgba(167,139,250,0.12)' }} />
524:                    borderRadius: 16, border: isOver ? '1px dashed rgba(167,139,250,0.3)' : '0.5px solid rgba(167,139,250,0.06)',
531:                      <span style={{ fontSize: 11, fontWeight: 400, color: stageTextColor[stage.id] || 'rgba(167,139,250,0.35)', fontFamily: 'var(--font)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{stage.label}</span>
532:                      <span style={{ fontSize: 10, fontWeight: 300, color: stageTextColor[stage.id] || 'rgba(167,139,250,0.25)', fontFamily: 'var(--font)', background: `${stageAccent[stage.id] || 'rgba(25,25,25,0.40)'}33`, borderRadius: 50, padding: '2px 6px' }}>{stageDeals.length}</span>
539:                      <p style={{ fontSize: 12, color: 'rgba(167,139,250,0.12)', textAlign: 'center', padding: '20px 0', fontFamily: 'var(--font)', fontWeight: 300 }}>No deals</p>
546:                        style={{ background: 'rgba(25,25,25,0.40)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRadius: 10, padding: '12px 14px', border: '0.5px solid rgba(167,139,250,0.50)', borderTop: '0.5px solid rgba(167,139,250,0.10)', borderLeft: `3px solid ${stageAccent[stage.id] || 'rgba(167,139,250,0.10)'}`, cursor: 'grab', transition: 'all 0.15s ease', position: 'relative', boxShadow: '0 4px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(167,139,250,0.06)' }}
547:                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(167,139,250,0.50)'; e.currentTarget.style.borderColor = 'rgba(167,139,250,0.10)'; e.currentTarget.style.borderLeftColor = stageAccent[stage.id] || 'rgba(167,139,250,0.10)' }}
548:                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(25,25,25,0.55)'; e.currentTarget.style.borderColor = 'rgba(167,139,250,0.50)'; e.currentTarget.style.borderLeftColor = stageAccent[stage.id] || 'rgba(167,139,250,0.10)' }}>
560:                          <p style={{ fontSize: 11, color: 'rgba(167,139,250,0.30)', margin: '4px 0 0', fontFamily: 'var(--font)' }}>
565:                          <p style={{ fontSize: 11, color: 'rgba(167,139,250,0.25)', margin: '4px 0 0', fontFamily: 'var(--font)' }}>{deal.industry}</p>
570:                            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(167,139,250,0.08)', color: 'rgba(167,139,250,0.6)', fontWeight: 500, fontFamily: 'var(--font)' }}>{deal.pipeline}</span>
591:              <div style={{ background: 'rgba(25,25,25,0.40)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', borderRadius: 18, padding: '20px 20px 16px', border: '0.5px solid rgba(167,139,250,0.50)' }}>
595:                      <div style={{ width: 40, height: 40, borderRadius: 50, background: 'rgba(25,25,25,0.40)', border: '0.5px solid rgba(167,139,250,0.50)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
596:                        <img src={`https://www.google.com/s2/favicons?domain=${companyDomains[selectedDeal.company]}&sz=128`} alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = `<span style="font-size:14px;font-weight:600;color:rgba(167,139,250,0.7)">${(selectedDeal.company || '?')[0].toUpperCase()}</span>` }} />
603:                      {dealCompany?.industry && <p style={{ fontSize: 13, color: 'rgba(167,139,250,0.45)', margin: '3px 0 0', fontFamily: 'var(--font)', fontWeight: 300 }}>{dealCompany.industry}{dealCompany.country ? ` · ${dealCompany.country}` : ''}</p>}
606:                  <button onClick={closePanel} style={{ background: 'rgba(25,25,25,0.40)', border: '0.5px solid rgba(167,139,250,0.50)', borderRadius: 50, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(167,139,250,0.35)', flexShrink: 0 }}><X style={{ width: 14, height: 14 }} /></button>
617:                  <button onClick={() => nav(`/organisations?org=${dealCompany.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--accent)', background: 'rgba(167,139,250,0.06)', padding: '6px 12px', borderRadius: 50, border: '1.5px solid rgba(167,139,250,0.12)', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 300 }}>
622:              <div style={{ background: 'rgba(25,25,25,0.40)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', borderRadius: 18, padding: '16px 20px', border: '0.5px solid rgba(167,139,250,0.50)' }}>
633:                        {ct.picture ? <img src={ct.picture} alt="" style={{ width: 28, height: 28, borderRadius: 50, objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = `<span style="font-size:11px;font-weight:600;color:rgba(167,139,250,0.7)">${(ct.firstName || '?')[0]?.toUpperCase()}${(ct.lastName || '')[0]?.toUpperCase() || ''}</span>` }} /> : (
635:                            <span style={{ fontSize: 12, fontWeight: 400, color: 'rgba(167,139,250,0.45)', fontFamily: 'var(--font)' }}>{(ct.firstName || '?')[0]?.toUpperCase()}</span>
647:              <div style={{ background: 'rgba(25,25,25,0.40)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', borderRadius: 18, padding: '16px 20px', border: '0.5px solid rgba(167,139,250,0.50)' }}>
654:                        <p style={{ fontSize: 11, color: 'rgba(167,139,250,0.25)', margin: '2px 0 0', fontFamily: 'var(--font)', fontWeight: 300 }}>{camp.contacts} contact{camp.contacts !== 1 ? 's' : ''}</p>
662:                <div style={{ background: 'rgba(25,25,25,0.40)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', borderRadius: 18, padding: '16px 20px', border: '0.5px solid rgba(167,139,250,0.50)' }}>
685:              <div style={{ background: 'rgba(25,25,25,0.40)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', borderRadius: 18, padding: '16px 20px', border: '0.5px solid rgba(167,139,250,0.50)' }}>
690:                      style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 400, fontFamily: 'var(--font)', cursor: 'pointer', border: `1px solid ${activityType === t ? 'rgba(167,139,250,0.3)' : 'rgba(167,139,250,0.06)'}`, background: activityType === t ? 'rgba(167,139,250,0.08)' : 'rgba(25,25,25,0.30)', color: activityType === t ? 'rgba(167,139,250,0.8)' : 'rgba(167,139,250,0.40)', transition: 'all 0.15s' }}>{t}</button>
697:                      style={{ flex: 1, background: 'rgba(25,25,25,0.30)', border: '0.5px solid rgba(167,139,250,0.50)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'rgba(238,232,220,0.70)', fontFamily: 'var(--font)', outline: 'none' }} />
```
- [ ] DONE

## src/pages/ContactDetail.jsx (13 occurrences)
```
178:  const glass = { background: 'rgba(238,238,238,0.04)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', border: '0.5px solid rgba(238,238,238,0.1)', boxShadow: '0 8px 36px rgba(0,0,0,0.3)' }
179:  const card = { background: 'rgba(238,238,238,0.04)', borderRadius: 18, padding: 24, border: '0.5px solid rgba(238,238,238,0.1)', boxShadow: 'none' }
180:  const inputStyle = { width: '100%', background: 'rgba(238,238,238,0.04)', border: '1px solid var(--border)', borderRadius: 50, padding: '10px 14px', fontSize: 14, color: 'var(--text)', outline: 'none', fontFamily: 'var(--font)', boxSizing: 'border-box' }
185:  if (loading) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 24, height: 24, border: '2px solid rgba(238,238,238,0.08)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /></div>
193:          <button onClick={() => nav('/contacts')} style={{ background: 'rgba(238,238,238,0.04)', border: 'none', borderRadius: 50, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}>
201:                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 50, background: 'rgba(167,139,250,0.10)', border: '0.5px solid rgba(167,139,250,0.20)', color: '#A78BFA', fontSize: 10, fontWeight: 500, fontFamily: 'var(--font)' }}>
231:                <img src={contact.picture} alt="" style={{ width: 56, height: 56, borderRadius: 18, objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = `<span style="font-size:24px;font-weight:600;color:rgba(167,139,250,0.7)">${(contact.firstName || '?')[0]?.toUpperCase()}${(contact.lastName || '')[0]?.toUpperCase() || ''}</span>` }} />
233:                <div style={{ width: 56, height: 56, borderRadius: 18, background: 'rgba(238,238,238,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
249:              {contact.email && <a href={`mailto:${contact.email}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)', background: 'rgba(238,238,238,0.04)', padding: '6px 12px', borderRadius: 50, textDecoration: 'none', fontFamily: 'var(--font)', border: '0.5px solid rgba(238,238,238,0.08)' }}><Mail style={{ width: 13, height: 13 }} /> Email</a>}
250:              {contact.phone && <a href={`tel:${contact.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)', background: 'rgba(238,238,238,0.04)', padding: '6px 12px', borderRadius: 50, textDecoration: 'none', fontFamily: 'var(--font)', border: '0.5px solid rgba(238,238,238,0.08)' }}><Phone style={{ width: 13, height: 13 }} /> Call</a>}
251:              {contact.linkedin && <a href={contact.linkedin} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)', background: 'rgba(238,238,238,0.04)', padding: '6px 12px', borderRadius: 50, textDecoration: 'none', fontFamily: 'var(--font)', border: '0.5px solid rgba(238,238,238,0.08)' }}><Linkedin style={{ width: 13, height: 13 }} /> LinkedIn</a>}
322:                  <button onClick={save} style={{ alignSelf: 'flex-end', fontSize: 14, fontWeight: 500, background: 'var(--accent)', color: 'rgba(238,238,238,0.9)', padding: '8px 20px', borderRadius: 50, border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}>Save Changes</button>
352:                  <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(238,238,238,0.04)' }}>
```
- [ ] DONE

## src/pages/Contacts.jsx (23 occurrences)
```
90:  const glass = { padding: '12px 20px', borderRadius: 20, background: 'rgba(25,25,25,0.40)', backdropFilter: 'blur(40px) saturate(1.6)', WebkitBackdropFilter: 'blur(40px) saturate(1.6)', border: '0.5px solid rgba(167,139,250,0.50)', boxShadow: 'inset 0 1px 0 rgba(167,139,250,0.10), 0 8px 32px rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
91:  const inputStyle = { width: '100%', background: 'rgba(25,25,25,0.40)', border: '0.5px solid rgba(167,139,250,0.50)', borderRadius: 50, padding: '10px 14px', fontSize: 14, color: 'var(--text)', outline: 'none', fontFamily: 'var(--font)', boxSizing: 'border-box' }
93:  const actionBtn = { width: 30, height: 30, borderRadius: 50, background: 'rgba(25,25,25,0.40)', border: '0.5px solid rgba(167,139,250,0.50)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(167,139,250,0.15)', cursor: 'pointer', transition: 'all 0.2s', boxShadow: 'inset 0 1px 0 rgba(25,25,25,0.35)', flexShrink: 0 }
94:  const stageColors = { 'To revisit': ['rgba(25,25,25,0.40)','rgba(167,139,250,0.08)','rgba(167,139,250,0.25)'], 'Contact made': ['rgba(167,139,250,0.08)','rgba(167,139,250,0.15)','rgba(167,139,250,0.55)'], 'In Dialogue': ['rgba(245,158,11,0.08)','rgba(245,158,11,0.15)','rgba(245,158,11,0.6)'], 'Qualified': ['rgba(6,214,160,0.08)','rgba(6,214,160,0.15)','rgba(6,214,160,0.55)'], 'Meeting arranged (brand x RH)': ['rgba(59,130,246,0.08)','rgba(59,130,246,0.15)','rgba(59,130,246,0.55)'] }
95:  const avatarColors = ['rgba(167,139,250,0.15)', 'rgba(6,214,160,0.15)', 'rgba(236,72,153,0.15)', 'rgba(59,130,246,0.15)', 'rgba(245,158,11,0.15)']
96:  const avatarTextColors = ['rgba(167,139,250,0.7)', 'rgba(6,214,160,0.7)', 'rgba(236,72,153,0.7)', 'rgba(59,130,246,0.7)', 'rgba(245,158,11,0.7)']
105:          <div style={{ fontSize: 23, fontWeight: 200, color: 'rgba(238,238,238,0.88)', letterSpacing: '-0.03em', fontFamily: 'var(--font)' }}>Contacts</div>
106:          <div style={{ fontSize: 14, color: 'rgba(167,139,250,0.25)', fontWeight: 300, marginTop: 2, fontFamily: 'var(--font)' }}>{filtered.length.toLocaleString()} contacts</div>
109:          <div style={{ display: 'flex', alignItems: 'center', width: 260, background: 'rgba(25,25,25,0.40)', backdropFilter: 'blur(40px) saturate(1.6)', border: '0.5px solid rgba(167,139,250,0.50)', borderRadius: 50, padding: '0 16px', boxShadow: 'inset 0 2px 0 rgba(167,139,250,0.10), inset 0 -1px 0 rgba(167,139,250,0.08)' }}>
110:            <Search style={{ width: 14, height: 14, color: 'rgba(167,139,250,0.25)', flexShrink: 0, marginRight: 8 }} />
113:          <select value={sortDir} onChange={e => setSortDir(e.target.value)} style={pillBtn('rgba(167,139,250,0.08)','rgba(167,139,250,0.18)','rgba(167,139,250,0.65)')}>
124:          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '6px 18px 8px', fontSize: 11, color: 'rgba(167,139,250,0.30)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 300, fontFamily: 'var(--font)' }}>
134:            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'rgba(167,139,250,0.15)' }}>
146:                    style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 18px', borderRadius: 12, background: 'rgba(25,25,25,0.55)', border: '0.5px solid rgba(167,139,250,0.50)', cursor: 'pointer', transition: 'all 0.15s' }}
147:                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(167,139,250,0.06)'; e.currentTarget.style.borderColor = 'rgba(167,139,250,0.10)' }}
148:                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(25,25,25,0.55)'; e.currentTarget.style.borderColor = 'rgba(167,139,250,0.50)' }}>
158:                    <div style={{ width: 150, fontSize: 12, color: 'rgba(167,139,250,0.30)', fontFamily: 'var(--font)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.company || '—'}</div>
159:                    <div style={{ width: 180, fontSize: 12, color: 'rgba(167,139,250,0.35)', fontFamily: 'var(--font)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.title || '—'}</div>
160:                    <div style={{ flex: 1, fontSize: 12, color: 'rgba(167,139,250,0.30)', fontFamily: 'var(--font)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.email || ''}</div>
170:                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', fontSize: 13, color: 'rgba(167,139,250,0.25)', fontFamily: 'var(--font)' }}>
171:                  <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{ background: 'none', border: 'none', cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.3 : 1, color: 'rgba(167,139,250,0.35)', padding: 4 }}><ChevronLeft style={{ width: 16, height: 16 }} /></button>
173:                  <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} style={{ background: 'none', border: 'none', cursor: page >= totalPages - 1 ? 'default' : 'pointer', opacity: page >= totalPages - 1 ? 0.3 : 1, color: 'rgba(167,139,250,0.35)', padding: 4 }}><ChevronRight style={{ width: 16, height: 16 }} /></button>
183:          <div style={{ background: 'rgba(25,25,25,0.50)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', borderRadius: 24, border: '0.5px solid rgba(167,139,250,0.50)', boxShadow: 'inset 0 1px 0 rgba(167,139,250,0.08), 0 24px 80px rgba(0,0,0,0.5)', width: '100%', maxWidth: 420, padding: 24 }}>
```
- [ ] DONE

## src/pages/AuthCallback.jsx (2 occurrences)
```
24:    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'rgba(238,238,238,0.04)' }}>
26:        <div style={{ width: 32, height: 32, border: '2px solid rgba(238,238,238,0.06)', borderTopColor: 'rgba(238,238,238,0.12)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
```
- [ ] DONE

## src/pages/CommercialCalendar.jsx (8 occurrences)
```
7:  bg: '#000000', surface: 'rgba(25,25,25,0.40)', surfaceHover: 'rgba(167,139,250,0.06)',
8:  border: 'rgba(167,139,250,0.08)', borderHover: 'rgba(167,139,250,0.12)',
9:  text: 'rgba(238,232,220,0.95)', textSecondary: 'rgba(167,139,250,0.55)', textTertiary: 'rgba(238,238,238,0.32)',
24:  return <img src={src} alt={alts[series] || series} style={{ width: size, height: size, objectFit: 'contain', display: 'block', flexShrink: 0 }} onError={e => { e.target.style.display = 'none'; e.target.insertAdjacentHTML('afterend', `<span style="font-size:${size * 0.5}px;color:rgba(167,139,250,0.55)">${alts[series] || series}</span>`) }} />
222:                s.isSel || s.isRaceDay ? 'rgba(238,238,238,0.32)' : T.f1,
235:                s.isSel ? 'rgba(238,238,238,0.32)' : T.fe,
248:                s.isSel || s.isRaceDay ? 'rgba(238,238,238,0.32)' : T.mgp,
256:                s.isSel ? 'rgba(238,238,238,0.32)' : T.wec,
```
- [ ] DONE

## src/pages/Campaigns.jsx (35 occurrences)
```
38:    active:    { label: 'Active',   bg: 'rgba(45,212,191,0.10)', fg: '#2dd4bf', br: 'rgba(45,212,191,0.25)' },
39:    replied:   { label: 'Replied',  bg: 'rgba(167,139,250,0.10)', fg: '#a78bfa', br: 'rgba(167,139,250,0.25)' },
41:    completed: { label: 'Done',     bg: 'rgba(167,139,250,0.06)', fg: 'rgba(167,139,250,0.5)', br: 'rgba(167,139,250,0.15)' },
302:  const headerCell = { ...cell, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textTertiary || 'rgba(238,238,238,0.45)', fontWeight: 500, background: 'rgba(0,0,0,0.15)', position: 'sticky', top: 0, zIndex: 1 }
319:              style={{ padding: '0 10px', height: 28, borderRadius: 6, border: `1px solid rgba(167,139,250,0.35)`, background: 'rgba(167,139,250,0.08)', color: '#A78BFA', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontFamily: 'inherit', fontWeight: 500 }}
347:                  background: isSelected ? 'rgba(167,139,250,0.10)' : 'transparent',
354:                  <span style={{ fontSize: 13, fontWeight: 500, color: isSelected ? '#fff' : 'rgba(238,238,238,0.85)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
383:                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(45,212,191,0.10)', color: '#2dd4bf', border: '1px solid rgba(45,212,191,0.25)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>Live</span>
395:                    style={{ padding: '7px 14px', borderRadius: 6, border: `1px solid ${selectedCampaign.is_active ? 'rgba(251,191,36,0.30)' : 'rgba(45,212,191,0.30)'}`, background: selectedCampaign.is_active ? 'rgba(251,191,36,0.08)' : 'rgba(45,212,191,0.08)', color: selectedCampaign.is_active ? '#fbbf24' : '#2dd4bf', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 6 }}
424:                      padding: '6px 12px', borderRadius: 6, border: `1px solid ${statusFilter === f ? 'rgba(167,139,250,0.30)' : 'transparent'}`,
425:                      background: statusFilter === f ? 'rgba(167,139,250,0.10)' : 'transparent',
453:                    style={{ padding: '8px 18px', borderRadius: 6, border: '1px solid rgba(167,139,250,0.30)', background: 'rgba(167,139,250,0.10)', color: '#a78bfa', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font }}
542:          <div onClick={e => e.stopPropagation()} style={{ width: 720, maxWidth: 'calc(100vw - 48px)', maxHeight: '85vh', overflowY: 'auto', background: '#262624', border: '1px solid rgba(167,139,250,0.18)', borderRadius: 14, padding: 28, boxShadow: '0 24px 80px rgba(0,0,0,0.6)', margin: '0 auto' }}>
554:                <select value={buildCategory} onChange={e => setBuildCategory(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#1F1F1D', color: C.text, fontSize: 14, fontFamily: 'inherit', marginBottom: 16 }}>
578:                <select value={buildTeam} onChange={e => setBuildTeam(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#1F1F1D', color: C.text, fontSize: 14, fontFamily: 'inherit', marginBottom: 16 }}>
599:                <button onClick={runBuildCampaign} style={{ width: '100%', padding: '13px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #7C5CFC, #2DD4BF)', color: 'white', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', marginTop: 12 }}>
611:                <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(45,212,191,0.08)', border: '1px solid rgba(45,212,191,0.2)', marginBottom: 16 }}>
616:                  <div style={{ padding: '10px', borderRadius: 6, background: '#1F1F1D', textAlign: 'center' }}>
620:                  <div style={{ padding: '10px', borderRadius: 6, background: '#1F1F1D', textAlign: 'center' }}>
624:                  <div style={{ padding: '10px', borderRadius: 6, background: '#1F1F1D', textAlign: 'center' }}>
633:                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(167,139,250,0.12)', color: '#A78BFA', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, flexShrink: 0 }}>{i + 1}</div>
649:                  <button onClick={runEnroll} style={{ flex: 2, padding: '12px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #7C5CFC, #2DD4BF)', color: 'white', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
674:                <div style={{ fontSize: 11, color: C.textSecondary, marginBottom: 16, fontFamily: 'monospace', padding: 10, background: '#1F1F1D', borderRadius: 6 }}>{buildError}</div>
721:      background: hasMatches ? 'rgba(45,212,191,0.06)' : 'rgba(255,255,255,0.03)',
722:      border: `0.5px solid ${hasMatches ? 'rgba(45,212,191,0.20)' : 'rgba(255,255,255,0.08)'}`,
728:          background: hasMatches ? 'rgba(45,212,191,0.20)' : 'rgba(255,255,255,0.06)',
730:          fontSize: 10, color: hasMatches ? '#2DD4BF' : 'rgba(255,255,255,0.4)',
732:        <div style={{ fontSize: 11, fontWeight: 500, color: hasMatches ? '#2DD4BF' : 'rgba(255,255,255,0.55)' }}>
827:          {pollMode && <span style={{ fontSize: 9, color: 'rgba(45,212,191,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>● live</span>}
844:              background: isActive ? 'rgba(167,139,250,0.10)' : isDone ? 'rgba(45,212,191,0.05)' : 'transparent',
845:              border: `0.5px solid ${isActive ? 'rgba(167,139,250,0.30)' : isDone ? 'rgba(45,212,191,0.20)' : 'rgba(255,255,255,0.06)'}`,
849:              <div style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDone ? '#2DD4BF' : isActive ? 'transparent' : 'rgba(255,255,255,0.06)', border: isActive ? '1.5px solid #A78BFA' : 'none' }}>
850:                {isDone && <span style={{ color: '#1F1F1D', fontSize: 11, fontWeight: 700 }}>✓</span>}
851:                {isActive && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#A78BFA', animation: 'pulse 1.2s ease-in-out infinite' }} />}
854:                <div style={{ fontSize: 12, color: isActive ? '#fff' : isDone ? 'rgba(45,212,191,0.85)' : 'rgba(255,255,255,0.55)', fontWeight: 500, marginBottom: 2 }}>
```
- [ ] DONE

## src/pages/Organisations.jsx (44 occurrences)
```
22:      <div style={{ width: size, height: size, borderRadius: size > 30 ? 10 : 8, background: 'rgba(25,25,25,0.40)', border: '0.5px solid rgba(167,139,250,0.50)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
309:  const glass = { margin: '0 16px', padding: '12px 20px', borderRadius: 18, background: 'rgba(25,25,25,0.40)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', border: '0.5px solid rgba(167,139,250,0.50)', boxShadow: '0 8px 36px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
310:  const listCard = { background: 'rgba(25,25,25,0.40)', borderRadius: 50, padding: '14px 18px', border: '0.5px solid rgba(167,139,250,0.50)', boxShadow: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'box-shadow 0.15s ease', cursor: 'pointer' }
383:                border: isActive ? '1.5px solid rgba(167,139,250,0.25)' : '0.5px solid rgba(167,139,250,0.08)',
384:                background: isActive ? 'rgba(167,139,250,0.12)' : isOpen ? 'rgba(25,25,25,0.40)' : 'rgba(25,25,25,0.40)',
390:                {chip.count > 0 && <span style={{ fontSize: 11, fontWeight: 400, background: 'rgba(167,139,250,0.25)', borderRadius: 50, padding: '1px 5px' }}>{chip.count}</span>}
404:            <div style={{ position: 'absolute', top: 36, left: 0, zIndex: 200, background: 'rgba(25,25,25,0.50)', backdropFilter: 'blur(40px) saturate(1.6)', WebkitBackdropFilter: 'blur(40px) saturate(1.6)', border: '0.5px solid rgba(167,139,250,0.50)', borderRadius: 18, padding: 14, boxShadow: 'inset 0 2px 0 rgba(167,139,250,0.10), 0 8px 32px rgba(0,0,0,0.4)', minWidth: 280, maxWidth: 360 }}
416:                          padding: '4px 10px', borderRadius: 50, border: '0.5px solid rgba(167,139,250,0.50)',
417:                          background: sel ? 'rgba(167,139,250,0.12)' : 'rgba(25,25,25,0.40)', color: sel ? 'rgba(238,232,220,0.90)' : 'var(--text-secondary)',
435:                          padding: '4px 10px', borderRadius: 50, border: '0.5px solid rgba(167,139,250,0.50)',
436:                          background: sel ? 'rgba(167,139,250,0.12)' : 'rgba(25,25,25,0.40)', color: sel ? 'rgba(238,232,220,0.90)' : 'var(--text-secondary)',
466:                          padding: '4px 10px', borderRadius: 50, border: '0.5px solid rgba(167,139,250,0.50)',
467:                          background: sel ? 'rgba(167,139,250,0.12)' : 'rgba(25,25,25,0.40)', color: sel ? 'rgba(238,232,220,0.90)' : 'var(--text-secondary)',
497:                <button onClick={() => setOpenPopover(null)} style={{ fontSize: 13, fontWeight: 500, padding: '6px 16px', borderRadius: 50, background: 'rgba(167,139,250,0.12)', color: 'rgba(238,232,220,0.90)', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}>
528:                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px 3px 10px', borderRadius: 50, background: 'rgba(167,139,250,0.08)', color: 'rgba(167,139,250,0.6)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)' }}>
556:              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '6px 18px 8px', fontSize: 11, color: 'rgba(167,139,250,0.30)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 300, fontFamily: 'var(--font)' }}>
566:                <div key={company.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 18px', borderRadius: 12, background: selectedOrg?.id === company.id ? 'rgba(167,139,250,0.06)' : 'rgba(25,25,25,0.55)', border: `1px solid ${selectedOrg?.id === company.id ? 'rgba(167,139,250,0.12)' : 'rgba(167,139,250,0.50)'}`, cursor: 'pointer', transition: 'all 0.15s' }}
568:                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(167,139,250,0.06)'; e.currentTarget.style.borderColor = 'rgba(167,139,250,0.10)' }}
569:                  onMouseLeave={e => { e.currentTarget.style.background = selectedOrg?.id === company.id ? 'rgba(167,139,250,0.06)' : 'rgba(25,25,25,0.55)'; e.currentTarget.style.borderColor = selectedOrg?.id === company.id ? 'rgba(167,139,250,0.12)' : 'rgba(167,139,250,0.50)' }}>
572:                  <div style={{ width: 130, fontSize: 12, color: 'rgba(167,139,250,0.30)', fontFamily: 'var(--font)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{company.industry || '—'}</div>
573:                  <div style={{ width: 120, fontSize: 12, color: 'rgba(167,139,250,0.35)', fontFamily: 'var(--font)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{company.country || '—'}</div>
574:                  <div style={{ width: 100, fontSize: 12, color: company.totalFunding ? 'rgba(6,214,160,0.5)' : 'rgba(167,139,250,0.08)', fontFamily: 'var(--font)', textAlign: 'right' }}>{company.totalFunding || '—'}</div>
575:                  <div style={{ flex: 1, fontSize: 12, color: 'rgba(167,139,250,0.30)', fontFamily: 'var(--font)', textAlign: 'right' }}>{company.contactCount || 0}</div>
577:                    <button onClick={(e) => { e.stopPropagation(); edit(company) }} style={{ fontSize: 11, color: 'rgba(167,139,250,0.30)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', transition: 'color 0.15s' }} onMouseEnter={e => e.currentTarget.style.color = 'rgba(167,139,250,0.55)'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(167,139,250,0.15)'}>Edit</button>
578:                    <button onClick={(e) => { e.stopPropagation(); remove(company.id) }} style={{ color: 'rgba(167,139,250,0.10)', background: 'none', border: 'none', cursor: 'pointer', padding: 2, transition: 'color 0.15s' }} onMouseEnter={e => e.currentTarget.style.color = '#ef4444'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(167,139,250,0.10)'}><X style={{ width: 12, height: 12 }} /></button>
591:              <div style={{ background: 'rgba(25,25,25,0.40)', borderRadius: 18, padding: '20px 20px 16px', border: '0.5px solid rgba(167,139,250,0.50)', boxShadow: 'none' }}>
624:                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-tertiary)', background: 'rgba(0,0,0,0.02)', padding: '6px 12px', borderRadius: 50, fontFamily: 'var(--font)', border: '0.5px solid rgba(167,139,250,0.50)' }}>
629:                    <a href={selectedOrg.website.startsWith('http') ? selectedOrg.website : `https://${selectedOrg.website}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)', background: 'rgba(25,25,25,0.40)', padding: '6px 12px', borderRadius: 50, textDecoration: 'none', fontFamily: 'var(--font)', border: '0.5px solid rgba(167,139,250,0.50)' }}>
633:                    <a href={`https://${orgDomain}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)', background: 'rgba(25,25,25,0.40)', padding: '6px 12px', borderRadius: 50, textDecoration: 'none', fontFamily: 'var(--font)', border: '0.5px solid rgba(167,139,250,0.50)' }}>
637:                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-tertiary)', background: 'rgba(0,0,0,0.02)', padding: '6px 12px', borderRadius: 50, fontFamily: 'var(--font)', border: '0.5px solid rgba(167,139,250,0.50)' }}>
641:                  <button onClick={() => edit(selectedOrg)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)', background: 'rgba(25,25,25,0.40)', padding: '6px 12px', borderRadius: 50, border: '0.5px solid rgba(167,139,250,0.50)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
649:                <div style={{ background: 'rgba(25,25,25,0.40)', borderRadius: 18, padding: '16px 20px', border: '0.5px solid rgba(167,139,250,0.50)', boxShadow: 'none' }}>
664:                <div style={{ background: 'rgba(25,25,25,0.40)', borderRadius: 18, padding: '16px 20px', border: '0.5px solid rgba(167,139,250,0.50)', boxShadow: 'none' }}>
678:              <div style={{ background: 'rgba(25,25,25,0.40)', borderRadius: 18, padding: '16px 20px', border: '0.5px solid rgba(167,139,250,0.50)', boxShadow: 'none' }}>
708:              <div style={{ background: 'rgba(25,25,25,0.40)', borderRadius: 18, padding: '16px 20px', border: '0.5px solid rgba(167,139,250,0.50)', boxShadow: 'none' }}>
723:              <div style={{ background: 'rgba(25,25,25,0.40)', borderRadius: 18, padding: '16px 20px', border: '0.5px solid rgba(167,139,250,0.50)', boxShadow: 'none' }}>
737:              <div style={{ background: 'rgba(25,25,25,0.40)', borderRadius: 18, padding: '16px 20px', border: '0.5px solid rgba(167,139,250,0.50)', boxShadow: 'none' }}>
759:              <div style={{ background: 'rgba(25,25,25,0.40)', borderRadius: 18, padding: '16px 20px', border: '0.5px solid rgba(167,139,250,0.50)', boxShadow: 'none' }}>
805:                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 11px', borderRadius: 9, border: '0.5px solid rgba(167,139,250,0.50)', background: 'rgba(0,0,0,0.01)', cursor: 'default', transition: 'border-color 0.12s' }}
806:                          onMouseOver={e => e.currentTarget.style.borderColor = 'rgba(167,139,250,0.10)'}
809:                          <div style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(25,25,25,0.40)', border: '0.5px solid rgba(167,139,250,0.50)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
848:              <div style={{ background: 'rgba(25,25,25,0.40)', borderRadius: 18, padding: '16px 20px', border: '0.5px solid rgba(167,139,250,0.50)', boxShadow: 'none' }}>
855:                      const typeColor = { funding: '#10b981', partnership: '#3b82f6', product: '#A78BFA', leadership: '#f59e0b', acquisition: '#ef4444', expansion: '#06b6d4' }[s.type] || 'var(--text-tertiary)'
883:          <div style={{ background: 'rgba(25,25,25,0.40)', borderRadius: 50, border: '0.5px solid rgba(167,139,250,0.50)', boxShadow: '0 24px 80px rgba(167,139,250,0.10), 0 8px 24px rgba(25,25,25,0.40)', width: '100%', maxWidth: 420, padding: 24 }}>
```
- [ ] DONE

## src/pages/SequenceDetail.jsx (60 occurrences)
```
8:  bg: '#262624',
9:  card: '#1F1F1D',
10:  cardHover: '#2C2C2A',
17:  purple: '#A78BFA',
18:  teal: '#2DD4BF',
659:          <button onClick={save} disabled={saving} style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: 'rgba(167,139,250,0.10)', color: C.purple, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font, opacity: saving ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 5, boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }}><Save size={12} />{saving ? 'Saving...' : 'Save'}</button>
674:                  background: (i === 0 && tab === 'sequence') || (i === 1 && tab === 'leads') ? 'rgba(167,139,250,0.12)' : 'transparent',
676:                  border: `1px solid ${(i === 0 && tab === 'sequence') || (i === 1 && tab === 'leads') ? 'rgba(167,139,250,0.2)' : C.border}`
685:        <div style={{ padding: '10px 16px', borderRadius: 6, background: 'rgba(45,212,191,0.04)', border: '0.5px solid rgba(45,212,191,0.15)', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
712:          <button key={t.id} onClick={() => { setTab(t.id); setSelectedLead(null) }} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: C.font, fontSize: 12, background: tab === t.id ? 'rgba(167,139,250,0.08)' : 'transparent', color: tab === t.id ? C.text : C.textSec, display: 'flex', alignItems: 'center', gap: 5 }}>
713:            {t.label}{t.ct !== undefined && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'rgba(167,139,250,0.06)', color: C.purple }}>{t.ct}</span>}
734:                    <option value={0} style={{ background: '#262624' }}>Immediately</option>
735:                    {[1, 2, 3, 4, 5, 7, 10, 14].map(d => <option key={d} value={d} style={{ background: '#262624' }}>Wait {d}d</option>)}
738:                <div onClick={() => setSelStep(i)} style={{ ...glass, padding: '8px 10px', cursor: 'pointer', borderColor: sel ? C.purple : C.border, background: sel ? 'rgba(167,139,250,0.04)' : glass.background, transition: 'all 0.15s' }}>
740:                    <div style={{ width: 20, height: 20, borderRadius: 5, background: s.type === 'condition' ? 'rgba(251,191,36,0.10)' : isLI ? 'rgba(0,119,181,0.12)' : 'rgba(167,139,250,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
791:                        {CONDITIONS.map(c => <option key={c.value} value={c.value} style={{ background: '#262624' }}>{c.label}</option>)}
796:                      <div style={{ padding: 12, borderRadius: 6, background: 'rgba(45,212,191,0.03)', border: '0.5px solid rgba(45,212,191,0.12)' }}>
826:                      <button onClick={() => askKiko(selStep)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 6, border: `0.5px solid rgba(167,139,250,0.15)`, background: 'rgba(167,139,250,0.04)', color: C.purple, fontSize: 11, cursor: 'pointer', fontFamily: C.font, flex: 1, justifyContent: 'center' }}><Sparkles size={12} />Ask Kiko to optimise branches</button>
839:                    <select value={cur.approach || ''} onChange={e => updAndRegen(selStep, 'approach', e.target.value)} style={{ ...inputStyle, padding: '5px 6px', fontSize: 11 }}>{APPROACHES.map(a => <option key={a} value={a} style={{ background: '#262624' }}>{a}</option>)}</select></div>
841:                    <select value={cur.psychology || ''} onChange={e => updAndRegen(selStep, 'psychology', e.target.value)} style={{ ...inputStyle, padding: '5px 6px', fontSize: 11 }}>{PSYCHOLOGY.map(p => <option key={p} value={p} style={{ background: '#262624' }}>{p.replace(/_/g, ' ')}</option>)}</select></div>
852:                    <button onClick={() => { askKiko(selStep); setRegenPrompt(false) }} style={{ padding: '4px 10px', borderRadius: 4, border: 'none', background: 'rgba(167,139,250,0.10)', color: C.purple, fontSize: 10, cursor: 'pointer', fontFamily: C.font }}>Regenerate</button>
875:                  <button onClick={() => askKiko(selStep)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 6, border: `0.5px solid rgba(167,139,250,0.15)`, background: 'rgba(167,139,250,0.04)', color: C.purple, fontSize: 11, cursor: 'pointer', fontFamily: C.font, flex: 1, justifyContent: 'center' }}><Sparkles size={12} />Ask Kiko to write this step</button>
876:                  {cur.channel === 'email' && <button onClick={() => sendTest(selStep)} disabled={testSending} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 6, border: `0.5px solid ${testSent ? 'rgba(45,212,191,0.2)' : C.border}`, background: testSent ? 'rgba(45,212,191,0.04)' : 'transparent', color: testSent ? C.teal : C.textSec, fontSize: 11, cursor: 'pointer', fontFamily: C.font, whiteSpace: 'nowrap' }}>{testSending ? 'Sending...' : testSent ? '✓ Test sent' : '📧 Send test to me'}</button>}
881:                  <div style={{ marginTop: 10, padding: 10, borderRadius: 6, background: 'rgba(167,139,250,0.025)', border: `0.5px solid rgba(167,139,250,0.10)` }}>
903:                          background: refining || !refineText.trim() ? 'rgba(167,139,250,0.05)' : 'rgba(167,139,250,0.12)',
925:                      <button onClick={() => setShowAddCondition(true)} style={{ padding: '4px 10px', borderRadius: 5, border: `0.5px solid ${C.border}`, background: 'rgba(167,139,250,0.04)', color: C.purple, fontSize: 10, cursor: 'pointer', fontFamily: C.font }}>+ Add trigger</button>
946:                      <div style={{ padding: 12, marginTop: 6, borderRadius: 6, background: 'rgba(167,139,250,0.04)', border: `0.5px solid ${C.border}` }}>
951:                              <option value="opened" style={{ background: '#262624' }}>opened</option>
952:                              <option value="not_opened" style={{ background: '#262624' }}>not opened</option>
953:                              <option value="clicked" style={{ background: '#262624' }}>clicked</option>
954:                              <option value="not_clicked" style={{ background: '#262624' }}>not clicked</option>
955:                              <option value="replied" style={{ background: '#262624' }}>replied</option>
956:                              <option value="not_replied" style={{ background: '#262624' }}>not replied</option>
957:                              <option value="days_since_last_action" style={{ background: '#262624' }}>days since last action</option>
958:                              <option value="company_attribute" style={{ background: '#262624' }}>company attribute</option>
959:                              <option value="has_meeting" style={{ background: '#262624' }}>has meeting booked</option>
989:                          <button onClick={addCondition} style={{ padding: '6px 14px', borderRadius: 5, border: 'none', background: 'rgba(167,139,250,0.10)', color: C.purple, fontSize: 11, cursor: 'pointer', fontFamily: C.font }}>Save trigger</button>
1002:                  <button onClick={() => addStep('email')} style={{ padding: '6px 12px', borderRadius: 5, border: `0.5px solid rgba(167,139,250,0.15)`, background: 'rgba(167,139,250,0.04)', color: C.purple, fontSize: 11, cursor: 'pointer', fontFamily: C.font }}>+ Email</button>
1013:            <button onClick={() => { if (dirty) save(); setTab('leads') }} style={{ padding: '10px 24px', borderRadius: 6, border: 'none', background: 'rgba(167,139,250,0.10)', color: C.purple, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: C.font, boxShadow: '0 1px 2px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: 6 }}>
1040:                  <button onClick={queueBackgroundSource} disabled={bgSourcing} style={{ padding: '5px 12px', borderRadius: 5, border: `0.5px solid rgba(167,139,250,0.30)`, background: 'rgba(167,139,250,0.06)', color: C.purple, fontSize: 11, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 4 }} title="Queues a background job. Kiko sources contacts via Sonnet+web search while you do other work.">⚡{bgSourcing ? 'Queueing…' : 'Source in background'}</button>
1042:                  <button onClick={() => setShowAddLeads(true)} style={{ padding: '5px 12px', borderRadius: 5, border: 'none', background: 'rgba(167,139,250,0.10)', color: C.purple, fontSize: 11, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 4 }}><UserPlus size={12} />Add from CRM</button>
1046:                <div style={{ padding: '8px 16px', borderBottom: `0.5px solid ${C.border}`, background: bgJobMsg.startsWith('✅') ? 'rgba(167,139,250,0.04)' : 'rgba(248,113,113,0.04)', fontSize: 11, color: bgJobMsg.startsWith('✅') ? C.purple : C.red }}>
1051:                <div style={{ padding: '10px 16px', borderBottom: `0.5px solid ${C.border}`, background: 'rgba(45,212,191,0.02)' }}>
1057:                        <div key={s.id} onClick={() => checked ? setSelectedLeads(selectedLeads.filter(l => l.id !== s.id)) : setSelectedLeads([...selectedLeads, s])} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', cursor: 'pointer', borderRadius: 4, background: checked ? 'rgba(167,139,250,0.03)' : 'transparent' }}>
1066:                  {selectedLeads.length > 0 && <button onClick={enrollSelected} style={{ marginTop: 8, padding: '6px 14px', borderRadius: 5, border: 'none', background: 'rgba(167,139,250,0.10)', color: C.purple, fontSize: 11, cursor: 'pointer', fontFamily: C.font }}>Enroll {selectedLeads.length} contact{selectedLeads.length > 1 ? 's' : ''}</button>}
1076:                    <div key={e.id} onClick={() => selectLeadForTimeline(e)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: `0.5px solid ${C.border}`, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s', background: isSelected ? 'rgba(167,139,250,0.04)' : 'transparent' }}
1077:                      onMouseEnter={ev => { if (!isSelected) ev.currentTarget.style.background = 'rgba(167,139,250,0.02)' }}
1116:                          <div style={{ position: 'absolute', left: -15, top: 12, width: 8, height: 8, borderRadius: '50%', background: '#262624', border: `2px solid ${isSent ? 'rgba(45,212,191,0.5)' : isFailed ? 'rgba(248,113,113,0.5)' : 'rgba(238,238,238,0.2)'}`, zIndex: 1 }} />
1131:                                  <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 10, background: 'rgba(167,139,250,0.08)', border: '0.5px solid rgba(167,139,250,0.18)', color: C.purple }}>
1143:                      <div style={{ position: 'absolute', left: -15, top: 12, width: 8, height: 8, borderRadius: '50%', background: '#262624', border: `2px solid rgba(167,139,250,0.3)`, zIndex: 1 }} />
1161:            <button onClick={verifyTargets} disabled={verifying} style={{ padding: '10px 20px', borderRadius: 6, border: `0.5px solid ${C.border}`, background: verifying ? 'rgba(167,139,250,0.05)' : 'rgba(167,139,250,0.10)', color: '#a78bfa', fontSize: 13, fontWeight: 500, cursor: verifying ? 'wait' : 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 6, opacity: verifying ? 0.6 : 1 }}>
1167:            <button onClick={() => setShowLaunchConfirm(true)} disabled={launching} style={{ padding: '10px 28px', borderRadius: 6, border: 'none', background: 'rgba(45,212,191,0.12)', color: C.teal, fontSize: 13, fontWeight: 600, cursor: launching ? 'wait' : 'pointer', fontFamily: C.font, boxShadow: '0 1px 2px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: 6, opacity: launching ? 0.6 : 1 }}>
1262:                      <div key={i} style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(167,139,250,0.04)', border: `0.5px solid ${C.border}` }}>
1264:                          <span style={{ fontSize: 10, fontWeight: 500, color: C.purple, padding: '2px 7px', borderRadius: 10, background: 'rgba(167,139,250,0.10)', border: '0.5px solid rgba(167,139,250,0.20)' }}>#{i + 1}</span>
1302:                      <div style={{ width: 20, height: 20, borderRadius: 5, background: s.type === 'condition' ? 'rgba(251,191,36,0.10)' : s.channel === 'linkedin' ? 'rgba(0,119,181,0.12)' : 'rgba(167,139,250,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
1347:            <button onClick={addManualLead} disabled={manualAdding || !manualLead.email.trim()} style={{ width: '100%', padding: '9px 0', borderRadius: 6, border: 'none', background: manualAdding ? C.cardHover : 'rgba(167,139,250,0.10)', color: manualAdding ? C.textTer : C.purple, fontSize: 12, fontWeight: 500, cursor: manualAdding ? 'default' : 'pointer', fontFamily: C.font }}>
1364:              <button onClick={searchContacts} disabled={searching} style={{ padding: '8px 14px', borderRadius: 6, border: 'none', background: 'rgba(167,139,250,0.10)', color: C.purple, fontSize: 11, cursor: 'pointer', fontFamily: C.font }}><Search size={12} /></button>
1370:                  <div key={r.id} onClick={() => checked ? setSelectedLeads(selectedLeads.filter(l => l.id !== r.id)) : setSelectedLeads([...selectedLeads, r])} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderBottom: `0.5px solid ${C.border}`, cursor: 'pointer', background: checked ? 'rgba(167,139,250,0.03)' : 'transparent' }}>
1378:            {selectedLeads.length > 0 && <button onClick={enrollSelected} style={{ width: '100%', padding: '9px 0', borderRadius: 6, border: 'none', background: 'rgba(167,139,250,0.10)', color: C.purple, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font }}>Enroll {selectedLeads.length} contact{selectedLeads.length > 1 ? 's' : ''}</button>}
1397:              <button onClick={launchCampaign} disabled={launching} style={{ padding: '10px 28px', borderRadius: 6, border: 'none', background: 'rgba(45,212,191,0.15)', color: C.teal, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: C.font, boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }}>{launching ? '⏳ Launching...' : '🚀 Go Live'}</button>
```
- [ ] DONE

## src/pages/MemoryConsole.jsx (7 occurrences)
```
6:  bg: '#000000', surface: 'rgba(238,238,238,0.04)', surfaceHover: 'rgba(238,238,238,0.06)',
7:  border: 'rgba(238,238,238,0.08)', borderHover: 'rgba(238,238,238,0.1)',
8:  text: 'rgba(238,238,238,0.95)', textSecondary: 'rgba(238,238,238,0.55)', textTertiary: 'rgba(238,238,238,0.32)',
9:  accent: 'rgba(238,238,238,0.12)', accentSoft: 'rgba(238,238,238,0.04)',
98:          color: 'rgba(238,238,238,0.9)', border: 'none', fontSize: 14, fontWeight: 500,
116:              height: 36, padding: '0 16px', borderRadius: 50, background: T.accent, color: 'rgba(238,238,238,0.9)',
167:                              height: 32, padding: '0 14px', borderRadius: 50, background: T.accent, color: 'rgba(238,238,238,0.9)',
```
- [ ] DONE

## src/pages/AdminSystem.jsx (12 occurrences)
```
140:    background: ok ? 'rgba(45,212,191,0.04)' : 'rgba(248,113,113,0.06)',
141:    border: `0.5px solid ${ok ? 'rgba(45,212,191,0.20)' : 'rgba(248,113,113,0.25)'}`,
179:      <div style={{ ...card, background: overallOk ? 'rgba(45,212,191,0.03)' : 'rgba(248,113,113,0.04)', border: `0.5px solid ${overallOk ? 'rgba(45,212,191,0.20)' : 'rgba(248,113,113,0.25)'}`, display: 'flex', alignItems: 'center', gap: 20 }}>
181:          ? <CheckCircle2 size={40} color="#2DD4BF" />
184:          <div style={{ fontSize: 28, fontWeight: 600, color: overallOk ? '#2DD4BF' : '#F87171', lineHeight: 1 }}>
221:                  ? <CheckCircle2 size={14} color="#2DD4BF" style={{ flexShrink: 0 }} />
241:              const bg = hb.status === 'error' ? 'rgba(248,113,113,0.06)' : hb.status === 'finished' ? 'rgba(45,212,191,0.03)' : 'rgba(167,139,250,0.03)'
242:              const bd = hb.status === 'error' ? 'rgba(248,113,113,0.25)' : hb.status === 'finished' ? 'rgba(45,212,191,0.15)' : 'rgba(167,139,250,0.15)'
250:                    background: hb.status === 'error' ? 'rgba(248,113,113,0.15)' : hb.status === 'finished' ? 'rgba(45,212,191,0.12)' : 'rgba(167,139,250,0.12)',
251:                    color: hb.status === 'error' ? '#F87171' : hb.status === 'finished' ? '#2DD4BF' : '#A78BFA',
271:          <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(45,212,191,0.04)', border: '0.5px solid rgba(45,212,191,0.20)', fontSize: 11, color: '#2DD4BF', display: 'flex', alignItems: 'center', gap: 8 }}>
300:          <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(45,212,191,0.04)', border: '0.5px solid rgba(45,212,191,0.20)', fontSize: 11, color: '#2DD4BF', display: 'flex', alignItems: 'center', gap: 8 }}>
```
- [ ] DONE

## src/pages/OutreachIntelligence.jsx (37 occurrences)
```
200:  const urgencyColor = (u) => u >= 3 ? 'rgba(255,59,48,0.6)' : u >= 2 ? 'rgba(245,158,11,0.5)' : u >= 1 ? 'rgba(167,139,250,0.4)' : 'rgba(167,139,250,0.10)'
201:  const card = { background: 'rgba(25,25,25,0.50)', backdropFilter: 'blur(24px) saturate(1.2)', WebkitBackdropFilter: 'blur(24px) saturate(1.2)', border: '0.5px solid rgba(167,139,250,0.50)', borderRadius: 14, padding: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.3), 0 1px 0 rgba(167,139,250,0.50) inset' }
216:            <button onClick={loadData} style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(25,25,25,0.40)', border: '0.5px solid rgba(167,139,250,0.50)', color: T.textTertiary, fontSize: 12, cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 4 }}><RefreshCw size={10} /> Refresh</button>
222:              onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(167,139,250,0.2)' }}
223:              onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(167,139,250,0.06)' }}>
224:              <Target size={14} style={{ color: 'rgba(167,139,250,0.5)', flexShrink: 0 }} />
226:                <div style={{ fontSize: 17, fontWeight: 300, color: 'rgba(167,139,250,0.7)' }}>{deals.length}</div>
232:              onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(167,139,250,0.06)' }}>
241:              onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(167,139,250,0.06)' }}>
252:                onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(167,139,250,0.06)' }}>
256:                      style={{ padding: '2px 8px', borderRadius: 50, border: raceSeries === s ? '1px solid rgba(0,212,170,0.3)' : '1px solid rgba(167,139,250,0.06)', background: raceSeries === s ? 'rgba(0,212,170,0.08)' : 'transparent', color: raceSeries === s ? 'rgba(0,212,170,0.7)' : 'rgba(167,139,250,0.30)', fontSize: 9, cursor: 'pointer', fontFamily: T.font, fontWeight: 400, transition: 'all 0.15s' }}>{s}</button>
260:                  <Calendar size={14} style={{ color: daysToRace <= 14 ? 'rgba(0,212,170,0.5)' : 'rgba(167,139,250,0.25)', flexShrink: 0 }} />
262:                    <div style={{ fontSize: 17, fontWeight: 300, color: daysToRace <= 14 ? 'rgba(0,212,170,0.6)' : 'rgba(167,139,250,0.45)' }}>{daysToRace}d</div>
289:                    <Target size={12} style={{ color: 'rgba(167,139,250,0.7)' }} />
294:                  <div style={{ padding: '14px 16px', borderRadius: 10, marginBottom: 16, background: 'rgba(167,139,250,0.03)', border: '0.5px dashed rgba(167,139,250,0.20)', fontSize: 12, color: T.textTertiary, fontWeight: 300, lineHeight: 1.5 }}>
308:                        <div style={{ fontSize: 14, fontWeight: 400, color: 'rgba(238,238,238,0.80)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
315:                <div style={{ height: 20, borderBottom: '0.5px solid rgba(167,139,250,0.08)', marginBottom: 16 }} />
330:                <div key={task.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 12px', borderRadius: 10, marginBottom: 4, background: 'rgba(167,139,250,0.03)', border: '0.5px solid rgba(167,139,250,0.50)', cursor: 'pointer', transition: 'all 0.15s' }}
332:                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(238,238,238,0.015)' }}
337:                  <button onClick={(e) => { e.stopPropagation(); toggleTask(task) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 2, color: 'rgba(167,139,250,0.25)' }}>
345:                    <div style={{ fontSize: 14, fontWeight: 400, color: 'rgba(238,238,238,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
353:                  <ChevronRight size={12} style={{ color: 'rgba(167,139,250,0.08)', flexShrink: 0, marginTop: 8 }} />
372:                background: isSelected ? 'rgba(167,139,250,0.03)' : 'rgba(238,238,238,0.015)',
373:                border: `1px solid ${isSelected ? 'rgba(167,139,250,0.2)' : 'rgba(25,25,25,0.35)'}`,
375:                onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.background = 'rgba(25,25,25,0.35)'; e.currentTarget.style.borderColor = 'rgba(167,139,250,0.06)' }}}
376:                onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.background = 'rgba(238,238,238,0.015)'; e.currentTarget.style.borderColor = 'rgba(25,25,25,0.35)' }}}
379:                <span style={{ fontSize: 11, color: i < 3 ? 'rgba(167,139,250,0.6)' : T.textTertiary, fontWeight: 500, width: 16, textAlign: 'center', flexShrink: 0, marginTop: 3 }}>{i + 1}</span>
390:                  <div style={{ fontSize: 14, fontWeight: 400, color: 'rgba(238,238,238,0.75)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.company || 'Unknown'}{d.contact ? ` — ${d.contact}` : ''}</div>
395:                    <span style={{ fontSize: 11, color: 'rgba(167,139,250,0.3)', fontWeight: 300 }}>{action.prob}%</span>
398:                <ChevronRight size={12} style={{ color: 'rgba(167,139,250,0.08)', flexShrink: 0, marginTop: 8 }} />
406:      <div style={{ flex: 1, borderLeft: '1px solid rgba(25,25,25,0.40)', display: 'flex', flexDirection: 'column', background: 'rgba(238,238,238,0.01)', flexShrink: 0, minWidth: 0 }}>
409:          <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(167,139,250,0.6)', letterSpacing: '0.04em' }}>Kiko Intelligence</span>
415:              <Target size={20} style={{ color: 'rgba(167,139,250,0.08)', margin: '0 auto 10px', display: 'block' }} />
423:              <span style={{ fontSize: 13, color: 'rgba(167,139,250,0.6)', fontWeight: 400 }}>Analysing deal...</span>
453:              <div style={{ fontSize: 14, color: 'rgba(238,238,238,0.72)', fontWeight: 300, lineHeight: 1.65 }}>
463:            <button onClick={() => getKikoRec(selectedAction)} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 400, border: '1px solid rgba(167,139,250,0.15)', background: 'rgba(167,139,250,0.04)', color: 'rgba(167,139,250,0.7)', cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 4 }}><RefreshCw size={10} /> Regenerate</button>
464:            <button onClick={() => navigator.clipboard.writeText(kikoRec)} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 400, border: '0.5px solid rgba(167,139,250,0.50)', background: 'transparent', color: T.textTertiary, cursor: 'pointer', fontFamily: T.font }}>Copy</button>
```
- [ ] DONE

## src/pages/PartnershipMatrix.jsx (5 occurrences)
```
6:  bg: '#000000', surface: 'rgba(25,25,25,0.40)', surfaceHover: 'rgba(167,139,250,0.06)',
7:  border: 'rgba(167,139,250,0.08)', borderHover: 'rgba(167,139,250,0.10)',
8:  text: 'rgba(238,232,220,0.95)', textSecondary: 'rgba(167,139,250,0.55)', textTertiary: 'rgba(238,238,238,0.32)',
9:  accent: '#A78BFA', accentSoft: 'rgba(167,139,250,0.08)',
146:          <div onClick={e => e.stopPropagation()} style={{ background: 'rgba(25,25,25,0.50)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', borderRadius: 20, padding: 20, width: 360, border: '0.5px solid rgba(167,139,250,0.50)', boxShadow: 'inset 0 1px 0 rgba(167,139,250,0.08), 0 16px 64px rgba(0,0,0,0.5)' }}>
```
- [ ] DONE

## src/pages/LinkedInQueue.jsx (4 occurrences)
```
124:              padding: '7px 14px', borderRadius: 6, border: '1px solid ' + (filter === id ? 'rgba(167,139,250,0.30)' : 'transparent'),
125:              background: filter === id ? 'rgba(167,139,250,0.10)' : 'transparent',
152:                  {item.status === 'sent' && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(45,212,191,0.10)', color: '#2dd4bf', border: '1px solid rgba(45,212,191,0.25)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>Sent</span>}
170:                    <button onClick={() => markSent(item)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 6, border: '1px solid rgba(45,212,191,0.30)', background: 'rgba(45,212,191,0.08)', color: '#2dd4bf', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: T.font }}>
```
- [ ] DONE

## src/App.jsx (1 occurrences)
```
118:      <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0A0A0C', color: 'rgba(255,255,255,0.3)', fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>Loading...</div>}>
```
- [ ] DONE


## TOTAL: 772 occurrences across files
