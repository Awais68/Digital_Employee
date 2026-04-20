import express from 'express'

const router = express.Router()

// Mock logs generator
function generateMockLogs() {
  const actions = ['email_send', 'payment_process', 'post_published', 'file_synced', 'email_received', 'payment_approved']
  const statuses = ['success', 'failed', 'pending']
  const services = ['Gmail', 'Odoo', 'LinkedIn', 'Twitter', 'WhatsApp', 'Facebook']

  return Array.from({ length: 100 }, (_, i) => ({
    id: `log-${i}`,
    timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
    service: services[Math.floor(Math.random() * services.length)],
    action: actions[Math.floor(Math.random() * actions.length)],
    target: `user${Math.floor(Math.random() * 100)}@example.com`,
    status: statuses[Math.floor(Math.random() * statuses.length)],
    message: 'Operation completed',
    details: {
      request_id: `req-${Math.random().toString(36).substr(2, 9)}`,
      response_time: Math.floor(Math.random() * 2000) + 'ms',
    }
  })).sort((a, b) => b.timestamp - a.timestamp)
}

// GET filtered logs
router.get('/', (req, res) => {
  const { service, action, status, limit = 50, offset = 0 } = req.query
  let logs = generateMockLogs()

  // Filter by service
  if (service && service !== 'All') {
    logs = logs.filter(log => log.service === service)
  }

  // Filter by action
  if (action && action !== 'All') {
    logs = logs.filter(log => log.action === action)
  }

  // Filter by status
  if (status && status !== 'All') {
    logs = logs.filter(log => log.status === status)
  }

  // Pagination
  const total = logs.length
  const paginatedLogs = logs.slice(parseInt(offset), parseInt(offset) + parseInt(limit))

  res.json({
    logs: paginatedLogs,
    total,
    limit: parseInt(limit),
    offset: parseInt(offset),
  })
})

// GET single log details
router.get('/:id', (req, res) => {
  const logs = generateMockLogs()
  const log = logs.find(l => l.id === req.params.id)

  if (!log) {
    return res.status(404).json({ error: 'Log not found' })
  }

  res.json(log)
})

export default router
