// api/_lib/page-permissions.js — Page permission defaults + helpers (backend)

export const ALL_PAGE_KEYS = [
  'home', 'command_centre', 'pipeline', 'contacts', 'organisations',
  'campaigns', 'partnership_matrix', 'race_calendar',
]

export const ROLE_DEFAULTS = {
  super_admin: ALL_PAGE_KEYS,
  admin: ALL_PAGE_KEYS,
  user: ['home', 'command_centre', 'pipeline', 'contacts', 'organisations', 'campaigns', 'partnership_matrix', 'race_calendar'],
}

export function canUserSeePage(role, pageKey, overrides = {}) {
  if (role === 'super_admin') return true
  if (pageKey in overrides) return overrides[pageKey]
  return ROLE_DEFAULTS[role]?.includes(pageKey) ?? false
}

export function computeEffective(role, overrides = {}) {
  const effective = {}
  for (const key of ALL_PAGE_KEYS) {
    effective[key] = canUserSeePage(role, key, overrides)
  }
  return effective
}
