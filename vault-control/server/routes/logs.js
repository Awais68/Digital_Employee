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

// ---------- Storage management ----------

const LOG_EXTENSIONS = ['.log', '.json', '.old', '.txt', '.gz', '.1', '.2']

function isLogArtifact(name) {
  return LOG_EXTENSIONS.some(ext => name.endsWith(ext)) || /\.log\.\d+$/.test(name)
}

// Files a running process (pm2, watchers) may still hold open.
// Those are truncated instead of deleted so the disk space is actually freed.
function isActiveLog(name) {
  return name.endsWith('.log')
}

// Resolves a client-supplied name (may include a subdirectory such as
// "audit/audit_log.archive.2.json") and rejects anything escaping LOGS_DIR.
function safeLogPath(name) {
  const root = path.resolve(LOGS_DIR)
  const full = path.resolve(root, name)
  if (full !== root && !full.startsWith(root + path.sep)) return null
  return full
}

function walkLogDir(dir, prefix = '') {
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (err) {
    return []
  }

  const out = []
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    const full = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      out.push(...walkLogDir(full, rel))
      continue
    }
    if (!entry.isFile() || !isLogArtifact(entry.name)) continue

    try {
      const stat = fs.statSync(full)
      out.push({
        name: rel,
        bytes: stat.size,
        mtime: stat.mtime,
        ageDays: Math.floor((Date.now() - stat.mtime.getTime()) / 86400000),
        active: isActiveLog(entry.name),
      })
    } catch (err) {
      // Skip files that vanished mid-scan
    }
  }
  return out
}

function statLogFiles() {
  if (!fs.existsSync(LOGS_DIR)) return []
  return walkLogDir(LOGS_DIR).sort((a, b) => b.bytes - a.bytes)
}

function invalidateCache() {
  logsCache = null
  logsCacheTime = 0
}

// GET storage usage of the Logs directory
router.get('/storage/stats', (req, res) => {
  const files = statLogFiles()
  const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0)
  const staleBytes = files.filter(f => f.ageDays >= 7).reduce((sum, f) => sum + f.bytes, 0)

  res.json({
    totalBytes,
    staleBytes,
    fileCount: files.length,
    files: files.slice(0, 30),
  })
})

// DELETE / clear logs from disk
// mode=truncate -> empty every log file, keep the files (safe for running services)
// mode=old      -> only touch files not modified for `days` days (default 7)
// mode=all      -> truncate active .log files, delete every other log artifact
router.delete('/storage', (req, res) => {
  const mode = req.query.mode || req.body?.mode || 'truncate'
  const days = parseInt(req.query.days || req.body?.days || 7, 10)

  if (!['truncate', 'old', 'all'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid mode. Use truncate, old or all.' })
  }

  const files = statLogFiles()
  const targets = mode === 'old' ? files.filter(f => f.ageDays >= days) : files

  let freedBytes = 0
  const truncated = []
  const deleted = []
  const failed = []

  for (const file of targets) {
    const full = safeLogPath(file.name)
    if (!full) continue
    try {
      if (mode === 'truncate' || file.active) {
        fs.truncateSync(full, 0)
        truncated.push(file.name)
      } else {
        fs.unlinkSync(full)
        deleted.push(file.name)
      }
      freedBytes += file.bytes
    } catch (err) {
      failed.push({ name: file.name, error: err.message })
    }
  }

  invalidateCache()

  res.json({
    success: failed.length === 0,
    mode,
    days: mode === 'old' ? days : undefined,
    freedBytes,
    truncated,
    deleted,
    failed,
  })
})

// DELETE a single log file
router.delete('/storage/file/*', (req, res) => {
  const name = req.params[0] || ''
  const full = safeLogPath(name)
  if (!full || !isLogArtifact(path.basename(name))) {
    return res.status(400).json({ error: 'Invalid log file name' })
  }
  if (!fs.existsSync(full)) {
    return res.status(404).json({ error: 'Log file not found' })
  }

  try {
    const bytes = fs.statSync(full).size
    if (isActiveLog(path.basename(full))) {
      fs.truncateSync(full, 0)
    } else {
      fs.unlinkSync(full)
    }
    invalidateCache()
    res.json({ success: true, name: path.basename(full), freedBytes: bytes })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
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
