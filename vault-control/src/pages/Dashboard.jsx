import { useState, useEffect, useCallback } from 'react'
import {
  TrendingUp, TrendingDown, MessageSquare, Mail,
  Linkedin, Twitter, Facebook, Instagram, RefreshCw, Loader2, AlertCircle,
  Clock, CheckCircle, XCircle, FileText, Zap,
} from 'lucide-react'
import {
  BarChart, Bar, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, PieChart, Pie,
} from 'recharts'
import axios from 'axios'

const platforms = [
  { name: 'WhatsApp',  icon: MessageSquare, color: '#25D366', inboxKey: 'WhatsApp',  doneKey: null },
  { name: 'LinkedIn',  icon: Linkedin,       color: '#0A66C2', inboxKey: 'LinkedIn',  doneKey: 'linkedInPosts' },
  { name: 'Facebook',  icon: Facebook,       color: '#1877F2', inboxKey: 'Facebook',  doneKey: null },
  { name: 'Instagram', icon: Instagram,      color: '#E4405F', inboxKey: 'Instagram', doneKey: null },
  { name: 'Gmail',     icon: Mail,           color: '#EA4335', inboxKey: 'Inbox',     doneKey: 'Done' },
  { name: 'Twitter',   icon: Twitter,        color: '#1DA1F2', inboxKey: 'Twitter',   doneKey: null },
]

// ─── Pokémon-style stat bar ────────────────────────────────────────────────────

function StatBar({ label, value, maxValue = 100, color }) {
  const percentage = Math.min((value / maxValue) * 100, 100)
  return (
    <div className="mb-3">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs font-semibold dark:text-[#B0C4FF] text-gray-700 uppercase tracking-wide">
          {label}
        </span>
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

// ─── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [vaultCounts,      setVaultCounts]      = useState({})
  const [services,         setServices]         = useState([])
  const [pendingApprovals, setPendingApprovals] = useState([])
  const [recentActivity,   setRecentActivity]   = useState([])
  const [loading,          setLoading]          = useState(true)
  const [wsConnected,      setWsConnected]      = useState(false)
  const [lastUpdate,       setLastUpdate]       = useState(new Date())
  const [error,            setError]            = useState(null)

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchDashboardData = useCallback(async () => {
    try {
      setError(null)
      const res = await axios.get('/api/system/stats')
      setVaultCounts(res.data.vaultCounts)
      setServices(res.data.services)
      setPendingApprovals(res.data.pendingApprovals)
      setRecentActivity(res.data.recentActivity)
      setLastUpdate(new Date())
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err)
      setError('Failed to connect to backend. Please ensure the server is running.')
    } finally {
      setLoading(false)
    }
  }, [])

  // ── WebSocket ──────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchDashboardData()

    // Connect to WebSocket server (port 3000 for both dev and production)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsPort = window.location.port === '5173' ? '3000' : window.location.port
    const wsUrl = `${protocol}//${window.location.hostname}${wsPort ? ':' + wsPort : ''}`
    
    let ws = new WebSocket(wsUrl)
    let reconnectTimer = null
    let retryCount = 0
    const maxRetries = 10

    const connect = () => {
      ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        setWsConnected(true)
        retryCount = 0
        console.log('Dashboard Stream Connected')
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'dashboard_update' || message.type === 'initial_state') {
            if (message.vaultCounts)      setVaultCounts(message.vaultCounts)
            if (message.services)         setServices(message.services)
            if (message.pendingApprovals) setPendingApprovals(message.pendingApprovals)
            if (message.recentActivity)   setRecentActivity(message.recentActivity)
            setLastUpdate(new Date())
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err)
        }
      }

      ws.onclose = () => {
        setWsConnected(false)
        
        if (retryCount < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, retryCount), 30000)
          retryCount++
          console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${retryCount}/${maxRetries})`)
          reconnectTimer = setTimeout(connect, delay)
        }
      }

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error)
      }
    }

    connect()

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      ws.close()
    }
  }, [fetchDashboardData])

  // ── Platform Activity (real data only, no Math.random) ────────────────────

  const getPlatformActivity = () =>
    platforms.map(platform => {
      // incoming = that platform's vault folder count (0 if folder doesn't exist)
      const incoming = vaultCounts[platform.inboxKey] || 0

      // outgoing = real done/posted count if mapped, otherwise 0 (no fake data)
      const outgoing = platform.doneKey ? (vaultCounts[platform.doneKey] || 0) : 0

      return {
        name:     platform.name,
        icon:     platform.icon,
        color:    platform.color,
        incoming,
        outgoing,
        trend:    incoming > 5 ? 'up' : 'stable',
      }
    })

  const platformActivity = getPlatformActivity()

  const barData = [...platformActivity]
    .map(p => ({ name: p.name, value: p.incoming, fill: p.color }))
    .sort((a, b) => b.value - a.value)

  // Line chart data: derive from recent activity timestamps
  const getTrendData = () => {
    const hours = ['12h ago', '10h', '8h', '6h', '4h', '2h', 'Now']
    const distribution = Array(hours.length).fill(0).map(() => ({ approvals: 0, emails: 0, social: 0 }))
    
    recentActivity.forEach(activity => {
      const activityTime = new Date(activity.timestamp || Date.now())
      const hoursAgo = Math.floor((Date.now() - activityTime.getTime()) / (1000 * 60 * 60))
      const index = Math.min(Math.floor(hoursAgo / 2), hours.length - 1)
      
      if (index >= 0 && index < hours.length) {
        const type = activity.type?.toLowerCase() || ''
        if (type.includes('approval') || type.includes('approve') || type.includes('reject')) {
          distribution[index].approvals++
        } else if (type.includes('email')) {
          distribution[index].emails++
        } else if (type.includes('social') || type.includes('post') || type.includes('linkedin') || type.includes('twitter')) {
          distribution[index].social++
        } else {
          // Default: add to approvals as general activity
          distribution[index].approvals++
        }
      }
    })

    return hours.map((hour, i) => ({
      time: hour,
      Approvals: distribution[i].approvals,
      Emails: distribution[i].emails,
      Social: distribution[i].social,
    }))
  }

  // Pie chart data: action type distribution
  const getPieData = () => {
    const typeCounts = {}
    recentActivity.forEach(activity => {
      const type = activity.action || activity.type || 'other'
      typeCounts[type] = (typeCounts[type] || 0) + 1
    })

    const colors = ['#00FF88', '#1DA1F2', '#FFB800', '#EA4335', '#8B5CF6', '#10B981']
    return Object.entries(typeCounts)
      .map(([name, value], i) => ({ name: name.replace(/_/g, ' '), value, fill: colors[i % colors.length] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)
  }

  const funnelData = [
    { stage: 'Inbox',     value: vaultCounts['Inbox']            || 0, fill: '#00FF88' },
    { stage: 'Pending',   value: vaultCounts['Pending_Approval'] || 0, fill: '#00D966' },
    { stage: 'Approved',  value: vaultCounts['Approved']         || 0, fill: '#00B050' },
    { stage: 'Completed', value: vaultCounts['Done']             || 0, fill: '#008800' },
  ]

  const trendData = getTrendData()
  const pieData = getPieData()
  const totalActivities = recentActivity.length

  const handleRefresh = async () => {
    setLoading(true)
    await fetchDashboardData()
    setLoading(false)
  }

  // ── Loading Screen ─────────────────────────────────────────────────────────

  if (loading && Object.keys(vaultCounts).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] space-y-4">
        <Loader2 className="w-12 h-12 animate-spin text-[#00FF88]" />
        <p className="text-[#7A7A85] font-mono tracking-widest animate-pulse">
          SYNCHRONIZING DIGITAL EMPLOYEE...
        </p>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Connection Status Bar ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${wsConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-sm dark:text-[#B0C4FF] text-gray-600">
            {wsConnected ? 'Real-time updates active' : 'Disconnected'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs dark:text-[#B0C4FF] text-gray-500">
            Last update: {lastUpdate.toLocaleTimeString()}
          </span>
          <button
            onClick={handleRefresh}
            className="p-2 rounded-lg dark:bg-[#1B2A48] bg-gray-100 hover:dark:bg-[#2A3E5F] hover:bg-gray-200 transition-all"
          >
            <RefreshCw
              size={16}
              className={`dark:text-[#00FF88] text-green-600 ${loading ? 'animate-spin' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* ── Error Banner ── */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-lg flex items-center gap-3 text-red-400 font-mono text-sm">
          <AlertCircle size={20} />
          {error}
          <button onClick={handleRefresh} className="ml-auto underline hover:opacity-80">Retry</button>
        </div>
      )}

      {/* ── Platform Activity ── */}
      <div className="card p-6">
        <h2 className="text-lg font-bold dark:text-[#E0E0E6] text-gray-900 mb-6 font-mono">
          🌐 PLATFORM ACTIVITY
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {platformActivity.map(platform => {
            const Icon = platform.icon
            return (
              <div
                key={platform.name}
                className="p-4 rounded-lg dark:bg-[#0F1A2E] bg-gray-50 hover:dark:bg-[#1B2A48] hover:bg-gray-100 transition-all border dark:border-[#2A3E5F] border-gray-200"
              >
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
                <StatBar label="Incoming" value={platform.incoming} maxValue={100} color={platform.color} />
                <StatBar label="Outgoing" value={platform.outgoing} maxValue={100} color={platform.color} />
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Quick Stats Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Activity', value: totalActivities, icon: Zap, color: 'text-[#00FF88]', bg: 'dark:bg-[#00FF88]/10 bg-green-50', border: 'dark:border-[#00FF88]/30 border-green-200' },
          { label: 'Pending Review', value: pendingApprovals.length, icon: Clock, color: 'text-[#FFB800]', bg: 'dark:bg-[#FFB800]/10 bg-yellow-50', border: 'dark:border-[#FFB800]/30 border-yellow-200' },
          { label: 'Approved', value: vaultCounts['Approved'] || 0, icon: CheckCircle, color: 'text-[#10B981]', bg: 'dark:bg-[#10B981]/10 bg-green-50', border: 'dark:border-[#10B981]/30 border-green-200' },
          { label: 'Rejected', value: vaultCounts['Rejected'] || 0, icon: XCircle, color: 'text-[#EF4444]', bg: 'dark:bg-[#EF4444]/10 bg-red-50', border: 'dark:border-[#EF4444]/30 border-red-200' },
        ].map(stat => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className={`card p-4 border ${stat.border}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs dark:text-[#7A7A85] text-gray-500 uppercase tracking-wide">{stat.label}</p>
                  <p className={`text-2xl font-bold ${stat.color} mt-1`}>{stat.value}</p>
                </div>
                <div className={`p-3 rounded-lg ${stat.bg}`}>
                  <Icon size={20} className={stat.color} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Activity Trend (Line + Area) */}
        <div className="card p-6">
          <h2 className="text-lg font-bold dark:text-[#E0E0E6] text-gray-900 mb-4 font-mono">
            📈 ACTIVITY TREND
          </h2>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="colorApprovals" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00FF88" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00FF88" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorEmails" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1DA1F2" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#1DA1F2" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorSocial" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="time" stroke="#7A7A85" style={{ fontSize: '11px' }} />
              <YAxis stroke="#7A7A85" style={{ fontSize: '11px' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: '#1B2A48',
                  border: '1px solid #2A3E5F',
                  borderRadius: '8px',
                  color: '#E0E0E6',
                  fontSize: '12px',
                }}
              />
              <Area type="monotone" dataKey="Approvals" stroke="#00FF88" fillOpacity={1} fill="url(#colorApprovals)" strokeWidth={2} />
              <Area type="monotone" dataKey="Emails" stroke="#1DA1F2" fillOpacity={1} fill="url(#colorEmails)" strokeWidth={2} />
              <Area type="monotone" dataKey="Social" stroke="#8B5CF6" fillOpacity={1} fill="url(#colorSocial)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Action Type Distribution (Pie) */}
        <div className="card p-6">
          <h2 className="text-lg font-bold dark:text-[#E0E0E6] text-gray-900 mb-4 font-mono">
            🎯 ACTION DISTRIBUTION
          </h2>
          {pieData.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="55%" height={280}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: '#1B2A48',
                      border: '1px solid #2A3E5F',
                      borderRadius: '8px',
                      color: '#E0E0E6',
                      fontSize: '12px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {pieData.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: item.fill }} />
                      <span className="dark:text-[#B0C4FF] text-gray-700 capitalize">{item.name}</span>
                    </div>
                    <span className="font-bold dark:text-[#E0E0E6] text-gray-900">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[280px]">
              <p className="dark:text-[#7A7A85] text-gray-500 text-sm">No activity data yet</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Second Row Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Actions Funnel */}
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

        {/* Top Platforms Bar Chart */}
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
                contentStyle={{
                  background: '#1B2A48',
                  border: '1px solid #2A3E5F',
                  borderRadius: '8px',
                }}
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

      {/* ── Recent Activity Feed ── */}
      <div className="card p-6">
        <h2 className="text-lg font-bold dark:text-[#E0E0E6] text-gray-900 mb-4 font-mono flex items-center gap-2">
          <Clock size={18} className="dark:text-[#00FF88] text-green-600" />
          RECENT ACTIVITY
        </h2>
        {recentActivity.length > 0 ? (
          <div className="space-y-3 max-h-80 overflow-auto pr-2">
            {recentActivity.slice(0, 15).map((activity, i) => {
              const action = activity.action || activity.type || 'unknown'
              const isSuccess = activity.status === 'success' || action.includes('approve')
              const isWarning = activity.status === 'warning' || action.includes('pending')
              
              return (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg dark:bg-[#1B2A48] bg-gray-50 border dark:border-[#2A3E5F] border-gray-200 hover:dark:bg-[#2A3E5F] hover:bg-gray-100 transition-colors">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isSuccess 
                      ? 'dark:bg-[#00FF88]/20 bg-green-100' 
                      : isWarning 
                      ? 'dark:bg-[#FFB800]/20 bg-yellow-100' 
                      : 'dark:bg-[#FF4444]/20 bg-red-100'
                  }`}>
                    {isSuccess ? (
                      <CheckCircle size={16} className="dark:text-[#00FF88] text-green-600" />
                    ) : isWarning ? (
                      <Clock size={16} className="dark:text-[#FFB800] text-yellow-600" />
                    ) : (
                      <XCircle size={16} className="dark:text-[#FF4444] text-red-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium dark:text-[#E0E0E6] text-gray-900 truncate">
                      {activity.message || activity.description || action.replace(/_/g, ' ')}
                    </p>
                    <p className="text-xs dark:text-[#7A7A85] text-gray-500">
                      {activity.service || activity.target || 'system'}
                    </p>
                  </div>
                  <span className="text-xs dark:text-[#7A7A85] text-gray-400 whitespace-nowrap">
                    {activity.timestamp ? new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <FileText size={32} className="mx-auto dark:text-[#7A7A85] text-gray-400 mb-3" />
            <p className="dark:text-[#7A7A85] text-gray-500 text-sm">No recent activity</p>
          </div>
        )}
      </div>

      {/* ── Vault Status ── */}
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

      {/* ── System Status ── */}
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
                    isRunning
                      ? 'bg-green-500 animate-pulse'
                      : isWarning
                      ? 'bg-yellow-500 animate-pulse'
                      : 'bg-red-500'
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

      {/* ── Pending Actions ── */}
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
