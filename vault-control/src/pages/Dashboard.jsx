import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import {
  TrendingUp, TrendingDown, MessageSquare, Mail,
  Linkedin, Twitter, Facebook, Instagram, RefreshCw, Loader2, AlertCircle,
  Clock, CheckCircle, XCircle, FileText, Zap, Inbox, Users, Cpu, Rocket,
} from 'lucide-react'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  RadialBarChart, RadialBar, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import axios from 'axios'

const KPI_CARDS = [
  { label: 'Total Activity', key: 'total', icon: Zap, color: '#00FF88', bg: 'dark:bg-[#00FF88]/10 bg-green-50', border: 'dark:border-[#00FF88]/30 border-green-200' },
  { label: 'Pending Review', key: 'pendingApprovals', icon: Clock, color: '#FFB800', bg: 'dark:bg-[#FFB800]/10 bg-yellow-50', border: 'dark:border-[#FFB800]/30 border-yellow-200', page: 'approvals' },
  { label: 'Approved', key: 'approved', icon: CheckCircle, color: '#10B981', bg: 'dark:bg-[#10B981]/10 bg-green-50', border: 'dark:border-[#10B981]/30 border-green-200' },
  { label: 'Rejected', key: 'rejected', icon: XCircle, color: '#EF4444', bg: 'dark:bg-[#EF4444]/10 bg-red-50', border: 'dark:border-[#EF4444]/30 border-red-200', page: 'approvals' },
]

const PLATFORM_CONFIG = [
  { name: 'WhatsApp',  icon: MessageSquare, color: '#25D366', inboxKey: 'WhatsApp' },
  { name: 'LinkedIn',  icon: Linkedin,       color: '#0A66C2', inboxKey: 'LinkedIn' },
  { name: 'Facebook',  icon: Facebook,       color: '#1877F2', inboxKey: 'Facebook' },
  { name: 'Instagram', icon: Instagram,      color: '#E4405F', inboxKey: 'Instagram' },
  { name: 'Email',     icon: Mail,           color: '#EA4335', inboxKey: 'Inbox' },
  { name: 'Twitter',   icon: Twitter,        color: '#1DA1F2', inboxKey: 'Twitter' },
]

const StatBar = React.memo(function StatBar({ label, value, maxValue = 100, color }) {
  const pct = Math.min((value / maxValue) * 100, 100)
  return (
    <div className="mb-2">
      <div className="flex justify-between items-center mb-0.5">
        <span className="text-[10px] dark:text-[#B0C4FF] text-gray-700 uppercase tracking-wide">{label}</span>
        <span className="text-[10px] font-bold dark:text-[#00FF88] text-green-600">{value}</span>
      </div>
      <div className="w-full bg-gray-300 dark:bg-[#2A3E5F] rounded-full h-2 overflow-hidden border dark:border-[#3A5E7F] border-gray-400">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color} 0%, ${color}dd 100%)`, boxShadow: `0 0 6px ${color}80` }} />
      </div>
    </div>
  )
})

export default function Dashboard({ setCurrentPage }) {
  const [vaultCounts,      setVaultCounts]      = useState({})
  const [pendingApprovals, setPendingApprovals]  = useState([])
  const [recentActivity,   setRecentActivity]    = useState([])
  const [loading,          setLoading]           = useState(true)
  const [lastUpdate,       setLastUpdate]        = useState(new Date())
  const [error,            setError]             = useState(null)
  const [services,         setServices]          = useState([])
  const [workers,          setWorkers]           = useState({})
  const [autoPublishing,   setAutoPublishing]    = useState(false)
  const [publishResult,    setPublishResult]     = useState(null)
  const { isConnected: wsConnected } = useWebSocket((message) => {
    if (message.type === 'dashboard_update' || message.type === 'initial_state') {
      if (message.vaultCounts)      setVaultCounts(message.vaultCounts)
      if (message.pendingApprovals) setPendingApprovals(message.pendingApprovals)
      if (message.recentActivity)   setRecentActivity(message.recentActivity)
      if (message.services)         setServices(message.services)
      if (message.workers)          setWorkers(message.workers)
      setLastUpdate(new Date())
    }
  })

  const fetchDashboardData = useCallback(async () => {
    try {
      setError(null)
      const res = await axios.get('/api/system/stats')
      setVaultCounts(res.data.vaultCounts)
      setPendingApprovals(res.data.pendingApprovals)
      setRecentActivity(res.data.recentActivity)
      setServices(res.data.services)
      if (res.data.workers) setWorkers(res.data.workers)
      setLastUpdate(new Date())
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) setError('Authentication failed.')
      else if (err.response?.status === 500) setError('Server error.')
      else setError('Failed to connect to backend.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!cancelled) fetchDashboardData()
    const interval = setInterval(() => { if (!cancelled) fetchDashboardData() }, 10000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [fetchDashboardData])

  const kpiValues = useMemo(() => ({
    total: recentActivity.length,
    pendingApprovals: pendingApprovals.length,
    approved: vaultCounts['Approved'] || 0,
    rejected: vaultCounts['Rejected'] || 0,
  }), [recentActivity, pendingApprovals, vaultCounts])

  const platformRadar = useMemo(() => {
    const maxVal = Math.max(...PLATFORM_CONFIG.map(p => vaultCounts[p.inboxKey] || 0), 1)
    return PLATFORM_CONFIG.map(p => ({
      platform: p.name,
      volume: vaultCounts[p.inboxKey] || 0,
      fullMark: Math.ceil(maxVal * 1.2 || 10),
      color: p.color,
      icon: p.icon,
      page: p.name === 'WhatsApp' ? 'whatsapp' : p.name === 'Email' ? 'emails' : 'social',
    }))
  }, [vaultCounts])

  const radialData = useMemo(() => {
    return PLATFORM_CONFIG.map(p => ({
      name: p.name,
      value: vaultCounts[p.inboxKey] || 0,
      fill: p.color,
    })).sort((a, b) => b.value - a.value)
  }, [vaultCounts])

  if (loading && Object.keys(vaultCounts).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] space-y-4">
        <Loader2 className="w-12 h-12 animate-spin text-[#00FF88]" />
        <p className="text-[#7A7A85] font-mono tracking-widest animate-pulse">SYNCHRONIZING DIGITAL EMPLOYEE...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${wsConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-sm dark:text-[#B0C4FF] text-gray-600">{wsConnected ? 'Real-time updates active' : 'Disconnected'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs dark:text-[#B0C4FF] text-gray-500">Last update: {lastUpdate.toLocaleTimeString()}</span>
          <button onClick={() => { setLoading(true); fetchDashboardData().finally(() => setLoading(false)) }} className="p-2 rounded-lg dark:bg-[#1B2A48] bg-gray-100 hover:dark:bg-[#2A3E5F] hover:bg-gray-200 transition-all">
            <RefreshCw size={16} className={`dark:text-[#00FF88] text-green-600 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-lg flex items-center gap-3 text-red-400 font-mono text-sm">
          <AlertCircle size={20} />
          {error}
          <button onClick={fetchDashboardData} className="ml-auto underline hover:opacity-80">Retry</button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {KPI_CARDS.map(stat => {
          const Icon = stat.icon
          return (
            <div key={stat.label} onClick={() => stat.page ? setCurrentPage?.(stat.page) : undefined}
              className={`card p-4 border ${stat.border} ${stat.page ? 'cursor-pointer hover:scale-[1.02] transition-all' : ''}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs dark:text-[#7A7A85] text-gray-500 uppercase tracking-wide">{stat.label}</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: stat.color }}>{kpiValues[stat.key]}</p>
                </div>
                <div className={`p-3 rounded-lg ${stat.bg}`}>
                  <Icon size={20} style={{ color: stat.color }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Worker Status + Auto-Publish */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="text-lg font-bold dark:text-[#E0E0E6] text-gray-900 mb-4 font-mono flex items-center gap-2">
            <Cpu size={18} className="dark:text-[#00FF88] text-green-600" />
            BACKGROUND WORKERS
          </h2>
          <div className="space-y-3">
            {Object.keys(workers).length > 0 ? Object.entries(workers).map(([name, worker]) => (
              <div key={name} className={`flex items-center justify-between p-3 rounded-lg ${worker.running ? 'dark:bg-[#00FF88]/5 bg-green-50 border dark:border-[#00FF88]/20 border-green-200' : 'dark:bg-red-500/5 bg-red-50 border dark:border-red-500/20 border-red-200'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${worker.running ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                  <p className="text-sm font-semibold dark:text-[#E0E0E6] text-gray-900 capitalize">{name.replace('_', ' ')}</p>
                </div>
                <span className="text-xs dark:text-[#7A7A85]">{worker.running ? `Running (PID ${worker.pid})` : 'Stopped'}</span>
              </div>
            )) : <p className="text-sm dark:text-[#7A7A85] text-center py-4">No worker data</p>}
          </div>
        </div>
        <div className="card p-6">
          <h2 className="text-lg font-bold dark:text-[#E0E0E6] text-gray-900 mb-4 font-mono flex items-center gap-2">
            <Rocket size={18} className="dark:text-[#1DA1F2] text-blue-600" />
            AUTO-PUBLISH POSTS
          </h2>
          <div className="flex items-center justify-between p-4 rounded-lg dark:bg-[#1B2A48] bg-gray-50 border dark:border-[#2A3E5F] border-gray-200">
            <div>
              <p className="text-3xl font-bold dark:text-[#FFB800] text-yellow-600">{pendingApprovals.length}</p>
              <p className="text-xs dark:text-[#B0C4FF] text-gray-600 mt-1">Pending approval</p>
            </div>
            <button disabled className="px-4 py-2 rounded-lg font-bold dark:bg-[#00FF88] dark:text-[#0F1A2E] bg-blue-500 text-white opacity-50 cursor-not-allowed">
              <Rocket size={18} />
            </button>
          </div>
          {publishResult && (
            <div className={`mt-3 p-3 rounded-lg text-sm ${publishResult.success ? 'dark:bg-[#00FF88]/10 bg-green-50 text-green-600' : 'dark:bg-red-500/10 bg-red-50 text-red-600'}`}>
              {publishResult.success ? `Published ${publishResult.published}/${publishResult.total}` : `Failed: ${publishResult.message || publishResult.error}`}
            </div>
          )}
        </div>
      </div>

      {/* Platform Activity Cards */}
      <div className="card p-6">
        <h2 className="text-lg font-bold dark:text-[#E0E0E6] text-gray-900 mb-6 font-mono flex items-center gap-2">
          <Users size={18} className="dark:text-[#00FF88] text-green-600" />
          PLATFORM ACTIVITY
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {PLATFORM_CONFIG.map(p => {
            const Icon = p.icon
            const volume = vaultCounts[p.inboxKey] || 0
            return (
              <div key={p.name} onClick={() => setCurrentPage?.(p.name === 'WhatsApp' ? 'whatsapp' : p.name === 'Email' ? 'emails' : 'social')}
                className="p-4 rounded-lg dark:bg-[#0F1A2E] bg-gray-50 hover:dark:bg-[#1B2A48] hover:bg-gray-100 transition-all border dark:border-[#2A3E5F] border-gray-200 cursor-pointer">
                <div className="flex items-center gap-2 mb-4">
                  <Icon size={22} style={{ color: p.color }} />
                  <h3 className="font-semibold dark:text-[#E0E0E6] text-gray-900 text-sm">{p.name}</h3>
                </div>
                <StatBar label="Volume" value={volume} maxValue={Math.max(volume, 10)} color={p.color} />
              </div>
            )
          })}
        </div>
      </div>

      {/* RadarChart + 1 RadialBarChart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="text-lg font-bold dark:text-[#E0E0E6] text-gray-900 mb-4 font-mono">PLATFORM OVERVIEW</h2>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={platformRadar}>
              <PolarGrid stroke="rgba(255,255,255,0.08)" />
              <PolarAngleAxis dataKey="platform" stroke="#7A7A85" style={{ fontSize: '11px' }} />
              <PolarRadiusAxis angle={90} domain={[0, 'auto']} stroke="#7A7A85" style={{ fontSize: '10px' }} />
              <Radar name="Volume" dataKey="volume" stroke="#00FF88" fill="#00FF88" fillOpacity={0.25} strokeWidth={2} />
              <Tooltip contentStyle={{ background: '#1B2A48', border: '1px solid #2A3E5F', borderRadius: '8px', color: '#E0E0E6', fontSize: '12px' }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div className="card p-6">
          <h2 className="text-lg font-bold dark:text-[#E0E0E6] text-gray-900 mb-4 font-mono flex items-center gap-2">
            <Inbox size={18} className="dark:text-[#00FF88] text-green-600" />
            INBOX VOLUME
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <RadialBarChart innerRadius="20%" outerRadius="90%" data={radialData} startAngle={180} endAngle={-180}>
              <RadialBar dataKey="value" cornerRadius={8} background={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: '11px', color: '#B0C4FF' }} />
              <Tooltip contentStyle={{ background: '#1B2A48', border: '1px solid #2A3E5F', borderRadius: '8px', color: '#E0E0E6', fontSize: '12px' }} />
            </RadialBarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Vault Status */}
      <div className="card p-6">
        <h2 className="text-lg font-bold dark:text-[#E0E0E6] text-gray-900 mb-4 font-mono">VAULT STATUS</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {Object.entries(vaultCounts).map(([folder, count]) => (
            <div key={folder} onClick={() => setCurrentPage?.('vault')}
              className="p-4 rounded-lg dark:bg-[#1B2A48] bg-gray-50 border dark:border-[#2A3E5F] border-gray-200 cursor-pointer hover:dark:bg-[#2A3E5F] hover:bg-gray-100 transition-all">
              <p className="text-xs dark:text-[#B0C4FF] text-gray-600 uppercase tracking-wide mb-2">{folder.replace(/_/g, ' ')}</p>
              <p className="text-3xl font-bold dark:text-[#00FF88] text-green-600">{count}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── System Status ── */}
      <div className="card p-6">
        <h2 className="text-lg font-bold dark:text-[#E0E0E6] text-gray-900 mb-4 font-mono">SYSTEM STATUS</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {services.map(service => {
            const isRunning = service.status === 'running'
            const isWarning = service.status === 'warning'
            return (
              <div
                key={service.name}
                className={`p-4 rounded-lg border transition-all ${
                  isRunning
                    ? 'dark:bg-gradient-to-br dark:from-[#1B2A48] dark:to-[#0F1A2E] dark:border-[#00FF88]/30 bg-green-50 border-green-200'
                    : isWarning
                    ? 'dark:bg-gradient-to-br dark:from-[#2A2A1A] dark:to-[#1A1A0F] dark:border-[#FFB800]/30 bg-yellow-50 border-yellow-200'
                    : 'dark:bg-gradient-to-br dark:from-[#2A1A1A] dark:to-[#1A0F0F] dark:border-[#FF4444]/30 bg-red-50 border-red-200'
                }`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-3 h-3 rounded-full mt-1 ${
                    isRunning
                      ? 'bg-green-500 animate-pulse'
                      : isWarning
                      ? 'bg-yellow-500 animate-pulse'
                      : 'bg-red-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold dark:text-[#E0E0E6] text-gray-900 truncate">{service.name}</p>
                    <p className={`text-xs font-bold mt-1 ${
                      isRunning
                        ? 'dark:text-[#00FF88] text-green-600'
                        : isWarning
                        ? 'dark:text-[#FFB800] text-yellow-600'
                        : 'dark:text-[#FF4444] text-red-600'
                    }`}>
                      {service.status.toUpperCase()}
                    </p>
                  </div>
                </div>
                {service.uptime && (
                  <div className="space-y-2 text-xs dark:text-[#B0C4FF] text-gray-600">
                    <div className="flex justify-between">
                      <span>Uptime:</span>
                      <span className="font-semibold">{service.uptime}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Active:</span>
                      <span className="font-semibold">{service.lastActivity}</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Pending Actions */}
      <div className="card p-6 bg-gradient-to-r dark:from-[#00FF88]/5 dark:to-[#1DA1F2]/5 from-green-50 to-blue-50 border dark:border-[#00FF88]/20 border-blue-200">
        <div onClick={() => setCurrentPage?.('approvals')} className="flex items-center justify-between cursor-pointer">
          <div>
            <p className="text-sm dark:text-[#B0C4FF] text-gray-600 font-mono">PENDING ACTIONS</p>
            <p className="text-4xl font-bold dark:text-[#00FF88] text-green-600 mt-2">{pendingApprovals.length}</p>
          </div>
          <button onClick={() => setCurrentPage?.('approvals')} className="px-4 py-2 rounded-lg font-medium dark:bg-[#00FF88] dark:text-[#0F1A2E] bg-blue-500 text-white hover:opacity-90 transition-all">Review Now</button>
        </div>
      </div>
    </div>
  )
}
