import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder'

const realClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
    lock: async (name, acquireTimeout, fn) => fn(),
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
    companies: Array.from({ length: 20 }).map((_, i) => ({ id: 'co' + i, updated_at: '2026-06-10T10:00:00Z', data: { name: ['Alpine Racing','COMSOL','Haas F1 Team','SealSQ','Van Hawke Maison','ONE Championship','Qatar Tourism','Ferrari','McLaren','Aston Martin'][i % 10] + ' ' + (i + 1) } })),
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
