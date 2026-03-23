// Page Context — tells Kiko what page the user is viewing and key data
// Each page calls setPageContext() on mount with relevant info
// KikoChat reads window.kikoPageContext before each API call

export function setPageContext(context) {
  window.kikoPageContext = {
    ...context,
    timestamp: Date.now(),
    path: window.location.pathname,
  }
  window.dispatchEvent(new CustomEvent('kiko_page_context', { detail: window.kikoPageContext }))
}

export function getPageContext() {
  return window.kikoPageContext || { page: 'home', path: '/' }
}
