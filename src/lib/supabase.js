import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder'

// In-tab async lock for Supabase auth operations.
//
// supabase-js serialises all session access (getSession, token refresh, and the
// one-time URL-session detection that runs on a fresh login redirect) through this
// lock. Every data query goes from(...) -> _getAccessToken() -> getSession(), and
// getSession waits on this lock. It was previously a no-op (fn() with no waiting),
// which let the first queries on a cold login read the session BEFORE the redirect
// had finished committing it. Those queries went out unauthenticated, RLS returned
// nothing, and sections rendered blank until a manual refresh. This restores real
// serialisation so getSession waits for the session to be ready before any query
// reads it.
//
// Faithful in-memory copy of @supabase/auth-js processLock, inlined to avoid
// importing a transitive package path. It deliberately does NOT use the Navigator
// LockManager (which can stall under React Strict Mode double-mount, the likely
// reason the lock was disabled in the first place), so it serialises within this
// tab only — exactly what is needed here and free of that hazard.
const PROCESS_LOCKS = {}
async function processLock(name, acquireTimeout, fn) {
  const previous = PROCESS_LOCKS[name] ?? Promise.resolve()
  const previousHandled = (async () => { try { await previous } catch { /* ignore prior op error */ } })()
  const current = (async () => {
    let timeoutId = null
    try {
      const timeoutPromise = acquireTimeout >= 0
        ? new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
              const err = new Error(`Acquiring process lock "${name}" timed out`)
              err.isAcquireTimeout = true
              reject(err)
            }, acquireTimeout)
          })
        : null
      await Promise.race([previousHandled, timeoutPromise].filter(Boolean))
      if (timeoutId !== null) clearTimeout(timeoutId)
    } catch (e) {
      if (timeoutId !== null) clearTimeout(timeoutId)
      if (e && e.isAcquireTimeout) throw e
      // otherwise the previous op rejected — fall through and run fn()
    }
    return await fn()
  })()
  PROCESS_LOCKS[name] = (async () => {
    try { return await current } catch (e) {
      if (e && e.isAcquireTimeout) { try { await previous } catch { /* ignore */ } return null }
      throw e
    }
  })()
  return await current
}

const realClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
    lock: processLock,
  },
})

// DEV-ONLY mobile preview client. Gated on import.meta.env.DEV (false in production
// builds) AND ?preview=1. The whole thing lives inside makePreviewClient(), which is
// never called in production, so the minifier dead-code-eliminates it from the bundle.
const PREVIEW = import.meta.env.DEV && typeof window !== 'undefined' && !!window.location && window.location.search.indexOf('preview=1') !== -1

function makePreviewClient() {
  const D = {
    deals: Array.from({ length: 14 }).map((_, i) => ({ id: 'd' + i, updated_at: '2026-06-1' + (i % 9) + 'T10:00:00Z', data: { title: ['SealSQ Alpine F1 Title Partnership','COMSOL Formula E Activation','Maison Pre-Seed Raise','MotoGP Sponsorship AI Sector','Haas F1 Maison Eyewear','ONE Championship Activation','Qatar Motorsport Corridor Package','WEC Hospitality Programme'][i % 8] + ' ' + (i + 1), company: ['SealSQ','COMSOL','Van Hawke Maison','Confidential','Haas F1 Team','ONE','Qatar Tourism','Alpine'][i % 8], contactName: ['Carlos M.','Anna V.','Giacomo R.','Lead TBC','Ayao K.','Sundar R.','Fatima A.','Harry B.'][i % 8], value: [1500000, 2500000, 500000, 3000000, 800000, 1200000, 900000, 1750000][i % 8], currency: ['EUR','EUR','USD','EUR','USD','USD','USD','EUR'][i % 8], stage: ['Discovery','Qualified','Proposal','Negotiation'][i % 4] } })),
    contacts: Array.from({ length: 30 }).map((_, i) => ({ id: 'c' + i, updated_at: '2026-06-10T10:00:00Z', data: { firstName: ['Carlos','Anna','Giacomo','Ayao','Harry','Fatima','James','Maria','Chen','Sofia'][i % 10], lastName: ['Moreno','Vogel','Riva','Komatsu','Bell','Hassan','Park','Garcia','Wei','Rossi'][i % 10], title: ['Chief Commercial Officer','Head of Partnerships','Lead Product Designer','Team Principal','Finance Director'][i % 5], company: ['SealSQ','COMSOL','Van Hawke Maison','Haas F1 Team','Alpine Racing'][i % 5], email: 'contact' + i + '@example.com' } })),
    companies: Array.from({ length: 20 }).map((_, i) => ({ id: 'co' + i, updated_at: '2026-06-10T10:00:00Z', data: { name: ['Alpine Racing','COMSOL','Haas F1 Team','SealSQ','Van Hawke Maison','ONE Championship','Qatar Tourism','Ferrari','McLaren','Aston Martin'][i % 10] + ' ' + (i + 1), industry: ['Motorsport','Engineering Software','Motorsport','Cybersecurity','Luxury Eyewear','Combat Sports','Tourism Authority','Motorsport','Motorsport','Motorsport'][i % 10], employees: [520, 1400, 600, 240, 18, 300, 900, 4000, 3500, 1800][i % 10], openDeals: i % 3 === 0 ? 1 : 0 } })),
    kiko_team_channels: [
      { id: 'ch1', name: 'Deal Team \u2014 SealSQ', channel_type: 'group', members: ['u1','u2','u3'], last_message_at: new Date(Date.now() - 4 * 60000).toISOString(), created_at: '2026-06-01T10:00:00Z' },
      { id: 'ch2', name: 'Prem Sidhu', channel_type: 'dm', members: ['u1','u4'], last_message_at: new Date(Date.now() - 52 * 60000).toISOString(), created_at: '2026-06-01T10:00:00Z' },
      { id: 'ch3', name: 'Matt Smith', channel_type: 'dm', members: ['u1','u5'], last_message_at: new Date(Date.now() - 3 * 3600000).toISOString(), created_at: '2026-06-01T10:00:00Z' },
      { id: 'ch4', name: 'COMSOL / Formula E', channel_type: 'group', members: ['u1','u6'], last_message_at: new Date(Date.now() - 26 * 3600000).toISOString(), created_at: '2026-06-01T10:00:00Z' },
    ],
    kiko_team_messages: [
      { id: 'm1', channel_id: 'ch1', from_name: 'Carlos Moreno', content: 'Confirmed the Thursday call with Alpine leadership.', created_at: new Date(Date.now() - 4 * 60000).toISOString(), read_by: [] },
      { id: 'm2', channel_id: 'ch2', from_name: 'Prem Sidhu', content: 'MCQ registration link just came through, forwarding now.', created_at: new Date(Date.now() - 52 * 60000).toISOString(), read_by: ['preview-user'] },
      { id: 'm3', channel_id: 'ch3', from_name: 'Matt Smith', content: 'COMSOL commission, can we align before Friday?', created_at: new Date(Date.now() - 3 * 3600000).toISOString(), read_by: [] },
      { id: 'm4', channel_id: 'ch4', from_name: 'Anna Vogel', content: 'Sent over the revised activation deck.', created_at: new Date(Date.now() - 26 * 3600000).toISOString(), read_by: ['preview-user'] },
    ],
    kiko_sequences: Array.from({ length: 8 }).map((_, i) => ({ id: 's' + i, created_at: '2026-06-1' + (i % 9) + 'T10:00:00Z', name: ['Semiconductors Hardware Haas','AI Sector Qatar Corridor','Formula E Energy Partners','MotoGP Premium Brands','Luxury Eyewear Retail','WEC Hospitality Outreach'][i % 6] + ' ' + (i + 1), is_active: i % 3 !== 0, archived: false })),
  }
  const chain = (data) => {
    const proxy = new Proxy(function () {}, {
      get(_t, prop) {
        if (prop === 'then') return (resolve, reject) => Promise.resolve({ data, error: null }).then(resolve, reject)
        if (prop === 'catch') return () => proxy
        if (prop === 'finally') return (cb) => { try { cb && cb() } catch (e) {} ; return proxy }
        return () => proxy
      },
      apply() { return proxy },
    })
    return proxy
  }
  const user = { id: 'preview-user', email: 'preview@vanhawke.agency', app_metadata: { role: 'super_admin' }, user_metadata: { full_name: 'Sunny (Preview)' } }
  const session = { user, access_token: 'preview', refresh_token: 'preview', expires_at: 9999999999 }
  return {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async () => ({ data: { user }, error: null }),
      onAuthStateChange: (cb) => { Promise.resolve().then(() => { try { cb('INITIAL_SESSION', session) } catch (e) {} }); return { data: { subscription: { unsubscribe() {} } } } },
      signOut: async () => ({ error: null }),
      signInWithOAuth: async () => ({ data: {}, error: null }),
      signInWithPassword: async () => ({ data: { session }, error: null }),
    },
    from: (table) => chain(D[table] || []),
    rpc: () => chain([]),
    channel: () => ({ on() { return this }, subscribe() { return this }, unsubscribe() {} }),
    removeChannel: () => {},
    removeAllChannels: () => {},
  }
}

export const supabase = PREVIEW ? makePreviewClient() : realClient
