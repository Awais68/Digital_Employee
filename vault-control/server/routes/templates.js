import express from 'express'
import { query } from '../database/connection.js'

const router = express.Router()

const DEFAULT_TEMPLATES = [
  { id: 1, name: 'Acknowledge Receipt',    shortcut: '/ack',
    body: 'Thank you for reaching out. I have received your message and will get back to you within 24 hours.' },
  { id: 2, name: 'Meeting Request Accept', shortcut: '/meet',
    body: 'Thank you for the meeting request. I would be happy to connect. Please share your availability or book a slot at [CALENDAR_LINK].' },
  { id: 3, name: 'Invoice Received',       shortcut: '/inv',
    body: 'Thank you for sending the invoice. I have received it and will process payment within [X] business days.' },
  { id: 4, name: 'Follow Up',              shortcut: '/fu',
    body: 'I wanted to follow up on my previous message regarding [TOPIC]. Please let me know if you need any additional information.' },
  { id: 5, name: 'Project Update Request', shortcut: '/upd',
    body: 'Could you please provide an update on [PROJECT_NAME]? We would like to know the current status and expected timeline.' },
]

router.get('/', async (req, res) => {
  try {
    const result = await query('SELECT * FROM email_templates ORDER BY name')
    if (result.rows.length === 0) {
      for (const t of DEFAULT_TEMPLATES) {
        await query(
          'INSERT INTO email_templates(name, shortcut, body) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [t.name, t.shortcut, t.body]
        )
      }
      return res.json(DEFAULT_TEMPLATES)
    }
    res.json(result.rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/', async (req, res) => {
  const { name, shortcut, body } = req.body
  const result = await query(
    'INSERT INTO email_templates(name, shortcut, body) VALUES($1,$2,$3) RETURNING *',
    [name, shortcut, body]
  )
  res.json(result.rows[0])
})

router.put('/:id', async (req, res) => {
  const { name, shortcut, body } = req.body
  const result = await query(
    'UPDATE email_templates SET name=$1, shortcut=$2, body=$3 WHERE id=$4 RETURNING *',
    [name, shortcut, body, req.params.id]
  )
  res.json(result.rows[0])
})

router.delete('/:id', async (req, res) => {
  await query('DELETE FROM email_templates WHERE id=$1', [req.params.id])
  res.json({ success: true })
})

export default router
