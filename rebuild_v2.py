path = 'src/pages/OutreachIntelligence.jsx'
lines = open(path).readlines()

# 1. Add mainTab state
for i, line in enumerate(lines):
    if "const [taskFilter, setTaskFilter] = useState('overdue')" in line:
        lines.insert(i, "  const [mainTab, setMainTab] = useState('followups')\n")
        break

# Re-find markers after insertion
markers = {}
for i, line in enumerate(lines):
    s = line.strip()
    if '{/* MASTER-DETAIL GRID */}' in s: markers['grid'] = i
    if '<div className="cc-grid">' in s and 'grid' in markers: markers['grid_open'] = i
    if '<div className="cc-list">' in s: markers['list_open'] = i
    if '{/* TASK FILTER TABS */}' in s: markers['tasks'] = i
    if '{/* STALE DEALS */}' in s: markers['stale'] = i
    if '{/* FOLLOW-UP TRACKER */}' in s: markers['followup'] = i
    if '{/* CAMPAIGN ACTIVITY */}' in s: markers['campaign'] = i
    if '{/* THIS WEEK TASKS */}' in s: markers['thisweek'] = i
    if '{/* SIGNALS */}' in s: markers['signals'] = i
    if '{/* RIGHT: Detail pane' in s: markers['right'] = i

print("Markers:", {k: v+1 for k, v in markers.items()})

# 2. Insert tab bar ABOVE the cc-grid div
tab_bar = """        {/* SECTION TABS */}
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

"""

# Insert BEFORE the grid comment
grid_line = markers['grid']
lines.insert(grid_line, tab_bar)

# Re-find markers after insertion (shifted by number of inserted lines)
shift = tab_bar.count('\n')
for k in markers:
    if markers[k] >= grid_line:
        markers[k] += shift

# 3. Wrap the entire cc-grid in conditional for followups/campaign/stale tabs
# And add a separate full-width section for intel
# 
# Strategy: 
# - Add {mainTab !== 'intel' && ( before <div className="cc-grid">
# - Add )} after the closing </div> of cc-grid (which is before RIGHT panel's parent closing)
# - Add the intel full-width section after

# Find where cc-grid opens
grid_open = markers['grid_open']
lines[grid_open] = "        {mainTab !== 'intel' && (\n" + lines[grid_open]

# Now I need to hide/show sections based on tab INSIDE cc-list
# Add conditions around each section group

# Find updated positions
markers2 = {}
for i, line in enumerate(lines):
    s = line.strip()
    if '{/* TASK FILTER TABS */}' in s: markers2['tasks'] = i
    if '{/* STALE DEALS */}' in s: markers2['stale'] = i
    if '{/* FOLLOW-UP TRACKER */}' in s: markers2['followup'] = i
    if '{/* CAMPAIGN ACTIVITY */}' in s: markers2['campaign'] = i
    if '{/* THIS WEEK TASKS */}' in s: markers2['thisweek'] = i
    if '{/* SIGNALS */}' in s: markers2['signals'] = i
    if '{/* RIGHT: Detail pane' in s: markers2['right'] = i

# Insert tab conditions as comment markers (Python will add the JSX wrappers)
# Before TASK FILTER: open followups condition
lines.insert(markers2['tasks'], "            {mainTab === 'followups' && (<>\n")
# Shift everything after
for k in markers2:
    if markers2[k] >= markers2['tasks']:
        markers2[k] += 1

# Before STALE DEALS: close followups, open stale
lines.insert(markers2['stale'], "            </>)}\n            {mainTab === 'stale' && (<>\n")
for k in markers2:
    if markers2[k] >= markers2['stale']:
        markers2[k] += 2

# Before FOLLOW-UP: close stale, open followups again (follow-ups go in followups tab)
lines.insert(markers2['followup'], "            </>)}\n            {mainTab === 'followups' && (<>\n")
for k in markers2:
    if markers2[k] >= markers2['followup']:
        markers2[k] += 2

# Before CAMPAIGN: close followups, open campaign
lines.insert(markers2['campaign'], "            </>)}\n            {mainTab === 'campaign' && (<>\n")
for k in markers2:
    if markers2[k] >= markers2['campaign']:
        markers2[k] += 2

# Before THIS WEEK: close campaign (this week goes in followups)
lines.insert(markers2['thisweek'], "            </>)}\n            {mainTab === 'followups' && (<>\n")
for k in markers2:
    if markers2[k] >= markers2['thisweek']:
        markers2[k] += 2

# Before SIGNALS: close followups, hide signals (they go in intel tab which is outside grid)
lines.insert(markers2['signals'], "            </>)}\n            {false && (<>\n")
for k in markers2:
    if markers2[k] >= markers2['signals']:
        markers2[k] += 2

# Before RIGHT panel: close the false condition
# Find the </div> that closes cc-list (it's just before RIGHT)
# Actually, find the line just before RIGHT that has </div>
right_idx = markers2['right']
# Insert closing before RIGHT panel starts
# We need to close: the {false && (<>  and also the cc-grid wrapper
# Find the </div> </div> before RIGHT (cc-list close, then cc-grid close)
# The structure is: ...signals...</div>(cc-list)</div>(cc-grid) <!-- RIGHT -->
# We need to add </>)} to close the false condition before cc-list closes

# Look backwards from RIGHT to find where to insert
for i in range(right_idx - 1, right_idx - 5, -1):
    if '</div>' in lines[i].strip():
        lines.insert(i, "            </>)}\n")
        break

# Now close the cc-grid conditional wrapper
# Find the closing </aside> and the </div> after it that closes cc-grid
# After the RIGHT panel's </aside>, there should be </div> closing cc-grid
# Then we need to add )} to close the conditional

# Find end of file structure
for i, line in enumerate(lines):
    if '{/* RIGHT: Detail pane' in line:
        right_start = i
        break

# Find the closing of the grid (</div> after </aside>)
# Scan from end of file backwards
for i in range(len(lines) - 1, right_start, -1):
    if lines[i].strip() == '</div>' and i > right_start + 10:
        # Check if next meaningful line closes cc-body or similar
        # Insert )} after this </div> to close the mainTab !== 'intel' conditional
        lines.insert(i + 1, "        )}\n\n        {/* MARKET INTELLIGENCE - full width */}\n        {mainTab === 'intel' && (\n          <div style={{ marginTop: 0 }}>\n            <div className=\"cc-group\">\n              <div className=\"cc-group-h\"><h3>Market signals</h3><span className=\"cc-group-count\">{signals.length}</span></div>\n              {signals.length === 0 ? (<div className=\"cc-empty-row\">No active signals</div>) : signals.slice(0, 12).map(s => (<div key={s.id} className=\"cc-row\" onClick={() => selectSignal(s)} style={{ cursor: 'pointer' }}><div className=\"cc-row-icon purple\"><span style={{ fontSize: 10 }}>⚡</span></div><div className=\"cc-row-body\"><div className=\"cc-row-title\">{cleanTitle(s.title)}</div><div className=\"cc-row-meta\">{s.entity_name && <>{s.entity_name} · </>}{relativeTime(s.created_at)}</div></div></div>))}\n            </div>\n          </div>\n        )}\n")
        break

open(path, 'w').writelines(lines)
print("Done - tabs above grid, sections wrapped")
