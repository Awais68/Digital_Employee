import express from 'express'
import { execSync } from 'child_process'
import path from 'path'
import {
  getServiceStatus,
  getSystemHealth,
  getSystemMetrics,
  getVaultCounts,
  getRecentActivity,
  getPendingApprovals,
  refreshAndBroadcast,
} from '../system-status.js'
import { readVaultFiles, searchVaultFiles } from '../vault-reader.js'
import fs from 'fs'

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
router.get('/metrics', (req, res) => {
  const metrics = getSystemMetrics()
  res.json(metrics)
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

// GET dashboard stats - comprehensive endpoint
router.get('/stats', async (req, res) => {
  try {
    const stats = {
      vaultCounts: getVaultCounts(true),
      recentActivity: getRecentActivity(10),
      pendingApprovals: getPendingApprovals(),
      services: await getServiceStatus(),
      timestamp: new Date(),
    }
    res.json(stats)
  } catch (err) {
    res.status(500).json({ error: 'Failed to get dashboard stats', message: err.message })
  }
})

// POST refresh - trigger manual refresh and broadcast
router.post('/refresh', async (req, res) => {
  try {
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
router.get('/workers', (req, res) => {
  try {
    const VAULT_PARENT = path.resolve(process.cwd(), '..')
    const pidFile = path.join(VAULT_PARENT, '.workers.pid')
    
    const pids = fs.existsSync(pidFile) ? JSON.parse(fs.readFileSync(pidFile, 'utf-8')) : {}
    const workers = {}
    
    const workerList = ['orchestrator', 'whatsapp_watcher', 'gmail_watcher']
    
    for (const name of workerList) {
      const pid = pids[name]
      let running = false
      
      if (pid) {
        try {
          process.kill(pid, 0)
          running = true
        } catch {
          running = false
        }
      }
      
      workers[name] = { name, running, pid: running ? pid : null }
    }
    
    res.json({ workers })
  } catch (err) {
    res.status(500).json({ error: 'Failed to get worker status', message: err.message })
  }
})

// POST start workers
router.post('/workers/start', (req, res) => {
  try {
    const VAULT_PARENT = path.resolve(process.cwd(), '..')
    const cmd = `cd "${VAULT_PARENT}" && python3 workers.py start`
    const output = execSync(cmd, { timeout: 10000 }).toString()
    
    refreshAndBroadcast()
    res.json({ success: true, message: 'Workers started', output })
  } catch (err) {
    res.status(500).json({ error: 'Failed to start workers', message: err.message })
  }
})

// POST stop workers
router.post('/workers/stop', (req, res) => {
  try {
    const VAULT_PARENT = path.resolve(process.cwd(), '..')
    const cmd = `cd "${VAULT_PARENT}" && python3 workers.py stop`
    const output = execSync(cmd, { timeout: 10000 }).toString()
    
    refreshAndBroadcast()
    res.json({ success: true, message: 'Workers stopped', output })
  } catch (err) {
    res.status(500).json({ error: 'Failed to stop workers', message: err.message })
  }
})

export default router
