import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'

const execAsync = promisify(exec)

const VAULT_PATH = process.env.VAULT_PATH || './AI_Employee_Vault'

// Service status tracking with more realistic checks
const servicesConfig = [
  { name: 'Odoo MCP', process: 'odoo_mcp.py', type: 'python' },
  { name: 'Email MCP', process: 'email_mcp.py', type: 'python' },
  { name: 'Gmail Watcher', process: 'gmail_watcher.py', type: 'python' },
  { name: 'WhatsApp Watcher', process: 'whatsapp_watcher.py', type: 'python' },
  { name: 'LinkedIn MCP', process: 'linkedin_mcp.py', type: 'python' },
]

export async function getServiceStatus() {
  const statuses = await Promise.all(servicesConfig.map(async (svc) => {
    try {
      // Check if process is running
      const { stdout } = await execAsync(`pgrep -f ${svc.process}`).catch(() => ({ stdout: '' }))
      const isRunning = stdout.trim().length > 0
      
      // Check last activity from Logs folder
      let lastActivity = '—'
      const logFile = path.join(process.cwd(), 'Logs', `${svc.name.toLowerCase().replace(' ', '_')}.log`)
      if (fs.existsSync(logFile)) {
        const stat = fs.statSync(logFile)
        lastActivity = formatTime(Date.now() - stat.mtimeMs)
      }

      return {
        name: svc.name,
        status: isRunning ? 'running' : 'offline',
        uptime: isRunning ? 'Active' : '—',
        lastActivity
      }
    } catch (err) {
      return { name: svc.name, status: 'offline', uptime: '—', lastActivity: '—' }
    }
  }))

  return statuses
}

export function getSystemMetrics() {
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMem = totalMem - freeMem
  const cpus = os.cpus()

  return {
    cpu: {
      cores: cpus.length,
      model: cpus[0]?.model || 'Unknown',
    },
    memory: {
      total: Math.round(totalMem / 1024 / 1024 / 1024),
      used: Math.round(usedMem / 1024 / 1024 / 1024),
      free: Math.round(freeMem / 1024 / 1024 / 1024),
      percent: Math.round((usedMem / totalMem) * 100),
    },
    uptime: os.uptime(),
  }
}

export async function getSystemHealth() {
  const metrics = getSystemMetrics()
  const services = await getServiceStatus()

  const allRunning = services.every(s => s.status !== 'offline')
  const hasWarnings = services.some(s => s.status === 'warning')

  return {
    overall: hasWarnings ? 'warning' : allRunning ? 'ok' : 'critical',
    metrics,
    services,
    timestamp: new Date(),
  }
}

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(ms / 60000)
  const hours = Math.floor(ms / 3600000)

  if (seconds < 60) return `${seconds}s ago`
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// Get vault folder counts
export function getVaultCounts(forceRefresh = false) {
  const folders = [
    'Inbox',
    'Needs_Action',
    'Pending_Approval',
    'Approved',
    'Done',
    'Rejected',
    'LinkedIn',
    'Contacts',
  ]

  const counts = {}
  for (const folder of folders) {
    try {
      const folderPath = path.join(process.cwd(), folder)
      if (fs.existsSync(folderPath)) {
        const items = fs.readdirSync(folderPath).filter(f => !f.startsWith('.'))
        counts[folder] = items.length
      } else {
        counts[folder] = 0
      }
    } catch (err) {
      counts[folder] = 0
    }
  }

  return counts
}

// Get recent activity from Done folder
export function getRecentActivity(limit = 10) {
  try {
    const donePath = path.join(process.cwd(), 'Done')
    if (!fs.existsSync(donePath)) return []

    const files = fs.readdirSync(donePath)
      .filter(f => f.endsWith('.md'))
      .sort((a, b) => {
        const statA = fs.statSync(path.join(donePath, a))
        const statB = fs.statSync(path.join(donePath, b))
        return statB.mtimeMs - statA.mtimeMs
      })
      .slice(0, limit)

    return files.map(file => {
      const filePath = path.join(donePath, file)
      const stat = fs.statSync(filePath)
      return {
        filename: file,
        updatedAt: stat.mtime,
        size: stat.size,
      }
    })
  } catch (err) {
    return []
  }
}

// Get pending items requiring approval
export function getPendingApprovals() {
  try {
    const pendingPath = path.join(process.cwd(), 'Pending_Approval')
    if (!fs.existsSync(pendingPath)) return []

    const files = fs.readdirSync(pendingPath)
      .filter(f => f.endsWith('.md'))
      .map(file => {
        const filePath = path.join(pendingPath, file)
        const stat = fs.statSync(filePath)
        return {
          id: file.replace('.md', ''),
          filename: file,
          title: file.replace('.md', '').replace(/_/g, ' '),
          createdAt: stat.birthtime,
          updatedAt: stat.mtime,
        }
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)

    return files
  } catch (err) {
    return []
  }
}

// Refresh all data and broadcast via WebSocket
export async function refreshAndBroadcast() {
  const data = {
    type: 'dashboard_update',
    vaultCounts: getVaultCounts(true),
    recentActivity: getRecentActivity(10),
    pendingApprovals: getPendingApprovals(),
    services: await getServiceStatus(),
    timestamp: new Date(),
  }

  if (global.broadcast) {
    global.broadcast(data)
  }

  return data
}
