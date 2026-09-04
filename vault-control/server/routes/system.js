import express from 'express'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  getServiceStatus,
  getSystemHealth,
  getSystemMetrics,
  getVaultCounts,
  getRecentActivity,
  getPendingApprovals,
  refreshAndBroadcast,
  getVmInfo,
  getWorkerStatus,
} from '../system-status.js'
import { readVaultFiles, searchVaultFiles } from '../vault-reader.js'
import fs from 'fs'
import { requireAdmin } from '../database/auth.js'

// Repo root anchored to this file. The old `path.resolve(process.cwd(), '..')`
// pointed one level ABOVE the repo whenever the server ran from the repo root
// (which is what PM2 does), so the dashboard's Start/Stop Workers buttons ran
// in a directory that has no workers.py and always failed.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

const execAsync = promisify(exec)

const router = express.Router()

// GET system health
router.get('/health', async (req, res) => {
  try {
    const health = await getSystemHealth()
    res.json(health)
  } catch (err) {
    res.status(500).json({ error: 'Failed to get system health', message: err.message })
  }
})

// GET services status
router.get('/services', async (req, res) => {
  try {
    const services = await getServiceStatus()
    res.json(services)
  } catch (err) {
    res.status(500).json({ error: 'Failed to get services status', message: err.message })
  }
})

// GET system metrics
router.get('/metrics', async (req, res) => {
  const metrics = await getSystemMetrics()
  res.json(metrics)
})

// GET VM info — Oracle Cloud VM identity + live RAM/CPU/disk metrics
router.get('/vm-info', async (req, res) => {
  try {
    const info = await getVmInfo()
    res.json(info)
  } catch (err) {
    res.status(500).json({ error: 'Failed to get VM info', message: err.message })
  }
})

// GET vault counts
router.get('/vault-counts', (req, res) => {
  const counts = getVaultCounts(true)
  res.json(counts)
})

// GET recent activity
router.get('/recent-activity', (req, res) => {
  const limit = parseInt(req.query.limit) || 10
  const activity = getRecentActivity(limit)
  res.json(activity)
})

// GET pending approvals
router.get('/pending-approvals', (req, res) => {
  const approvals = getPendingApprovals()
  res.json(approvals)
})

// GET dashboard stats - comprehensive endpoint (cached 5s)
router.get('/stats', async (req, res) => {
  try {
    const mod = await import('../services/cache.js')
    const cached = mod.cacheGet('system_stats')
    if (cached) return res.json(cached)

    // Single source of truth. This route used to pgrep for `<name>.py` itself,
    // which disagreed with the WebSocket dashboard_update (built from
    // getWorkerStatus) on every field: the orchestrator has no long-lived process
    // and whatsapp_watcher.py does not exist at all — WhatsApp is embedded in this
    // server. Two implementations meant the panel flipped state depending on which
    // update arrived last.
    const workerStatus = await getWorkerStatus()

    const stats = {
      vaultCounts: getVaultCounts(true),
      recentActivity: getRecentActivity(10),
      pendingApprovals: getPendingApprovals(),
      services: await getServiceStatus(),
      workers: workerStatus,
      timestamp: new Date(),
    }
    mod.cacheSet('system_stats', stats, 5)
    res.json(stats)
  } catch (err) {
    res.status(500).json({ error: 'Failed to get dashboard stats', message: err.message })
  }
})

// POST refresh - trigger manual refresh and broadcast
router.post('/refresh', requireAdmin, async (req, res) => {
  try {
    const mod = await import('../services/cache.js')
    mod.cacheDel('system_stats')
    const data = await refreshAndBroadcast()
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: 'Failed to refresh', message: err.message })
  }
})

// GET search across vault
router.get('/search', (req, res) => {
  try {
    const { q } = req.query
    if (!q || q.length < 2) {
      return res.json([])
    }
    const results = searchVaultFiles(q)
    res.json(results)
  } catch (err) {
    res.status(500).json({ error: 'Search failed', message: err.message })
  }
})

// GET worker status
router.get('/workers', async (req, res) => {
  try {
    const workers = await getWorkerStatus()
    res.json({ workers })
  } catch (err) {
    res.status(500).json({ error: 'Failed to get worker status', message: err.message })
  }
})

// POST start workers
router.post('/workers/start', requireAdmin, async (req, res) => {
  try {
    const cmd = `cd "${REPO_ROOT}" && python3 workers.py start`
    const { stdout } = await execAsync(cmd, { timeout: 120000 })
    
    refreshAndBroadcast()
    res.json({ success: true, message: 'Workers started', output: stdout })
  } catch (err) {
    res.status(500).json({ error: 'Failed to start workers', message: err.message })
  }
})

// POST stop workers
router.post('/workers/stop', requireAdmin, async (req, res) => {
  try {
    const cmd = `cd "${REPO_ROOT}" && python3 workers.py stop`
    const { stdout } = await execAsync(cmd, { timeout: 120000 })
    
    refreshAndBroadcast()
    res.json({ success: true, message: 'Workers stopped', output: stdout })
  } catch (err) {
    res.status(500).json({ error: 'Failed to stop workers', message: err.message })
  }
})

export default router
