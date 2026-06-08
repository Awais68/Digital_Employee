import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, GitBranch, RefreshCw } from 'lucide-react'
import axios from 'axios'

const REFRESH_INTERVAL = 10000 // 10s live refresh

function formatUptime(seconds) {
  if (!seconds && seconds !== 0) return '—'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export default function CloudStatus() {
  const [vmInfo, setVmInfo] = useState(null)
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const fetchVmInfo = useCallback(async () => {
    try {
      const [vmRes, statsRes] = await Promise.all([
        axios.get('/api/system/vm-info'),
        axios.get('/api/system/stats').catch(() => null),
      ])
      setVmInfo(vmRes.data)
      if (statsRes?.data?.services) setServices(statsRes.data.services)
      setLastUpdated(new Date())
      setError(null)
    } catch (err) {
      setError(err.response?.data?.message || err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchVmInfo()
    const interval = setInterval(fetchVmInfo, REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchVmInfo])

  const vmOnline = vmInfo?.online
  const metrics = vmInfo?.metrics

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
            <p className="font-semibold dark:text-[#E0E0E6] text-gray-900">{formatUptime(metrics?.uptime)}</p>
          </div>
          <div>
            <p className="dark:text-[#7A7A85] text-gray-500">CPU</p>
            <p className="font-semibold dark:text-[#E0E0E6] text-gray-900">
              {metrics?.cpu?.cores || '—'} cores
            </p>
          </div>
        </div>

        {/* Resource Usage — live data */}
        <div className="space-y-3">
          <ProgressBar
            used={metrics?.cpu?.percent ?? 0}
            total={100}
            label={`CPU (load ${metrics?.cpu?.loadavg?.[0] ?? '—'})`}
            color="bg-blue-500"
            unit="%"
          />
          <ProgressBar
            used={metrics?.memory?.used ?? 0}
            total={metrics?.memory?.total ?? 0}
            label={`RAM (${metrics?.memory?.percent ?? 0}%)`}
            color="bg-purple-500"
          />
          <ProgressBar
            used={metrics?.disk?.used ?? 0}
            total={metrics?.disk?.total ?? 0}
            label={`Storage (${metrics?.disk?.percent ?? 0}%)`}
            color="bg-orange-500"
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
