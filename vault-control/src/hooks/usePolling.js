import { useEffect, useRef } from 'react'

/**
 * Poll `fn` every `intervalMs`, but ONLY while the tab is actually visible.
 *
 * Why this exists: a background tab left open all day used to keep hitting the
 * API every 10s, and those endpoints query Neon — whose compute only scales to
 * zero after ~5 minutes of total silence. One forgotten tab was enough to burn
 * the monthly compute quota. Hidden tabs now poll zero times, and refetch once
 * on becoming visible so the user never sees stale data.
 *
 * @param {Function} fn          async or sync fetcher
 * @param {number}   intervalMs  poll period while visible
 * @param {boolean}  enabled     set false to pause entirely
 */
export default function usePolling(fn, intervalMs, enabled = true) {
  const savedFn = useRef(fn)
  savedFn.current = fn

  useEffect(() => {
    if (!enabled || !intervalMs) return

    let timer = null
    const isVisible = () =>
      typeof document === 'undefined' || document.visibilityState === 'visible'

    const run = () => { try { savedFn.current?.() } catch { /* caller handles */ } }

    const start = () => {
      if (timer) return
      timer = setInterval(() => { if (isVisible()) run() }, intervalMs)
    }
    const stop = () => { if (timer) { clearInterval(timer); timer = null } }

    const onVisibility = () => {
      if (isVisible()) { run(); start() } else { stop() }
    }

    run()
    if (isVisible()) start()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [intervalMs, enabled])
}
