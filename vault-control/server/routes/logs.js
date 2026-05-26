import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.join(__dirname, '../../../')
const LOGS_DIR = path.join(ROOT_DIR, 'Logs')

const router = express.Router()

let logsCache = null
let logsCacheTime = 0

function parseLogFiles() {
  if (logsCache && Date.now() - logsCacheTime < 5000) {
    return logsCache
  }

  const logs = []
  
  if (!fs.existsSync(LOGS_DIR)) return logs

  const files = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.log') || f.endsWith('.json'))
  
  for (const file of files) {
    const filePath = path.join(LOGS_DIR, file)
    const stat = fs.statSync(filePath)
    
    if (file.endsWith('.json')) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        const entries = JSON.parse(content)
        if (Array.isArray(entries)) {
          entries.forEach((entry, i) => {
            logs.push({
              id: `${file}-${i}`,
              timestamp: entry.timestamp || stat.mtime,
              service: entry.service || file.replace('.json', ''),
              action: entry.action || 'unknown',
              target: entry.target || 'N/A',
              status: entry.status || 'success',
              message: entry.message || 'Log entry',
              details: entry,
            })
          })
        }
      } catch (err) {
        // Skip invalid JSON
      }
    } else if (file.endsWith('.log')) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        const lines = content.split('\n').filter(line => line.trim())
        
        lines.forEach((line, i) => {
          const parsed = parseLogLine(line, file, stat)
          if (parsed) {
            logs.push({
              id: `${file}-${i}`,
              timestamp: parsed.timestamp || stat.mtime,
              service: parsed.service || file.replace('.log', ''),
              action: parsed.action || 'unknown',
              target: parsed.target || 'N/A',
              status: parsed.status || 'success',
              message: parsed.message || line.substring(0, 200),
              details: { rawLine: line },
            })
          }
        })
      } catch (err) {
        // Skip unreadable files
      }
    }
  }
  
  logsCache = logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  logsCacheTime = Date.now()
  return logsCache
}

function parseLogLine(line, filename, stat) {
  // Try to extract timestamp, service, action, status from log lines
  // Common formats: [2024-03-28 10:00:00] [SERVICE] message
  
  const timestampRegex = /(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/
  const match = line.match(timestampRegex)
  
  let timestamp = match ? new Date(match[1]) : stat.mtime
  let status = 'success'
  
  if (line.toLowerCase().includes('error') || line.toLowerCase().includes('fail')) status = 'failed'
  else if (line.toLowerCase().includes('warn')) status = 'pending'
  
  const serviceMap = {
    'gmail': 'Gmail',
    'email': 'Gmail',
    'whatsapp': 'WhatsApp',
    'wa': 'WhatsApp',
    'linkedin': 'LinkedIn',
    'twitter': 'Twitter',
    'facebook': 'Facebook',
    'odoo': 'Odoo',
    'instagram': 'Instagram',
    'cron': 'Cron',
    'ceo_briefing': 'CEO Briefing',
  }
  
  let service = filename.replace('.log', '').replace(/\_/g, ' ')
  for (const [key, value] of Object.entries(serviceMap)) {
    if (line.toLowerCase().includes(key)) {
      service = value
      break
    }
  }
  
  return {
    timestamp,
    service,
    action: extractAction(line),
    target: 'N/A',
    status,
    message: line.substring(0, 500),
  }
}

function extractAction(line) {
  const lower = line.toLowerCase()
  if (lower.includes('send')) return 'email_send'
  if (lower.includes('receive')) return 'email_received'
  if (lower.includes('payment')) return 'payment_process'
  if (lower.includes('post')) return 'post_published'
  if (lower.includes('sync')) return 'file_synced'
  if (lower.includes('error')) return 'error'
  if (lower.includes('start')) return 'service_start'
  if (lower.includes('stop')) return 'service_stop'
  return 'operation'
}

// GET filtered logs
router.get('/', (req, res) => {
  const { service, action, status, limit = 50, offset = 0 } = req.query
  let allLogs = parseLogFiles()

  // Filter by service
  if (service && service !== 'All') {
    allLogs = allLogs.filter(log => log.service === service)
  }

  // Filter by action
  if (action && action !== 'All') {
    allLogs = allLogs.filter(log => log.action === action)
  }

  // Filter by status
  if (status && status !== 'All') {
    allLogs = allLogs.filter(log => log.status === status)
  }

  // Pagination
  const total = allLogs.length
  const paginatedLogs = allLogs.slice(parseInt(offset), parseInt(offset) + parseInt(limit))

  res.json({
    logs: paginatedLogs,
    total,
    limit: parseInt(limit),
    offset: parseInt(offset),
  })
})

// GET single log details
router.get('/:id', (req, res) => {
  const logs = parseLogFiles()
  const log = logs.find(l => l.id === req.params.id)

  if (!log) {
    return res.status(404).json({ error: 'Log not found' })
  }

  res.json(log)
})

export default router
