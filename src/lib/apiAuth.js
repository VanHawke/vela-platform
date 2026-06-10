// src/lib/apiAuth.js — Global fetch interceptor (Session 70, Jun 10 2026)
// Attaches the live Supabase access token to EVERY request to the Kiko worker API,
// so all call sites (current and future) are authenticated without per-file edits.
// Installed once at app entry. Fails open to the original fetch on any error.
import { supabase } from './supabase'

const API_HOST = import.meta.env.VITE_KIKO_API_HOST || 'https://api.vanhawke.agency'

function isKikoApi(url) {
  try {
    const u = typeof url === 'string' ? url : (url && url.url) || ''
    return u.startsWith(API_HOST) || u.includes('api.vanhawke.agency')
  } catch {
    return false
  }
}

let installed = false
export function installApiAuth() {
  if (installed || typeof window === 'undefined' || !window.fetch) return
  installed = true
  const orig = window.fetch.bind(window)
  window.fetch = async (input, init = {}) => {
    try {
      const url = typeof input === 'string' ? input : input && input.url
      if (isKikoApi(url)) {
        const { data } = await supabase.auth.getSession()
        const token = data && data.session && data.session.access_token
        if (token) {
          const base = init.headers || (typeof input !== 'string' && input ? input.headers : undefined) || {}
          const headers = new Headers(base)
          if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)
          init = { ...init, headers }
        }
      }
    } catch {
      /* fail-open: worker will 401 if a token was genuinely required */
    }
    return orig(input, init)
  }
}

export default installApiAuth
