import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Server, Cpu, HardDrive, Wifi, WifiOff, Activity, ArrowDown, ArrowUp, AlertTriangle, GitBranch, Trash2, Loader2, CheckCircle2 } from 'lucide-react'
import axios from 'axios'
import usePolling from '../hooks/usePolling'

const REFRESH_INTERVAL = 30000 // 30s, and only while the tab is visible

function formatUptime(seconds) {
  if (!seconds && seconds !== 0) return '—'
  if (typeof seconds === 'string') return seconds.replace('up ', '')
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

// Utilisation colour is driven by the number, not by which metric it is. The
// disk row used to be hardcoded orange, so a healthy 24% read as a warning and
// looked like "storage is full" — see the false-disk-full report.
const OK = 70   // below this: healthy
const WARN = 90 // at/above this: critical

function usageBarColor(percent) {
  if (percent === null) return 'bg-gray-400'
  if (percent >= WARN) return 'bg-red-500'
  if (percent >= OK) return 'bg-orange-500'
  return 'bg-green-500'
}

function usageCardColor(percent) {
  if (percent === null) return 'dark:bg-gray-500/20 dark:text-gray-400 bg-gray-100 text-gray-500'
  if (percent >= WARN) return 'dark:bg-red-500/20 dark:text-red-400 bg-red-50 text-red-600'
  if (percent >= OK) return 'dark:bg-orange-500/20 dark:text-orange-400 bg-orange-50 text-orange-600'
  return 'dark:bg-green-500/20 dark:text-green-400 bg-green-50 text-green-600'
}

function ProgressBar({ percent, color, label, value }) {
  return (
    <div>
      {(label || value) && (
        <div className="flex justify-between mb-1.5">
          <span className="text-sm dark:text-[#7A7A85] text-gray-600">{label}</span>
          <span className="text-sm font-bold dark:text-[#E0E0E6] text-gray-900">{value}</span>
        </div>
      )}
      <div className="w-full h-2.5 dark:bg-[#1A1A24] bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-xs dark:text-[#7A7A85] text-gray-500 font-mono truncate">{label}</p>
          <p className="text-lg font-bold dark:text-[#E0E0E6] text-gray-900 truncate">{value}</p>
          {sub && <p className="text-[10px] dark:text-[#7A7A85] text-gray-400 truncate">{sub}</p>}
        </div>
      </div>
    </div>
  )
}

function ServiceList({ title, items }) {
  return (
    <div className="card p-6">
      <h3 className="font-bold dark:text-[#E0E0E6] text-gray-900 mb-4">{title}</h3>
      <div className="space-y-3">
        {items.length === 0 && (
          <p className="text-sm dark:text-[#7A7A85] text-gray-500">No services found</p>
        )}
        {items.map((svc, i) => (
          <div key={i} className="flex items-center justify-between p-3 dark:bg-[#1A1A24] bg-gray-50 rounded">
            <span className="dark:text-[#E0E0E6] text-gray-900">{svc.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs dark:text-[#7A7A85] text-gray-500">{svc.lastActivity}</span>
              <div className={`w-2 h-2 rounded-full ${svc.status === 'running' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function OracleCloud() {
  const [stats, setStats] = useState(null)
  const [vmInfo, setVmInfo] = useState(null)
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [cleaning, setCleaning] = useState(false)
  const [cleanResult, setCleanResult] = useState(null)
  const [cleanStatus, setCleanStatus] = useState(null)

  const fetchAll = useCallback(async () => {
    try {
      const [oracleRes, vmRes, statsRes, cleanRes] = await Promise.all([
        axios.get('/api/oracle/stats', { timeout: 15000 }).catch(() => null),
        axios.get('/api/system/vm-info').catch(() => null),
        axios.get('/api/system/stats').catch(() => null),
        axios.get('/api/oracle/clean/status').catch(() => null),
      ])
      if (cleanRes?.data) setCleanStatus(cleanRes.data)
      if (oracleRes?.data) setStats(oracleRes.data)
      if (vmRes?.data && typeof vmRes.data === 'object') setVmInfo(vmRes.data)
      if (statsRes?.data?.services) setServices(statsRes.data.services)
      setLastUpdated(new Date())
      setError(null)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
      if (!stats) setStats({ online: false })
    } finally {
      setLoading(false)
    }
  }, [])

  usePolling(fetchAll, REFRESH_INTERVAL)

  const handleClean = async () => {
    setCleaning(true)
    setCleanResult(null)
    try {
      // Clearing caches over SSH runs a series of remote commands; give it room.
      const { data } = await axios.post('/api/oracle/clean', {}, { timeout: 180000 })
      setCleanResult(data)
      fetchAll()
    } catch (err) {
      setCleanResult({
        success: false,
        error: err.response?.data?.error || err.response?.data?.message || err.message,
      })
    } finally {
      setCleaning(false)
    }
  }

  const online = stats?.online ?? vmInfo?.online
  const cpu = stats?.cpu || {}
  const mem = stats?.memory || {}
  const disk = stats?.disk || {}
  const net = stats?.network || {}
  const procs = stats?.processes || []
  // NOTE: vmInfo.metrics is NOT the VM's. getVmInfo() returns the Oracle host's
  // ip/region/provider but fills `metrics` from getSystemMetrics(), which reads
  // *this* machine's os/df. This page used to fall back to it whenever the SSH
  // stats call was slow or failed, so the laptop's 99%-full root disk rendered
  // under the "Oracle Cloud VM" heading and read as "OCI storage is full".
  // Only /api/oracle/stats describes the VM — when it is missing, show "—".
  const diskPercent = disk.percent ?? null
  const cpuPercent = cpu.percent ?? null
  const memPercent = mem.percent ?? null
  const pct = (v) => (v === null ? '—' : `${v}%`)

  const cloudServices = services.filter(s =>
    ['Email MCP', 'Gmail Watcher', 'LinkedIn MCP'].includes(s.name)
  )
  const localServices = services.filter(s =>
    ['WhatsApp Watcher', 'Odoo MCP', 'Instagram Bot', 'Facebook Bot'].includes(s.name)
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="animate-spin dark:text-[#00FF88] text-blue-500" size={32} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className={`card p-6 bg-gradient-to-r dark:from-orange-500/10 dark:to-[#12121A] from-orange-50 to-white border-l-4 ${online ? 'dark:border-l-green-500 border-l-green-500' : 'dark:border-l-red-500 border-l-red-500'}`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Server size={22} className="dark:text-[#00FF88] text-blue-500" />
              <h2 className="text-xl font-bold dark:text-[#E0E0E6] text-gray-900">
                Oracle Cloud VM
              </h2>
            </div>
            <div className="flex items-center gap-2 mt-2">
              {online ? (
                <Wifi size={16} className="text-green-500" />
              ) : (
                <WifiOff size={16} className="text-red-500" />
              )}
              <span className={`text-sm font-semibold ${online ? 'dark:text-green-400 text-green-600' : 'dark:text-red-400 text-red-600'}`}>
                {online ? 'CONNECTED' : 'OFFLINE'}
              </span>
              {lastUpdated && (
                <span className="text-xs dark:text-[#7A7A85] text-gray-400 ml-2">
                  {lastUpdated.toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleClean}
              disabled={cleaning || !online}
              title={online ? 'Clear package caches, old logs and temp files on the VM' : 'VM offline'}
              className="flex items-center gap-2 px-4 py-2 rounded font-medium text-sm transition-all bg-amber-500/15 text-amber-500 border border-amber-500/40 hover:bg-amber-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {cleaning ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              {cleaning ? 'Cleaning…' : 'Clear Cache & Space'}
            </button>
            <button
              onClick={fetchAll}
              className="flex items-center gap-2 px-4 py-2 rounded font-medium text-sm transition-all dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-100 text-gray-900 hover:opacity-80"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
        </div>

        {/* Cleanup result + auto-clean schedule */}
        {(cleanResult || cleanStatus?.lastClean) && (() => {
          const r = cleanResult || cleanStatus.lastClean
          return (
            <div className={`mb-4 p-3 rounded-lg border text-sm ${
              r.success
                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}>
              <div className="flex items-center gap-2 font-semibold">
                {r.success ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                {r.success
                  ? `Freed ${r.freedFormatted} — ${r.freeAfter} free now`
                  : `Cleanup failed: ${r.error}`}
                {r.trigger && (
                  <span className="text-xs opacity-60 font-normal">({r.trigger})</span>
                )}
              </div>
              {r.df && <div className="mt-1 text-xs font-mono opacity-70">{r.df}</div>}
              {r.steps?.some(st => !st.ok) && (
                <div className="mt-1 text-xs opacity-70">
                  Skipped: {r.steps.filter(st => !st.ok).map(st => st.step).join(', ')}
                </div>
              )}
            </div>
          )
        })()}

        {cleanStatus?.autoCleanEnabled && (
          <p className="mb-4 text-xs dark:text-[#7A7A85] text-gray-400">
            Auto-clean runs every {cleanStatus.intervalHours}h
            {cleanStatus.lastClean?.timestamp
              ? ` — last run ${new Date(cleanStatus.lastClean.timestamp).toLocaleString()}`
              : ' — no run yet this session'}
          </p>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {/* Server Info Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="dark:text-[#7A7A85] text-gray-500">Host</p>
            {/* vmInfo.ip is the VM; vmInfo.hostname is this machine — never fall back to it here */}
            <p className="font-mono dark:text-[#E0E0E6] text-gray-900">{stats?.host || vmInfo?.ip || '—'}</p>
          </div>
          <div>
            <p className="dark:text-[#7A7A85] text-gray-500">Region</p>
            <p className="font-semibold dark:text-[#E0E0E6] text-gray-900">{vmInfo?.region || stats?.hostname || '—'}</p>
          </div>
          <div>
            <p className="dark:text-[#7A7A85] text-gray-500">OS</p>
            <p className="font-semibold dark:text-[#E0E0E6] text-gray-900 text-xs">{stats?.os || '—'}</p>
          </div>
          <div>
            <p className="dark:text-[#7A7A85] text-gray-500">Uptime</p>
            <p className="font-semibold dark:text-[#E0E0E6] text-gray-900">{formatUptime(stats?.uptime)}</p>
          </div>
        </div>
      </div>

      {/* Resource Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Cpu}
          label="CPU"
          value={pct(cpuPercent)}
          sub={cpu.cores ? `${cpu.cores} cores` : '—'}
          color={usageCardColor(cpuPercent)}
        />
        <StatCard
          icon={Activity}
          label="MEMORY"
          value={pct(memPercent)}
          sub={mem.used ? `${mem.used} / ${mem.total} MB` : '—'}
          color={usageCardColor(memPercent)}
        />
        <StatCard
          icon={HardDrive}
          label="DISK"
          value={pct(diskPercent)}
          sub={disk.used ? `${disk.used} / ${disk.total} GB` : '—'}
          color={usageCardColor(diskPercent)}
        />
        <StatCard
          icon={Wifi}
          label="NETWORK"
          value={net.inFormatted || '0 B'}
          sub={`↑ ${net.outFormatted || '0 B'}`}
          color="dark:bg-green-500/20 dark:text-green-400 bg-green-50 text-green-600"
        />
      </div>

      {/* Resource Bars */}
      <div className="card p-6">
        <h3 className="font-bold dark:text-[#E0E0E6] text-gray-900 mb-4">Resource Usage</h3>
        <div className="space-y-4">
          <ProgressBar
            percent={cpuPercent ?? 0}
            color={usageBarColor(cpuPercent)}
            label="CPU"
            value={pct(cpuPercent)}
          />
          {cpu.loadAvg && (
            <p className="text-[10px] dark:text-[#7A7A85] text-gray-400 -mt-2">
              Load: {cpu.loadAvg['1m'] ?? 0} / {cpu.loadAvg['5m'] ?? 0} / {cpu.loadAvg['15m'] ?? 0}
            </p>
          )}
          <ProgressBar
            percent={memPercent ?? 0}
            color={usageBarColor(memPercent)}
            label="Memory"
            value={mem.used ? `${mem.used} MB / ${mem.total} MB` : '—'}
          />
          <ProgressBar
            percent={diskPercent ?? 0}
            color={usageBarColor(diskPercent)}
            label="Disk"
            value={disk.used ? `${disk.used} GB / ${disk.total} GB` : '—'}
          />
          {(net.inFormatted || net.outFormatted) && (
            <>
              <ProgressBar
                percent={0}
                color="bg-green-500"
                label="↓ Network In"
                value={net.inFormatted || '0 B'}
              />
              <ProgressBar
                percent={0}
                color="bg-green-500"
                label="↑ Network Out"
                value={net.outFormatted || '0 B'}
              />
            </>
          )}
        </div>
      </div>

      {/* Top Processes */}
      {procs.length > 0 && (
        <div className="card p-6">
          <h3 className="font-bold dark:text-[#E0E0E6] text-gray-900 mb-4">Top Processes (by CPU)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b dark:border-[#2A3E5F] border-gray-200">
                  <th className="text-left py-2 px-2 dark:text-[#7A7A85] text-gray-500 font-mono text-xs">USER</th>
                  <th className="text-left py-2 px-2 dark:text-[#7A7A85] text-gray-500 font-mono text-xs">PID</th>
                  <th className="text-right py-2 px-2 dark:text-[#7A7A85] text-gray-500 font-mono text-xs">CPU%</th>
                  <th className="text-right py-2 px-2 dark:text-[#7A7A85] text-gray-500 font-mono text-xs">MEM%</th>
                  <th className="text-left py-2 px-2 dark:text-[#7A7A85] text-gray-500 font-mono text-xs">COMMAND</th>
                </tr>
              </thead>
              <tbody>
                {procs.map((p, i) => (
                  <tr key={i} className="border-b dark:border-[#1A1A24] border-gray-100 hover:dark:bg-[#1A1A24]/50">
                    <td className="py-2 px-2 dark:text-[#E0E0E6] text-gray-900 font-mono text-xs">{p.user}</td>
                    <td className="py-2 px-2 dark:text-[#E0E0E6] text-gray-900 font-mono text-xs">{p.pid}</td>
                    <td className="py-2 px-2 text-right">
                      <span className={`font-mono text-xs ${p.cpu > 50 ? 'text-red-400 font-bold' : 'dark:text-[#E0E0E6] text-gray-900'}`}>
                        {p.cpu}%
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right">
                      <span className={`font-mono text-xs ${p.mem > 50 ? 'text-orange-400 font-bold' : 'dark:text-[#E0E0E6] text-gray-900'}`}>
                        {p.mem}%
                      </span>
                    </td>
                    <td className="py-2 px-2 dark:text-[#7A7A85] text-gray-600 font-mono text-xs truncate max-w-[200px]">{p.command}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Git/Vault Sync */}
      {(vmInfo?.hostname || vmInfo?.platform) && (
        <div className="card p-6">
          <h3 className="font-bold dark:text-[#E0E0E6] text-gray-900 mb-4 flex items-center gap-2">
            <GitBranch size={20} />
            Git/Vault Sync
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="dark:text-[#7A7A85] text-gray-600">Host</span>
              <span className="font-semibold dark:text-[#E0E0E6] text-gray-900">{vmInfo?.hostname || '—'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="dark:text-[#7A7A85] text-gray-600">Platform</span>
              <span className="font-semibold dark:text-[#E0E0E6] text-gray-900">{vmInfo?.platform || '—'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Cloud vs Local Services */}
      {(cloudServices.length > 0 || localServices.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ServiceList title="Cloud Services" items={cloudServices} />
          <ServiceList title="Local Services" items={localServices} />
        </div>
      )}

      {/* Kernel Info */}
      {stats?.kernel && (
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs dark:text-[#7A7A85] text-gray-500 font-mono">Kernel: {stats.kernel}</span>
            <span className="text-xs dark:text-[#7A7A85] text-gray-500 font-mono">
              {stats.timestamp ? new Date(stats.timestamp).toLocaleString() : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
