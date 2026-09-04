import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, GitBranch, RefreshCw } from 'lucide-react'
import axios from 'axios'
import usePolling from '../hooks/usePolling'

const REFRESH_INTERVAL = 30000 // 30s, and only while the tab is visible

// Utilisation colour follows the number, not the metric. Storage used to be
// hardcoded orange, so even a healthy VM looked like it was running out of space.
const OK = 70   // below this: healthy
const WARN = 90 // at/above this: critical

function usageBarColor(percent) {
  if (percent === null || percent === undefined) return 'bg-gray-400'
  if (percent >= WARN) return 'bg-red-500'
  if (percent >= OK) return 'bg-orange-500'
  return 'bg-green-500'
}

export default function CloudStatus() {
  const [vmInfo, setVmInfo] = useState(null)
  // Real VM numbers come from /api/oracle/stats (SSH into the box). vmInfo.metrics
  // looks like VM data but getVmInfo() fills it from getSystemMetrics(), i.e. *this*
  // machine's os/df — rendering it here made a full local disk read as "cloud storage
  // full". Never fall back to it for CPU/RAM/disk/uptime.
  const [stats, setStats] = useState(null)
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const fetchVmInfo = useCallback(async () => {
    try {
      const [vmRes, statsRes, oracleRes] = await Promise.all([
        axios.get('/api/system/vm-info'),
        axios.get('/api/system/stats').catch(() => null),
        axios.get('/api/oracle/stats').catch(() => null),
      ])
      setVmInfo(vmRes.data && typeof vmRes.data === 'object' ? vmRes.data : {})
      if (statsRes?.data?.services) setServices(statsRes.data.services)
      setStats(oracleRes?.data || null)
      setLastUpdated(new Date())
      setError(null)
    } catch (err) {
      setError(err.response?.data?.message || err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  usePolling(fetchVmInfo, REFRESH_INTERVAL)

  const vmOnline = vmInfo?.online
  const cpu = stats?.cpu || {}
  const mem = stats?.memory || {}
  const disk = stats?.disk || {}
  const pct = (v) => (v === null || v === undefined ? '\u2014' : `${v}%`)

  const cloudServices = services.filter(s =>
    ['Email MCP', 'Gmail Watcher', 'LinkedIn MCP'].includes(s.name)
  )
  const localServices = services.filter(s =>
    ['WhatsApp Watcher', 'Odoo MCP', 'Instagram Bot', 'Facebook Bot'].includes(s.name)
  )

  const ProgressBar = ({ used, total, label, color, unit = 'GB' }) => {
    const percent = total > 0 ? (used / total) * 100 : 0
    return (
      <div>
        <div className="flex justify-between mb-2">
          <span className="text-sm dark:text-[#7A7A85] text-gray-600">{label}</span>
          <span className="text-sm font-bold dark:text-[#E0E0E6] text-gray-900">
            {unit === '%' ? `${used}%` : `${used}/${total}${unit}`}
          </span>
        </div>
        <div className="w-full h-2 dark:bg-[#1A1A24] bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${color}`}
            style={{ width: `${Math.min(100, percent)}%` }}
          />
        </div>
      </div>
    )
  }

  const ServiceList = ({ title, items }) => (
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="animate-spin dark:text-[#00FF88] text-blue-500" size={32} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="card p-4 border-l-4 border-l-red-500 flex items-center gap-2">
          <AlertTriangle size={18} className="text-red-500" />
          <span className="text-sm dark:text-red-400 text-red-700">Failed to load VM info: {error}</span>
        </div>
      )}

      {/* VM Control */}
      <div className="card p-6 bg-gradient-to-r dark:from-blue-500/10 dark:to-[#12121A] from-blue-50 to-white border-l-4 dark:border-l-blue-500 border-l-blue-500">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-bold dark:text-[#E0E0E6] text-gray-900 text-lg">
              {vmInfo?.provider || 'Oracle Cloud'} VM
            </h3>
            <div className="flex items-center gap-2 mt-2">
              <div className={`w-3 h-3 rounded-full animate-pulse ${vmOnline ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className={`text-sm font-semibold ${vmOnline ? 'dark:text-green-400 text-green-600' : 'dark:text-red-400 text-red-600'}`}>
                {vmOnline ? 'ONLINE' : 'OFFLINE'}
              </span>
              {lastUpdated && (
                <span className="text-xs dark:text-[#7A7A85] text-gray-400 ml-2">
                  updated {lastUpdated.toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={fetchVmInfo}
            className="flex items-center gap-2 px-4 py-2 rounded font-medium text-sm transition-all dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-100 text-gray-900 hover:opacity-80"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
          <div>
            <p className="dark:text-[#7A7A85] text-gray-500">IP Address</p>
            <p className="font-mono dark:text-[#E0E0E6] text-gray-900">{vmInfo?.ip || '—'}</p>
          </div>
          <div>
            <p className="dark:text-[#7A7A85] text-gray-500">Region</p>
            <p className="font-semibold dark:text-[#E0E0E6] text-gray-900">{vmInfo?.region || '—'}</p>
          </div>
          <div>
            <p className="dark:text-[#7A7A85] text-gray-500">Uptime</p>
            <p className="font-semibold dark:text-[#E0E0E6] text-gray-900">{stats?.uptime || '\u2014'}</p>
          </div>
          <div>
            <p className="dark:text-[#7A7A85] text-gray-500">CPU</p>
            <p className="font-semibold dark:text-[#E0E0E6] text-gray-900">
              {cpu.cores || '—'} cores
            </p>
          </div>
        </div>

        {/* Resource Usage — live data */}
        <div className="space-y-3">
          <ProgressBar
            used={cpu.percent ?? 0}
            total={100}
            label={`CPU (load ${cpu.loadAvg?.['1m'] ?? '\u2014'})`}
            color={usageBarColor(cpu.percent)}
            unit="%"
          />
          <ProgressBar
            used={mem.used ?? 0}
            total={mem.total ?? 0}
            label={`RAM (${pct(mem.percent)})`}
            color={usageBarColor(mem.percent)}
            unit="MB"
          />
          <ProgressBar
            used={disk.used ?? 0}
            total={disk.total ?? 0}
            label={`Storage (${pct(disk.percent)})`}
            color={usageBarColor(disk.percent)}
          />
        </div>
      </div>

      {/* Sync Status */}
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

      {/* Cloud vs Local Delegation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ServiceList title="Cloud Services" items={cloudServices} />
        <ServiceList title="Local Services" items={localServices} />
      </div>
    </div>
  )
}
