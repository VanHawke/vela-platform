path = 'src/pages/OutreachIntelligence.jsx'
c = open(path).read()

# 1. Add state
c = c.replace(
    "const [taskFilter, setTaskFilter] = useState('overdue')",
    "const [mainTab, setMainTab] = useState('followups')\n  const [taskFilter, setTaskFilter] = useState('overdue')"
)

# 2. Add tabs ABOVE grid, wrap grid in condition
c = c.replace(
    '        {/* MASTER-DETAIL GRID */}\n        <div className="cc-grid">',
    '''        {/* SECTION TABS */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(0,0,0,0.08)', marginBottom: 16, marginTop: 8 }}>
          {[
            { id: 'followups', label: 'Follow-ups' },
            { id: 'campaign', label: 'Campaign Activity' },
            { id: 'stale', label: 'Stale Deals' },
            { id: 'intel', label: 'Market Intelligence' },
          ].map(t => (
            <button key={t.id} onClick={() => { setMainTab(t.id); setSelected(null) }} style={{
              padding: '10px 18px', fontSize: 13, fontWeight: mainTab === t.id ? 600 : 400,
              color: mainTab === t.id ? '#0A0A0A' : '#6B6B6B',
              borderBottom: mainTab === t.id ? '2px solid #0A0A0A' : '2px solid transparent',
              background: 'none', border: 'none', borderBottomStyle: 'solid',
              cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif',
            }}>{t.label}</button>
          ))}
        </div>

        {/* MASTER-DETAIL GRID — hidden when intel tab active */}
        {mainTab !== 'intel' && (
        <div className="cc-grid">'''
)

# 3. Inside cc-list: wrap TASKS+FOLLOW-UPS in followups tab
c = c.replace(
    '            {/* TASK FILTER TABS */}',
    '            {mainTab === \'followups\' && (<>\n            {/* TASK FILTER TABS */}'
)

c = c.replace(
    '            {/* STALE DEALS */}',
    '            </>)}\n            {mainTab === \'stale\' && (<>\n            {/* STALE DEALS */}'
)

c = c.replace(
    '            {/* FOLLOW-UP TRACKER */}',
    '            </>)}\n            {mainTab === \'followups\' && (<>\n            {/* FOLLOW-UP TRACKER */}'
)

c = c.replace(
    '            {/* CAMPAIGN ACTIVITY */}',
    '            </>)}\n            {mainTab === \'campaign\' && (<>\n            {/* CAMPAIGN ACTIVITY */}'
)

c = c.replace(
    '            {/* THIS WEEK TASKS */}',
    '            </>)}\n            {mainTab === \'followups\' && (<>\n            {/* THIS WEEK TASKS */}'
)

# 4. Hide signals section (shown separately outside grid for intel tab)
c = c.replace(
    '            {/* SIGNALS */}',
    '            </>)}\n            {mainTab === \'__hidden__\' && (<>\n            {/* SIGNALS */}'
)

# 5. Close the hidden signals wrapper before cc-list closes
# Find the pattern: end of signals section -> </div>(cc-list) -> </div>(cc-grid) -> RIGHT panel
# The signals section ends with: </div>\n          </div>\n\n          {/* RIGHT:
c = c.replace(
    '''              ))}
            </div>
          </div>

          {/* RIGHT: Detail pane with Kiko brief */}''',
    '''              ))}
            </div>
            </>)}
          </div>

          {/* RIGHT: Detail pane with Kiko brief */}'''
)

# 6. Close the cc-grid conditional wrapper after the entire grid
# Find the final closing: </aside>\n        </div>\n      </div>\n    </div>
c = c.replace(
    '''          </aside>
        </div>
      </div>
    </div>''',
    '''          </aside>
        </div>
        )}

        {/* MARKET INTELLIGENCE — full width, no split panel */}
        {mainTab === 'intel' && (
          <div className="cc-list" style={{ maxWidth: '100%', width: '100%' }}>
            <div className="cc-group">
              <div className="cc-group-h">
                <h3><Zap size={10} />Market Intelligence</h3>
                <span className="cc-group-count">{signals.length}</span>
              </div>
              {signals.length === 0 ? (
                <div className="cc-empty-row">No active signals</div>
              ) : signals.slice(0, 12).map(s => (
                <div key={s.id} className="cc-row" onClick={() => selectSignal(s)} style={{ cursor: 'pointer' }}>
                  <div className="cc-row-icon purple"><Zap size={10} /></div>
                  <div className="cc-row-body">
                    <div className="cc-row-title">{cleanTitle(s.title)}</div>
                    <div className="cc-row-meta">
                      {s.entity_name && <>{s.entity_name} · </>}
                      {relativeTime(s.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>'''
)

open(path, 'w').write(c)
print("Done")
