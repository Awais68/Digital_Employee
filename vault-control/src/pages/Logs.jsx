import { useState, useEffect } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import axios from 'axios'

// Dummy data for logs
const DUMMY_LOGS = Array.from({ length: 100 }, (_, i) => ({
  id: `log-${i}`,
  timestamp: new Date(Date.now() - i * 3600000).toISOString(),
  service: ['Gmail', 'WhatsApp', 'LinkedIn', 'Twitter', 'Facebook', 'Odoo'][Math.floor(Math.random() * 6)],
  action: ['email_send', 'payment_process', 'post_published', 'file_synced', 'email_received'][Math.floor(Math.random() * 5)],
  target: i % 2 === 0 ? 'user@example.com' : 'project-vault/updates',
  status: ['success', 'failed', 'pending'][Math.floor(Math.random() * 3)],
  details: { info: 'System operation completed successfully', code: 200 }
}));

export default function Logs() {
  const [logs, setLogs] = useState([])
  const [filters, setFilters] = useState({
    service: 'All',
    action: 'All',
    status: 'All',
  })
  const [page, setPage] = useState(0)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [expandedLog, setExpandedLog] = useState(null)
  const [loading, setLoading] = useState(true)

  const limit = 50

  useEffect(() => {
    fetchLogs()
    if (autoRefresh) {
      const interval = setInterval(fetchLogs, 30000)
      return () => clearInterval(interval)
    }
  }, [filters, page, autoRefresh])

  const fetchLogs = async () => {
    setLoading(true)
    /*
    try {
      const query = new URLSearchParams({
        service: filters.service,
        action: filters.action,
        status: filters.status,
        limit,
        offset: page * limit,
      })
      const res = await axios.get(`/api/logs?${query}`)
      setLogs(res.data.logs)
    } catch (err) {
      console.error('Failed to fetch logs:', err)
    } finally {
      setLoading(false)
    }
    */
    setTimeout(() => {
      let filtered = [...DUMMY_LOGS]
      if (filters.service !== 'All') filtered = filtered.filter(l => l.service === filters.service)
      if (filters.action !== 'All') filtered = filtered.filter(l => l.action === filters.action)
      if (filters.status !== 'All') filtered = filtered.filter(l => l.status === filters.status)
      
      const paginated = filtered.slice(page * limit, (page + 1) * limit)
      setLogs(paginated)
      setLoading(false)
    }, 500)
  }

  const services = ['All', 'Gmail', 'WhatsApp', 'LinkedIn', 'Twitter', 'Facebook', 'Odoo']
  const actions = ['All', 'email_send', 'payment_process', 'post_published', 'file_synced', 'email_received']
  const statuses = ['All', 'success', 'failed', 'pending']

  const getStatusColor = (status) => {
    switch (status) {
      case 'success': return 'bg-green-500'
      case 'failed': return 'bg-red-500'
      case 'pending': return 'bg-yellow-500'
      default: return 'bg-gray-500'
    }
  }

  const handleExport = () => {
    const csv = [
      ['Timestamp', 'Service', 'Action', 'Target', 'Status'],
      ...logs.map(log => [
        new Date(log.timestamp).toISOString(),
        log.service,
        log.action,
        log.target,
        log.status,
      ])
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'logs.csv'
    a.click()
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="card p-4 grid grid-cols-4 gap-4">
        <div>
          <label className="block text-xs dark:text-[#7A7A85] text-gray-600 mb-2 font-semibold">SERVICE</label>
          <select
            value={filters.service}
            onChange={(e) => {
              setFilters({ ...filters, service: e.target.value })
              setPage(0)
            }}
            className="w-full px-3 py-2 rounded dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-50 text-gray-900 text-sm"
          >
            {services.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs dark:text-[#7A7A85] text-gray-600 mb-2 font-semibold">ACTION</label>
          <select
            value={filters.action}
            onChange={(e) => {
              setFilters({ ...filters, action: e.target.value })
              setPage(0)
            }}
            className="w-full px-3 py-2 rounded dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-50 text-gray-900 text-sm"
          >
            {actions.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs dark:text-[#7A7A85] text-gray-600 mb-2 font-semibold">STATUS</label>
          <select
            value={filters.status}
            onChange={(e) => {
              setFilters({ ...filters, status: e.target.value })
              setPage(0)
            }}
            className="w-full px-3 py-2 rounded dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-50 text-gray-900 text-sm"
          >
            {statuses.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="flex items-end gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 flex-1 px-3 py-2 rounded dark:bg-[#1A1A24] dark:text-[#7A7A85] bg-gray-100 text-gray-600 text-sm hover:dark:bg-[#00FF88]/10"
          >
            <Download size={16} />
            Export
          </button>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            <span className="text-xs dark:text-[#7A7A85] text-gray-600">Auto</span>
          </label>
        </div>
      </div>

      {/* Logs Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="dark:bg-[#1A1A24] bg-gray-50 border-b dark:border-[#1A1A24] border-gray-200">
                <th className="px-4 py-3 text-left dark:text-[#7A7A85] text-gray-600 font-semibold">Timestamp</th>
                <th className="px-4 py-3 text-left dark:text-[#7A7A85] text-gray-600 font-semibold">Service</th>
                <th className="px-4 py-3 text-left dark:text-[#7A7A85] text-gray-600 font-semibold">Action</th>
                <th className="px-4 py-3 text-left dark:text-[#7A7A85] text-gray-600 font-semibold">Target</th>
                <th className="px-4 py-3 text-left dark:text-[#7A7A85] text-gray-600 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-4 py-8 text-center">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 dark:border-[#00FF88] border-blue-500" />
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-4 py-8 text-center dark:text-[#7A7A85] text-gray-500">
                    No logs found
                  </td>
                </tr>
              ) : (
                logs.map((log, idx) => (
                  <tr
                    key={log.id}
                    className="border-b dark:border-[#1A1A24] border-gray-100 hover:dark:bg-[#1A1A24] hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpandedLog(expandedLog === idx ? null : idx)}
                  >
                    <td className="px-4 py-3 dark:text-[#7A7A85] text-gray-600">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 dark:text-[#E0E0E6] text-gray-900 font-semibold">
                      {log.service}
                    </td>
                    <td className="px-4 py-3 dark:text-[#E0E0E6] text-gray-900">
                      {log.action}
                    </td>
                    <td className="px-4 py-3 dark:text-[#7A7A85] text-gray-600 truncate">
                      {log.target}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${getStatusColor(log.status)}`} />
                        <span className="text-xs font-semibold capitalize">{log.status}</span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Expanded Details */}
        {expandedLog !== null && logs[expandedLog] && (
          <div className="p-4 dark:bg-[#1A1A24] bg-gray-50 border-t dark:border-[#1A1A24] border-gray-200">
            <pre className="text-xs dark:text-[#7A7A85] text-gray-600 overflow-auto max-h-40">
              {JSON.stringify(logs[expandedLog], null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm dark:text-[#7A7A85] text-gray-600">
          Showing {page * limit + 1} - {Math.min((page + 1) * limit, logs.length)} of {logs.length} logs
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="px-3 py-2 rounded dark:bg-[#1A1A24] dark:text-[#7A7A85] bg-gray-100 text-gray-600 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-3 py-2 dark:text-[#E0E0E6] text-gray-900 font-medium">
            Page {page + 1}
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={logs.length < limit}
            className="px-3 py-2 rounded dark:bg-[#1A1A24] dark:text-[#7A7A85] bg-gray-100 text-gray-600 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
