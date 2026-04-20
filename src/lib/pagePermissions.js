// src/lib/pagePermissions.js — Page permission defaults + helpers (frontend)

export const ALL_PAGES = [
  { key: 'home', label: 'Home', path: '/', alwaysVisible: true },
  { key: 'command_centre', label: 'Command Centre', path: '/command-centre' },
  { key: 'pipeline', label: 'Pipeline', path: '/pipeline' },
  { key: 'contacts', label: 'Contacts', path: '/contacts' },
  { key: 'organisations', label: 'Organisations', path: '/organisations' },
  { key: 'campaigns', label: 'Campaigns', path: '/campaigns' },
  { key: 'partnership_matrix', label: 'Partnership Matrix', path: '/partnership-matrix' },
  { key: 'race_calendar', label: 'Race Calendar', path: '/calendar' },
  { key: 'documents', label: 'Document Library', path: '/documents' },
]

export const ROLE_DEFAULTS = {
  super_admin: ALL_PAGES.map(p => p.key),
  admin: ALL_PAGES.map(p => p.key),
  user: ['home', 'command_centre', 'pipeline', 'contacts', 'organisations', 'campaigns', 'partnership_matrix', 'race_calendar', 'documents'],
}

export function canUserSeePage(role, pageKey, overrides = {}) {
  if (role === 'super_admin') return true // super_admin always sees everything
  if (pageKey in overrides) return overrides[pageKey]
  return ROLE_DEFAULTS[role]?.includes(pageKey) ?? false
}

// Map route paths to page keys for route guarding
export const PATH_TO_PAGE_KEY = {
  '/': 'home',
  '/home': 'home',
  '/dashboard': 'home',
  '/command-centre': 'command_centre',
  '/pipeline': 'pipeline',
  '/contacts': 'contacts',
  '/organisations': 'organisations',
  '/campaigns': 'campaigns',
  '/partnership-matrix': 'partnership_matrix',
  '/calendar': 'race_calendar',
}
