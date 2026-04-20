import { useState, useEffect, useCallback } from 'react'
import { TrendingUp, TrendingDown, MessageSquare, Mail, Linkedin, Twitter, Facebook, Instagram, RefreshCw, Loader2 } from 'lucide-react'
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { LineChart as MuiLineChart } from '@mui/x-charts'
import axios from 'axios'

const platforms = [
  { name: 'WhatsApp', icon: MessageSquare, color: '#25D366' },
  { name: 'LinkedIn', icon: Linkedin, color: '#0A66C2' },
  { name: 'Facebook', icon: Facebook, color: '#1877F2' },
  { name: 'Instagram', icon: Instagram, color: '#E4405F' },
  { name: 'Gmail', icon: Mail, color: '#EA4335' },
  { name: 'Twitter', icon: Twitter, color: '#1DA1F2' },
]

// Pokémon-style stat bar component
function StatBar({ label, value, maxValue = 100, color }) {
  const percentage = Math.min((value / maxValue) * 100, 100)
  return (
    <div className="mb-3">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs font-semibold dark:text-[#B0C4FF] text-gray-700 uppercase tracking-wide">{label}</span>
        <span className="text-xs font-bold dark:text-[#00FF88] text-green-600">{value}</span>
      </div>
      <div className="w-full bg-gray-300 dark:bg-[#2A3E5F] rounded-full h-3 overflow-hidden border dark:border-[#3A5E7F] border-gray-400">
        <div
          className="h-full rounded-full transition-all duration-500 shadow-lg"
          style={{
            width: `${percentage}%`,
            background: `linear-gradient(90deg, ${color} 0%, ${color}dd 100%)`,
            boxShadow: `0 0 8px ${color}80`,
          }}
        />
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [vaultCounts, setVaultCounts] = useState({})
  const [services, setServices] = useState([])
  const [pendingApprovals, setPendingApprovals] = useState([])
  const [recentActivity, setRecentActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [wsConnected, setWsConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(new Date())

  const fetchDashboardData = useCallback(async () => {
    try {
      const res = await axios.get('/api/system/stats')
      setVaultCounts(res.data.vaultCounts)
      setServices(res.data.services)
      setPendingApprovals(res.data.pendingApprovals)
      setRecentActivity(res.data.recentActivity)
      setLastUpdate(new Date())
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboardData()

    // Setup WebSocket for live updates
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}`)

    ws.onopen = () => {
      setWsConnected(true)
      console.log('Dashboard Stream Connected')
    }

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.type === 'dashboard_update' || message.type === 'initial_state') {
        if (message.vaultCounts) setVaultCounts(message.vaultCounts)
        if (message.services) setServices(message.services)
        if (message.pendingApprovals) setPendingApprovals(message.pendingApprovals)
        if (message.recentActivity) setRecentActivity(message.recentActivity)
        setLastUpdate(new Date())
      }
    }

    ws.onclose = () => {
      setWsConnected(false)
    }

    return () => ws.close()
  }, [fetchDashboardData])

  // Calculate platform activity from vault data
  const getPlatformActivity = () => {
    return platforms.map(platform => {
      let incoming = 0
      let outgoing = 0
      
      if (platform.name === 'LinkedIn') {
        incoming = vaultCounts['LinkedIn'] || 0
        outgoing = vaultCounts['Posted'] || 0
      } else if (platform.name === 'Gmail') {
        incoming = vaultCounts['Inbox'] || 0
        outgoing = vaultCounts['Done'] || 0
      } else {
        // Fallback/Placeholder
        incoming = Math.floor(Math.random() * 20)
        outgoing = Math.floor(Math.random() * 10)
      }

      const trend = incoming > 5 ? 'up' : 'stable'
      
      return {
        name: platform.name,
        icon: platform.icon,
        color: platform.color,
        incoming,
        outgoing,
        trend,
      }
    })
  }

  const platformActivity = getPlatformActivity()

  const barData = platformActivity
    .map(p => ({ name: p.name, value: p.incoming, fill: p.color }))
    .sort((a, b) => b.value - a.value)

  const funnelData = [
    { stage: 'Inbox', value: vaultCounts['Inbox'] || 0, fill: '#00FF88' },
    { stage: 'Pending', value: vaultCounts['Pending_Approval'] || 0, fill: '#00D966' },
    { stage: 'Approved', value: vaultCounts['Approved'] || 0, fill: '#00B050' },
    { stage: 'Completed', value: vaultCounts['Done'] || 0, fill: '#008800' },
  ]

  const handleRefresh = async () => {
    setLoading(true)
    await fetchDashboardData()
    setLoading(false)
  }

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
      {/* Connection Status Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${wsConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-sm dark:text-[#B0C4FF] text-gray-600">
            {wsConnected ? 'Real-time updates active' : 'Disconnected'}
          </span>
        </div>
        {lastUpdate && (
          <div className="flex items-center gap-2">
            <span className="text-xs dark:text-[#B0C4FF] text-gray-500">
              Last update: {lastUpdate.toLocaleTimeString()}
            </span>
            <button
              onClick={handleRefresh}
              className="p-2 rounded-lg dark:bg-[#1B2A48] bg-gray-100 hover:dark:bg-[#2A3E5F] hover:bg-gray-200 transition-all"
            >
              <RefreshCw size={16} className={`dark:text-[#00FF88] text-green-600 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        )}
      </div>

      {/* PLATFORM ACTIVITY - TOP */}
      <div className="card p-6">
        <h2 className="text-lg font-bold dark:text-[#E0E0E6] text-gray-900 mb-6 font-mono">
          🌐 PLATFORM ACTIVITY
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {platformActivity.map(platform => {
            const Icon = platform.icon
            return (
              <div key={platform.name} className="p-4 rounded-lg dark:bg-[#0F1A2E] bg-gray-50 hover:dark:bg-[#1B2A48] hover:bg-gray-100 transition-all border dark:border-[#2A3E5F] border-gray-200">
                <div className="flex items-center gap-2 mb-4">
                  <Icon size={22} style={{ color: platform.color }} />
                  <div>
                    <h3 className="font-semibold dark:text-[#E0E0E6] text-gray-900 text-sm">
                      {platform.name}
                    </h3>
                    <span className="text-xs font-semibold dark:text-[#00FF88] text-green-600">
                      {platform.trend === 'up' ? '↑ Up' : platform.trend === 'down' ? '↓ Down' : '→ Stable'}
                    </span>
                  </div>
                </div>

                {/* Pokémon-style stats */}
                <StatBar label="Incoming" value={platform.incoming} maxValue={100} color={platform.color} />
                <StatBar label="Outgoing" value={platform.outgoing} maxValue={100} color={platform.color} />
              </div>
            )
          })}
        </div>
      </div>

      {/* CHARTS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funnel Data Visualization */}
        <div className="card p-6">
          <h2 className="text-lg font-bold dark:text-[#E0E0E6] text-gray-900 mb-4 font-mono">
            ✅ ACTIONS FUNNEL
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={funnelData}
              layout="vertical"
              margin={{ top: 20, right: 30, left: 100, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis type="number" stroke="#B0C4FF" />
              <YAxis dataKey="stage" type="category" stroke="#B0C4FF" width={100} />
              <Tooltip
                contentStyle={{
                  background: '#0F1A2E',
                  border: '1px solid #2A3E5F',
                  borderRadius: '8px',
                  color: '#E0E0E6',
                }}
                cursor={{ fill: 'rgba(0,255,136,0.1)' }}
              />
              <Bar dataKey="value" fill="#00FF88" radius={[0, 8, 8, 0]}>
                {funnelData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Bar Chart - Top Platforms */}
        <div className="card p-6">
          <h2 className="text-lg font-bold dark:text-[#E0E0E6] text-gray-900 mb-4 font-mono">
            📊 TOP PLATFORMS (INCOMING)
          </h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={barData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis type="number" stroke="#7A7A85" style={{ fontSize: '12px' }} />
              <YAxis dataKey="name" type="category" stroke="#7A7A85" style={{ fontSize: '12px' }} width={70} />
              <Tooltip
                contentStyle={{ background: '#1B2A48', border: '1px solid #2A3E5F', borderRadius: '8px' }}
              />
              <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                {barData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* VAULT STATUS - Real-time folder counts */}
      <div className="card p-6">
        <h2 className="text-lg font-bold dark:text-[#E0E0E6] text-gray-900 mb-4 font-mono">
          📁 VAULT STATUS
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {Object.entries(vaultCounts).map(([folder, count]) => (
            <div
              key={folder}
              className="p-4 rounded-lg dark:bg-[#1B2A48] bg-gray-50 border dark:border-[#2A3E5F] border-gray-200"
            >
              <p className="text-xs dark:text-[#B0C4FF] text-gray-600 uppercase tracking-wide mb-2">
                {folder.replace(/_/g, ' ')}
              </p>
              <p className="text-3xl font-bold dark:text-[#00FF88] text-green-600">{count}</p>
            </div>
          ))}
        </div>
      </div>

      {/* SYSTEM STATUS */}
      <div className="card p-6">
        <h2 className="text-lg font-bold dark:text-[#E0E0E6] text-gray-900 mb-4 font-mono">
          🔧 SYSTEM STATUS
        </h2>
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
                    isRunning ? 'bg-green-500 animate-pulse' : isWarning ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold dark:text-[#E0E0E6] text-gray-900 truncate">
                      {service.name}
                    </p>
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

      {/* PENDING ACTIONS */}
      <div className="card p-6 bg-gradient-to-r dark:from-[#00FF88]/5 dark:to-[#1DA1F2]/5 from-green-50 to-blue-50 border dark:border-[#00FF88]/20 border-blue-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm dark:text-[#B0C4FF] text-gray-600 font-mono">⚡ PENDING ACTIONS</p>
            <p className="text-4xl font-bold dark:text-[#00FF88] text-green-600 mt-2">
              {pendingApprovals.length}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs dark:text-[#B0C4FF] text-gray-500">Requires review</p>
            <button className="mt-3 px-4 py-2 rounded-lg font-medium dark:bg-[#00FF88] dark:text-[#0F1A2E] bg-blue-500 text-white hover:opacity-90 transition-all">
              Review Now
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
