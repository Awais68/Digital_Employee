import express from 'express'
import { getOracleStats, checkOracleReachable, cleanOracleDisk } from '../oracle-ssh.js'
import { requireAdmin } from '../database/auth.js'

const router = express.Router()

// Auto-clean bookkeeping. A clean run can take ~30s of SSH work, so a second
// request while one is in flight joins the first instead of starting another.
let cleanInFlight = null
let lastClean = null

async function runClean(trigger) {
  if (cleanInFlight) return cleanInFlight
  cleanInFlight = (async () => {
    const started = Date.now()
    try {
      const result = await cleanOracleDisk()
      lastClean = { ...result, trigger, durationMs: Date.now() - started }
      console.log(`[OracleClean] ${trigger}: freed ${result.freedFormatted} (${result.freeAfter} free)`)
      try {
        const { notify } = await import('../services/notificationService.js')
        notify('success', 'Oracle Cloud Cleaned',
          `Freed ${result.freedFormatted} — ${result.freeAfter} now free`, { trigger })
      } catch { /* best effort */ }
      return lastClean
    } catch (err) {
      lastClean = {
        success: false, trigger, error: err.message,
        timestamp: new Date().toISOString(), durationMs: Date.now() - started,
      }
      console.error(`[OracleClean] ${trigger} failed:`, err.message)
      return lastClean
    } finally {
      cleanInFlight = null
    }
  })()
  return cleanInFlight
}

// 24-hour auto-clean. First run is delayed 10 minutes so it never competes with
// server startup, then it repeats daily for as long as the process lives.
const AUTO_CLEAN_MS = 24 * 60 * 60 * 1000
if (process.env.ORACLE_AUTO_CLEAN !== 'false') {
  setTimeout(() => {
    runClean('auto')
    setInterval(() => runClean('auto'), AUTO_CLEAN_MS).unref?.()
  }, 10 * 60 * 1000).unref?.()
  console.log('[OracleClean] 24h auto-clean scheduled')
}

let cache = { data: null, at: 0 }
const CACHE_TTL = 8000

router.get('/stats', async (req, res) => {
  try {
    const now = Date.now()
    if (cache.data && now - cache.at < CACHE_TTL) {
      return res.json(cache.data)
    }

    const stats = await getOracleStats()
    cache = { data: stats, at: now }
    res.json(stats)
  } catch (err) {
    // The remote VM being unreachable is a normal condition for a monitoring
    // dashboard — not a gateway failure. Return 200 with online:false so the
    // frontend renders "offline" cleanly instead of spamming 502s in the console.
    console.error('Oracle SSH error:', err.message)
    res.json({
      online: false,
      host: process.env.ORACLE_SSH_HOST || '140.245.241.95',
      error: err.message,
      timestamp: new Date().toISOString(),
    })
  }
})

router.get('/health', async (req, res) => {
  try {
    const reachable = await checkOracleReachable()
    res.json({ online: reachable, host: process.env.ORACLE_SSH_HOST || '140.245.241.95' })
  } catch {
    res.json({ online: false })
  }
})

// POST manual "Clear Cache & Space" button
router.post('/clean', requireAdmin, async (req, res) => {
  try {
    const result = await runClean('manual')
    res.json(result)
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// GET last clean result — lets the UI show when it last ran without re-running it
router.get('/clean/status', (req, res) => {
  res.json({
    running: !!cleanInFlight,
    autoCleanEnabled: process.env.ORACLE_AUTO_CLEAN !== 'false',
    intervalHours: 24,
    lastClean,
  })
})

export default router
