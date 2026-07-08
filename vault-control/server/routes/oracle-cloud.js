import express from 'express'
import { getOracleStats, checkOracleReachable } from '../oracle-ssh.js'

const router = express.Router()

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

export default router
