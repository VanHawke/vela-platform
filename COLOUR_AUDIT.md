# COLOUR_AUDIT.md — Warm Charcoal Cascade v2
# Generated Sun 12 Apr 2026 11:32:41 BST

## PATTERN GROUP 1: rgba(245,245,248,...) local C constants
src/components/layout/Layout.jsx:12:  text: 'rgba(245,245,248,0.92)',
src/components/layout/Layout.jsx:13:  textSec: 'rgba(245,245,248,0.55)',
src/components/layout/Layout.jsx:14:  textTer: 'rgba(245,245,248,0.32)',
src/components/layout/Layout.jsx:15:  textMut: 'rgba(245,245,248,0.16)',
src/components/kiko/KikoFloat.jsx:12:  text: 'rgba(245,245,248,0.92)',
src/components/kiko/KikoFloat.jsx:13:  textSec: 'rgba(245,245,248,0.55)',
src/components/kiko/KikoFloat.jsx:14:  textTer: 'rgba(245,245,248,0.32)',
src/components/kiko/KikoFloat.jsx:15:  textMut: 'rgba(245,245,248,0.16)',
src/components/kiko/KikoChat.jsx:12:  text: 'rgba(245,245,248,0.92)',
src/components/kiko/KikoChat.jsx:13:  textSec: 'rgba(245,245,248,0.55)',
src/components/kiko/KikoChat.jsx:14:  textTer: 'rgba(245,245,248,0.32)',
src/components/kiko/KikoChat.jsx:15:  textMut: 'rgba(245,245,248,0.16)',
src/pages/SequenceDetail.jsx:13:  text: 'rgba(245,245,248,0.92)',
src/pages/SequenceDetail.jsx:14:  textSec: 'rgba(245,245,248,0.55)',
src/pages/SequenceDetail.jsx:15:  textTer: 'rgba(245,245,248,0.32)',
src/pages/SequenceDetail.jsx:16:  textMut: 'rgba(245,245,248,0.16)',

## PATTERN GROUP 2: rgba(238,232,220,...) warm white text
src/pages/Pipeline.jsx:276:                fontSize: 14, fontWeight: 500, color: newName.trim() ? 'rgba(238,232,220,0.90)' : 'var(--text-tertiary)',
src/pages/Pipeline.jsx:555:                          <p style={{ fontSize: 13, fontWeight: 400, color: 'rgba(238,232,220,0.82)', margin: 0, fontFamily: 'var(--font)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
src/pages/Pipeline.jsx:602:                      <h2 style={{ fontSize: 17, fontWeight: 400, color: 'rgba(238,232,220,0.90)', margin: 0, fontFamily: 'var(--font)' }}>{selectedDeal.company || selectedDeal.title}</h2>
src/pages/Pipeline.jsx:639:                          <p style={{ fontSize: 13, fontWeight: 400, color: 'rgba(238,232,220,0.80)', margin: 0, fontFamily: 'var(--font)' }}>{[ct.firstName, ct.lastName].filter(Boolean).join(' ')}{i === 0 ? ' (Primary)' : ''}</p>
src/pages/Pipeline.jsx:653:                        <p style={{ fontSize: 14, fontWeight: 400, color: 'rgba(238,232,220,0.80)', margin: 0, fontFamily: 'var(--font)' }}>{camp.name}</p>
src/pages/Pipeline.jsx:677:                          <p style={{ fontSize: 13, fontWeight: 400, color: 'rgba(238,232,220,0.70)', margin: '3px 0 0', fontFamily: 'var(--font)' }}>{d.notes || d.contact || 'View in Command Centre →'}</p>
src/pages/Pipeline.jsx:697:                      style={{ flex: 1, background: 'rgba(25,25,25,0.30)', border: '0.5px solid rgba(124,92,252,0.50)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'rgba(238,232,220,0.70)', fontFamily: 'var(--font)', outline: 'none' }} />
src/pages/Contacts.jsx:111:            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts..." style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 14, color: 'rgba(238,232,220,0.70)', fontFamily: 'var(--font)', height: 38, fontWeight: 300 }} />
src/pages/Contacts.jsx:157:                    <div style={{ width: 180, fontSize: 14, fontWeight: 400, color: 'rgba(238,232,220,0.82)', fontFamily: 'var(--font)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName(contact)}</div>
src/pages/Contacts.jsx:185:              <h2 style={{ fontSize: 17, fontWeight: 200, color: 'rgba(238,232,220,0.90)', margin: 0, fontFamily: 'var(--font)' }}>{editing ? 'Edit Contact' : 'Add Contact'}</h2>
src/pages/Contacts.jsx:200:              <button onClick={save} style={{ flex: 1, padding: '10px 0', fontSize: 14, color: 'rgba(238,232,220,0.90)', background: 'var(--accent)', border: 'none', borderRadius: 50, cursor: 'pointer', fontWeight: 500, fontFamily: 'var(--font)' }}>Save</button>
src/pages/CommercialCalendar.jsx:9:  text: 'rgba(238,232,220,0.95)', textSecondary: 'rgba(124,92,252,0.55)', textTertiary: '#7e7e88',
src/pages/CommercialCalendar.jsx:225:                  <span style={{ fontSize: 9, color: 'rgba(238,232,220,0.90)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontFamily: T.font }}>
src/pages/CommercialCalendar.jsx:238:                  <span style={{ fontSize: 9, color: 'rgba(238,232,220,0.90)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontFamily: T.font }}>
src/pages/CommercialCalendar.jsx:249:                <span style={{ fontSize: 9, color: 'rgba(238,232,220,0.90)', fontFamily: T.font }}>🏍️ {e.city.slice(0, 3).toUpperCase()}</span>
src/pages/CommercialCalendar.jsx:257:                <span style={{ fontSize: 9, color: 'rgba(238,232,220,0.90)', fontFamily: T.font }}>🏁 {e.city.slice(0, 3).toUpperCase()}</span>
src/pages/Organisations.jsx:336:        <button onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, background: 'var(--accent)', color: 'rgba(238,232,220,0.90)', padding: '6px 14px', borderRadius: 50, border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}>
src/pages/Organisations.jsx:385:                color: isActive ? 'rgba(238,232,220,0.90)' : 'var(--text-secondary)',
src/pages/Organisations.jsx:417:                          background: sel ? 'rgba(124,92,252,0.12)' : 'rgba(25,25,25,0.40)', color: sel ? 'rgba(238,232,220,0.90)' : 'var(--text-secondary)',
src/pages/Organisations.jsx:436:                          background: sel ? 'rgba(124,92,252,0.12)' : 'rgba(25,25,25,0.40)', color: sel ? 'rgba(238,232,220,0.90)' : 'var(--text-secondary)',
src/pages/Organisations.jsx:467:                          background: sel ? 'rgba(124,92,252,0.12)' : 'rgba(25,25,25,0.40)', color: sel ? 'rgba(238,232,220,0.90)' : 'var(--text-secondary)',
src/pages/Organisations.jsx:497:                <button onClick={() => setOpenPopover(null)} style={{ fontSize: 13, fontWeight: 500, padding: '6px 16px', borderRadius: 50, background: 'rgba(124,92,252,0.12)', color: 'rgba(238,232,220,0.90)', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}>
src/pages/Organisations.jsx:571:                  <div style={{ width: 200, fontSize: 14, fontWeight: 400, color: 'rgba(238,232,220,0.82)', fontFamily: 'var(--font)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{company.name}</div>
src/pages/Organisations.jsx:896:              <button onClick={save} style={{ flex: 1, padding: '10px 0', fontSize: 14, color: 'rgba(238,232,220,0.90)', background: 'var(--accent)', border: 'none', borderRadius: 50, cursor: 'pointer', fontWeight: 500, fontFamily: 'var(--font)' }}>Save</button>
src/pages/OutreachIntelligence.jsx:16:    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:rgba(238,232,220,0.85);font-weight:500">$1</strong>')
src/pages/OutreachIntelligence.jsx:434:                <div style={{ fontSize: 14, color: 'rgba(238,232,220,0.70)', fontWeight: 400 }}>
src/pages/PartnershipMatrix.jsx:8:  text: 'rgba(238,232,220,0.95)', textSecondary: 'rgba(124,92,252,0.55)', textTertiary: '#7e7e88',
src/pages/PartnershipMatrix.jsx:34:    <div style={{ width: size, height: size, borderRadius: size * 0.3, background: team.color || 'rgba(238,232,220,0.70)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
src/pages/PartnershipMatrix.jsx:39:        <span style={{ fontSize: Math.max(size * 0.35, 8), fontWeight: 500, color: 'rgba(238,232,220,0.90)', letterSpacing: '-0.02em' }}>
src/pages/PartnershipMatrix.jsx:137:              background: tab === t.id ? T.accent : 'transparent', color: tab === t.id ? 'rgba(238,232,220,0.90)' : T.textSecondary,
src/pages/PartnershipMatrix.jsx:161:                <button onClick={addPartnership} style={{ flex: 1, fontSize: 13, padding: '6px 0', borderRadius: 6, border: 'none', background: T.accent, color: 'rgba(238,232,220,0.90)', cursor: 'pointer', fontFamily: T.font, fontWeight: 500 }}>Add</button>
src/pages/PartnershipMatrix.jsx:300:                          <span key={c.id} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, background: 'rgba(238,232,220,0.70)', color: '#991B1B', border: '1px solid rgba(226,75,74,0.2)', fontWeight: 500 }}>{c.name}</span>

## PATTERN GROUP 3: Original patterns (should be 0 from v0.0.44)

## TOTALS
- Pattern 1 (rgba 245,245,248): 16
- Pattern 2 (rgba 238,232,220): 32
- Pattern 3 (original leftovers): 0

