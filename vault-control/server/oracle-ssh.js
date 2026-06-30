import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

const ORACLE_HOST = process.env.ORACLE_SSH_HOST || '140.245.241.95'
const ORACLE_USER = process.env.ORACLE_SSH_USER || 'ubuntu'
const ORACLE_KEY = process.env.ORACLE_SSH_KEY || '~/Documents/Hyd-oracle/ssh-key-2026-06-26.key'
const ORACLE_TIMEOUT = 15000
const CACHE_TTL = 15000

let cache = { data: null, at: 0 }

function ssh(cmd) {
  const escaped = cmd.replace(/"/g, '\\"')
  return execAsync(
    `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -o BatchMode=yes -i ${ORACLE_KEY} ${ORACLE_USER}@${ORACLE_HOST} "${escaped}"`,
    { timeout: ORACLE_TIMEOUT }
  ).then(r => r.stdout.trim())
}

export async function getOracleStats() {
  const now = Date.now()
  if (cache.data && now - cache.at < CACHE_TTL) {
    return cache.data
  }

  // Single SSH connection with all commands bundled
  const combinedCmd = [
    'echo "===CPU==="',
    'top -bn1 | head -5',
    'echo "===MEM==="',
    'free -b',
    'echo "===DISK==="',
    'df -B1 /',
    'echo "===UPTIME==="',
    'uptime -p',
    'echo "===HOSTNAME==="',
    'hostname',
    'echo "===LOAD==="',
    'cat /proc/loadavg',
    'echo "===NET==="',
    'cat /proc/net/dev | grep ens3 || cat /proc/net/dev | head -2',
    'echo "===PROCS==="',
    'ps aux --sort=-%cpu | head -11',
    'echo "===OS==="',
    'cat /etc/os-release | head -2',
    'echo "===KERNEL==="',
    'uname -r',
    'echo "===CORES==="',
    'nproc',
  ].join(' && ')

  const output = await ssh(combinedCmd)

  // Parse sections
  const sections = {}
  const sectionRegex = /===([A-Z]+)===\n([\s\S]*?)(?====|$)/g
  let match
  while ((match = sectionRegex.exec(output)) !== null) {
    sections[match[1]] = match[2].trim()
  }

  // Parse CPU usage from top
  let cpuPercent = 0
  const cpuMatch = (sections.CPU || '').match(/(\d+\.?\d*)\s*id/)
  if (cpuMatch) {
    cpuPercent = Math.round(100 - parseFloat(cpuMatch[1]))
  }

  // Parse memory from free
  let memTotal = 0, memUsed = 0, memFree = 0, memAvailable = 0
  const memLines = (sections.MEM || '').split('\n')
  for (const line of memLines) {
    if (line.startsWith('Mem:')) {
      const parts = line.split(/\s+/).filter(Boolean)
      memTotal = parseInt(parts[1]) || 0
      memUsed = parseInt(parts[2]) || 0
      memFree = parseInt(parts[3]) || 0
      memAvailable = parseInt(parts[6]) || memFree
    }
  }

  // Parse disk from df
  let diskTotal = 0, diskUsed = 0, diskFree = 0, diskPercent = 0
  const diskLines = (sections.DISK || '').split('\n')
  for (const line of diskLines) {
    if (line.includes('/dev') || line.includes('overlay')) {
      const parts = line.split(/\s+/).filter(Boolean)
      diskTotal = parseInt(parts[1]) || 0
      diskUsed = parseInt(parts[2]) || 0
      diskFree = parseInt(parts[3]) || 0
      diskPercent = parseInt(parts[4]) || 0
    }
  }

  // Parse load average
  const loadParts = (sections.LOAD || '').split(' ').filter(Boolean)
  const loadAvg = {
    '1m': parseFloat(loadParts[0]) || 0,
    '5m': parseFloat(loadParts[1]) || 0,
    '15m': parseFloat(loadParts[2]) || 0,
  }

  // Parse network
  let netIn = 0, netOut = 0
  const netLines = (sections.NET || '').split('\n')
  for (const line of netLines) {
    const match = line.match(/^\s*(\S+):\s*(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/)
    if (match) {
      netIn += parseInt(match[2]) || 0
      netOut += parseInt(match[3]) || 0
    }
  }

  // Parse top processes
  const procs = []
  const procLines = (sections.PROCS || '').split('\n').slice(1)
  for (const line of procLines) {
    const parts = line.split(/\s+/).filter(Boolean)
    if (parts.length >= 11) {
      procs.push({
        user: parts[0],
        pid: parts[1],
        cpu: parseFloat(parts[2]) || 0,
        mem: parseFloat(parts[3]) || 0,
        command: parts.slice(10).join(' ').substring(0, 60),
      })
    }
  }

  const osInfo = (sections.OS || '').split('\n')[0]?.replace('PRETTY_NAME=', '').replace(/"/g, '') || 'Ubuntu'

  const result = {
    online: true,
    host: ORACLE_HOST,
    user: ORACLE_USER,
    hostname: sections.HOSTNAME || 'oracle-vm',
    os: osInfo,
    kernel: sections.KERNEL || '',
    uptime: sections.UPTIME || '',
    cpu: {
      cores: parseInt(sections.CORES) || 0,
      percent: cpuPercent,
      loadAvg,
    },
    memory: {
      total: Math.round(memTotal / 1024 / 1024),
      used: Math.round(memUsed / 1024 / 1024),
      free: Math.round(memFree / 1024 / 1024),
      available: Math.round(memAvailable / 1024 / 1024),
      percent: memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0,
    },
    disk: {
      total: Math.round(diskTotal / 1024 / 1024 / 1024),
      used: Math.round(diskUsed / 1024 / 1024 / 1024),
      free: Math.round(diskFree / 1024 / 1024 / 1024),
      percent: diskPercent,
    },
    network: {
      inBytes: netIn,
      outBytes: netOut,
      inFormatted: formatBytes(netIn),
      outFormatted: formatBytes(netOut),
    },
    processes: procs,
    timestamp: new Date().toISOString(),
  }

  cache = { data: result, at: now }
  return result
}

export async function checkOracleReachable() {
  try {
    await ssh("echo ok")
    return true
  } catch {
    return false
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}
