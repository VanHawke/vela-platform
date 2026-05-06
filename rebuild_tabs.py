path = 'src/pages/OutreachIntelligence.jsx'
lines = open(path).readlines()

# Step 1: Add mainTab state
for i, line in enumerate(lines):
    if "const [taskFilter, setTaskFilter] = useState('overdue')" in line:
        lines.insert(i, "  const [mainTab, setMainTab] = useState('followups')\n")
        print(f"1. Added mainTab state at line {i+1}")
        break

# Re-read after insertion (line numbers shift by 1)
# Find section boundaries again
sections = {}
for i, line in enumerate(lines):
    s = line.strip()
    if '{/* TASK FILTER TABS */}' in s: sections['tasks_start'] = i
    if '{/* STALE DEALS */}' in s: sections['stale_start'] = i
    if '{/* FOLLOW-UP TRACKER */}' in s: sections['followup_start'] = i
    if '{/* CAMPAIGN ACTIVITY */}' in s: sections['campaign_start'] = i
    if '{/* THIS WEEK TASKS */}' in s: sections['thisweek_start'] = i
    if '{/* SIGNALS */}' in s: sections['signals_start'] = i
    if '{/* RIGHT: Detail pane' in s: sections['right_start'] = i
    if '<div className="cc-list">' in s: sections['list_start'] = i

print("Sections:", {k: v+1 for k, v in sections.items()})

# Extract each section's lines
task_lines = lines[sections['tasks_start']:sections['stale_start']]
stale_lines = lines[sections['stale_start']:sections['followup_start']]
followup_lines = lines[sections['followup_start']:sections['campaign_start']]
campaign_lines = lines[sections['campaign_start']:sections['thisweek_start']]
thisweek_lines = lines[sections['thisweek_start']:sections['signals_start']]
signals_lines = lines[sections['signals_start']:sections['right_start']-1]  # -1 to exclude the </div> that closes cc-list

# Build new cc-list content
tab_bar = '''            {/* MAIN TABS */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(0,0,0,0.08)', marginBottom: 8 }}>
              {[
                { id: 'followups', label: 'Follow-ups' },
                { id: 'campaign', label: 'Campaign Activity' },
                { id: 'stale', label: 'Stale Deals' },
                { id: 'intel', label: 'Market Intelligence' },
              ].map(t => (
                <button key={t.id} onClick={() => setMainTab(t.id)} style={{
                  padding: '8px 12px', fontSize: 12, fontWeight: mainTab === t.id ? 600 : 400,
                  color: mainTab === t.id ? '#0A0A0A' : '#6B6B6B',
                  borderBottom: mainTab === t.id ? '2px solid #0A0A0A' : '2px solid transparent',
                  background: 'none', border: 'none', borderBottomStyle: 'solid',
                  cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif',
                }}>{t.label}</button>
              ))}
            </div>

'''

new_content = []
new_content.append(tab_bar)
new_content.append("            {mainTab === 'followups' && (<>\n")
new_content.extend(followup_lines)
new_content.extend(task_lines)
new_content.append("            </>)}\n\n")
new_content.append("            {mainTab === 'campaign' && (<>\n")
new_content.extend(campaign_lines)
new_content.append("            </>)}\n\n")
new_content.append("            {mainTab === 'stale' && (<>\n")
new_content.extend(stale_lines)
new_content.append("            </>)}\n\n")
new_content.append("            {mainTab === 'intel' && (<>\n")
new_content.extend(signals_lines)
new_content.append("            </>)}\n")

# Replace the old cc-list content (from list_start+1 to right_start-1)
# list_start is the <div className="cc-list"> line
# right_start-1 is the </div> that closes cc-list
before = lines[:sections['list_start']+1]
after = lines[sections['right_start']-1:]

result = before + [line if not line.endswith('\n') else line for line in new_content] + after
open(path, 'w').writelines(result)
print(f"\n2. Rebuilt cc-list with 4 tabs")
print(f"   Follow-ups: {len(followup_lines)+len(task_lines)} lines")
print(f"   Campaign: {len(campaign_lines)} lines")
print(f"   Stale: {len(stale_lines)} lines")
print(f"   Intel: {len(signals_lines)} lines")
