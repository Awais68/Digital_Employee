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
import { readVaultFiles } from '../vault-reader.js'

const router = express.Router()

// GET system health
router.get('/health', (req, res) => {
  const health = getSystemHealth()
  res.json(health)
})

// GET services status
router.get('/services', (req, res) => {
  const services = getServiceStatus()
  res.json(services)
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
router.get('/stats', (req, res) => {
  const stats = {
    vaultCounts: getVaultCounts(true),
    recentActivity: getRecentActivity(10),
    pendingApprovals: getPendingApprovals(),
    services: getServiceStatus(),
    timestamp: new Date(),
  }
  res.json(stats)
})

// POST refresh - trigger manual refresh and broadcast
router.post('/refresh', (req, res) => {
  const data = refreshAndBroadcast()
  res.json(data)
})

export default router
