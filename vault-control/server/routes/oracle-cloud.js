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
    console.error('Oracle SSH error:', err.message)
    res.status(502).json({
      online: false,
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
