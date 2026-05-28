import { Router } from 'express'
import { getNotifications, markRead, markAllRead } from '../services/notificationService.js'

const router = Router()

router.get('/', (req, res) => {
  res.json(getNotifications())
})

router.post('/:id/read', (req, res) => {
  const n = markRead(req.params.id)
  if (!n) return res.status(404).json({ error: 'Notification not found' })
  res.json(n)
})

router.post('/read-all', (req, res) => {
  markAllRead()
  res.json({ success: true })
})

export default router
