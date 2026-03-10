import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const MODULE_KEYS = [
  { key: 'email', label: 'Email' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'crm', label: 'CRM (Dashboard, Pipeline, Deals, Contacts, Companies)' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'documents', label: 'Documents' },
  { key: 'playbook', label: 'Playbook' },
  { key: 'sponsorsignal', label: 'SponsorSignal' },
  { key: 'leaderboard', label: 'Leaderboard' },
  { key: 'outreach', label: 'Outreach' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'vela_code', label: 'Vela Code' },
]

const DEFAULT_MODULES = Object.fromEntries(MODULE_KEYS.map(m => [m.key, true]))

export default function Admin() {
  const [orgs, setOrgs] = useState([])
  const [selected, setSelected] = useState(null)
  const [editModules, setEditModules] = useState({})
  const [editBranding, setEditBranding] = useState({})
  const [newOrg, setNewOrg] = useState({ name: '', slug: '', plan: 'pro' })
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [msg, setMsg] = useState('')

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token
  }

  async function fetchOrgs() {
    const token = await getToken()
    const res = await fetch('/api/admin/orgs', { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    setOrgs(Array.isArray(data) ? data : [])
  }

  useEffect(() => { fetchOrgs() }, [])

  function selectOrg(org) {
    setSelected(org)
    setEditModules({ ...DEFAULT_MODULES, ...org.modules })
    setEditBranding({ ...org.branding })
    setMsg('')
  }

  async function saveOrg() {
    if (!selected) return
    setSaving(true)
    const token = await getToken()
    const res = await fetch('/api/admin/orgs', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selected.id, modules: editModules, branding: editBranding })
    })
    const data = await res.json()
    if (data.id) { setMsg('Saved'); await fetchOrgs(); setSelected(data) }
    else setMsg('Error: ' + (data.error || 'Unknown'))
    setSaving(false)
  }

  async function createOrg() {
    if (!newOrg.name || !newOrg.slug) return
    setCreating(true)
    const token = await getToken()
    const res = await fetch('/api/admin/orgs', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newOrg, modules: DEFAULT_MODULES })
    })
    const data = await res.json()
    if (data.id) { setNewOrg({ name: '', slug: '', plan: 'pro' }); await fetchOrgs(); setMsg('Organisation created') }
    else setMsg('Error: ' + (data.error || 'Unknown'))
    setCreating(false)
  }

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden">
      <div className="w-72 border-r border-white/10 flex flex-col">
        <div className="px-4 py-4 border-b border-white/10">
          <h1 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Super Admin</h1>
          <p className="text-xs text-white/30 mt-1">Organisation Management</p>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {orgs.map(org => (
            <button key={org.id} onClick={() => selectOrg(org)}
              className={`w-full text-left px-4 py-3 hover:bg-white/5 transition-colors ${selected?.id === org.id ? 'bg-white/10' : ''}`}>
              <div className="text-sm font-medium">{org.name}</div>
              <div className="text-xs text-white/40 mt-0.5">{org.slug} · {org.plan}</div>
              <div className={`inline-block mt-1 text-xs px-1.5 py-0.5 rounded ${org.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                {org.is_active ? 'Active' : 'Inactive'}
              </div>
            </button>
          ))}
        </div>
        <div className="border-t border-white/10 p-4 space-y-2">
          <p className="text-xs text-white/40 uppercase tracking-wider font-semibold">New Organisation</p>
          <input className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm placeholder:text-white/30"
            placeholder="Name" value={newOrg.name} onChange={e => setNewOrg(p => ({ ...p, name: e.target.value }))} />
          <input className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm placeholder:text-white/30"
            placeholder="slug (e.g. clientco)" value={newOrg.slug}
            onChange={e => setNewOrg(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') }))} />
          <select className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm"
            value={newOrg.plan} onChange={e => setNewOrg(p => ({ ...p, plan: e.target.value }))}>
            <option value="free">Free</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
          <button onClick={createOrg} disabled={creating || !newOrg.name || !newOrg.slug}
            className="w-full bg-white text-black text-sm font-medium py-1.5 rounded hover:bg-white/90 disabled:opacity-40 transition-colors">
            {creating ? 'Creating...' : 'Create Organisation'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-white/30 text-sm">Select an organisation to manage</div>
        ) : (
          <div className="p-8 max-w-2xl space-y-8">
            <div>
              <h2 className="text-xl font-semibold">{selected.name}</h2>
              <p className="text-sm text-white/40 mt-1">{selected.id}</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">Modules</h3>
              <div className="space-y-3">
                {MODULE_KEYS.map(({ key, label }) => (
                  <label key={key} className="flex items-center justify-between gap-4 cursor-pointer group">
                    <span className="text-sm group-hover:text-white transition-colors">{label}</span>
                    <div onClick={() => setEditModules(p => ({ ...p, [key]: !p[key] }))}
                      className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${editModules[key] ? 'bg-white' : 'bg-white/20'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-transform ${editModules[key] ? 'translate-x-5 bg-black' : 'translate-x-0.5 bg-white/60'}`} />
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">Branding</h3>
              <div className="space-y-3">
                {[
                  { key: 'platform_name', label: 'Platform Name', placeholder: 'Vela' },
                  { key: 'logo_url', label: 'Logo URL', placeholder: 'https://...' },
                  { key: 'favicon_url', label: 'Favicon URL', placeholder: 'https://...' },
                  { key: 'primary_colour', label: 'Primary Colour', placeholder: '#ffffff' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label className="text-xs text-white/40 block mb-1">{label}</label>
                    <input className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm placeholder:text-white/20"
                      placeholder={placeholder} value={editBranding[key] || ''}
                      onChange={e => setEditBranding(p => ({ ...p, [key]: e.target.value }))} />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={saveOrg} disabled={saving}
                className="bg-white text-black text-sm font-medium px-6 py-2 rounded hover:bg-white/90 disabled:opacity-40 transition-colors">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              {msg && <span className={`text-sm ${msg.includes('Error') ? 'text-red-400' : 'text-green-400'}`}>{msg}</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
