import { useState, useEffect, useCallback } from 'react'

// Which page is showing used to be plain `useState("dashboard")` in App.jsx. That
// meant the app had no URL: every page was the same address, so a refresh threw
// you back to the dashboard, the browser Back button walked out of the app
// entirely, and a link to "the approvals queue" could not be sent to anyone.
//
// This is deliberately a hash route (#/emails) rather than react-router:
//   - no new dependency, and no change to Sidebar/TopBar/Dashboard, which all
//     already take a `setCurrentPage` prop that this hook returns unchanged;
//   - the hash is never sent to the server, so it cannot be broken by a
//     misconfigured static host the way a path route can.
// If real nested routes are ever needed, swapping this for react-router is a
// contained change: only App.jsx and this file know about routing.

export const PAGES = [
  'dashboard',
  'approvals',
  'emails',
  'whatsapp',
  'todos',
  'social',
  'accounting',
  'oracle',
  'logs',
  'vault',
  'admin',
  'tokens',
]

export const DEFAULT_PAGE = 'dashboard'

// An unknown hash resolves to the dashboard rather than rendering nothing, so a
// stale bookmark from a renamed page still lands somewhere usable.
export function pageFromHash() {
  const raw = window.location.hash.replace(/^#\/?/, '').split('?')[0].toLowerCase()
  return PAGES.includes(raw) ? raw : DEFAULT_PAGE
}

export function usePageRoute() {
  const [currentPage, setPage] = useState(pageFromHash)

  useEffect(() => {
    const sync = () => setPage(pageFromHash())
    window.addEventListener('hashchange', sync)

    // Stamp a canonical hash on first load so the address bar always names the
    // page being shown. replaceState, not `location.hash = ...`: this is a
    // normalisation, not a navigation, and pushing it would make the first Back
    // press a no-op.
    if (!window.location.hash) {
      window.history.replaceState(null, '', `#/${DEFAULT_PAGE}`)
    }
    sync()

    return () => window.removeEventListener('hashchange', sync)
  }, [])

  // Drop-in replacement for the setter useState used to return, so every existing
  // `setCurrentPage('emails')` call site keeps working. The hash is the single
  // source of truth: this writes the hash and lets the listener above update
  // state. Setting both would let the two drift apart on a Back press.
  const setCurrentPage = useCallback((page) => {
    const next = PAGES.includes(page) ? page : DEFAULT_PAGE
    if (next === pageFromHash()) return
    window.location.hash = `#/${next}`
  }, [])

  return [currentPage, setCurrentPage]
}
