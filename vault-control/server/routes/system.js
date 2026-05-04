import express from 'express'
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

export default router
