import { useState, useEffect } from 'react'
import { Download, RefreshCw, Loader2, AlertCircle, Trash2, HardDrive, X } from 'lucide-react'
import axios from 'axios'
import usePolling from '../hooks/usePolling'

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
  const [error, setError] = useState(null)
  const [totalLogs, setTotalLogs] = useState(0)
  const [storage, setStorage] = useState(null)
  const [showClearModal, setShowClearModal] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [clearResult, setClearResult] = useState(null)

  const limit = 50

  useEffect(() => { fetchLogs() }, [filters, page])  // eslint-disable-line react-hooks/exhaustive-deps
  // Paused while the tab is hidden — a background tab must not poll the API.
  usePolling(() => fetchLogs(), 30000, autoRefresh)

  const fetchLogs = async () => {
    setLoading(true)
    setError(null)
    try {
      const query = new URLSearchParams({
        service: filters.service,
        action: filters.action,
        status: filters.status,
        limit,
        offset: page * limit,
      })
      const res = await axios.get(`/api/logs?${query}`)
      setLogs(Array.isArray(res.data) ? res.data : (res.data?.logs || []))
      setTotalLogs(res.data?.total ?? (Array.isArray(res.data) ? res.data.length : 0))
    } catch (err) {
      console.error('Failed to fetch logs:', err)
      setError('Failed to load logs. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStorage()
  }, [])

  const fetchStorage = async () => {
    try {
      const res = await axios.get('/api/logs/storage/stats')
      setStorage(res.data)
    } catch (err) {
      console.error('Failed to fetch log storage stats:', err)
    }
  }

  const formatBytes = (bytes) => {
    if (!bytes || bytes < 1024) return `${bytes || 0} B`
    const units = ['KB', 'MB', 'GB']
    let value = bytes / 1024
    let i = 0
    while (value >= 1024 && i < units.length - 1) {
      value /= 1024
      i++
    }
    return `${value.toFixed(1)} ${units[i]}`
  }

  const handleClearLogs = async (mode) => {
    setClearing(true)
    setClearResult(null)
    try {
      const res = await axios.delete(`/api/logs/storage?mode=${mode}&days=7`)
      const { freedBytes, truncated = [], deleted = [], failed = [] } = res.data
      setClearResult({
        ok: failed.length === 0,
        text: `Freed ${formatBytes(freedBytes)} — ${truncated.length} cleared, ${deleted.length} deleted`
          + (failed.length ? `, ${failed.length} failed` : ''),
      })
      await fetchStorage()
      setPage(0)
      await fetchLogs()
    } catch (err) {
      console.error('Failed to clear logs:', err)
      setClearResult({ ok: false, text: err.response?.data?.error || 'Failed to clear logs' })
    } finally {
      setClearing(false)
    }
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
      {/* Storage usage */}
      <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <HardDrive size={18} className="text-[#00FF88]" />
          <div>
            <div className="text-sm dark:text-[#E0E0E6] text-gray-900 font-semibold">
              Log storage: {storage ? formatBytes(storage.totalBytes) : '—'}
            </div>
            <div className="text-xs dark:text-[#7A7A85] text-gray-600">
              {storage ? `${storage.fileCount} files · ${formatBytes(storage.staleBytes)} older than 7 days` : 'Loading...'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {clearResult && (
            <span className={`text-xs font-mono ${clearResult.ok ? 'text-[#00FF88]' : 'text-red-400'}`}>
              {clearResult.text}
            </span>
          )}
          <button
            onClick={() => { setClearResult(null); setShowClearModal(true) }}
            className="flex items-center gap-2 px-3 py-2 rounded text-sm bg-red-500/10 text-red-400 border border-red-500/40 hover:bg-red-500/20"
          >
            <Trash2 size={16} />
            Clear Logs
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
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

      {/* Error Message */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-lg flex items-center gap-3 text-red-400 font-mono text-sm">
          <AlertCircle size={20} />
          {error}
          <button onClick={fetchLogs} className="ml-auto underline hover:opacity-80">Retry</button>
        </div>
      )}

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
                    <div className="flex flex-col items-center space-y-3">
                      <Loader2 className="animate-spin text-[#00FF88]" size={24} />
                      <span className="text-[#7A7A85] font-mono text-xs">LOADING LOGS...</span>
                    </div>
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
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm dark:text-[#7A7A85] text-gray-600">
          Showing {page * limit + 1} - {Math.min((page + 1) * limit, totalLogs)} of {totalLogs} logs
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

      {/* Clear Logs Modal */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-md p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold dark:text-[#E0E0E6] text-gray-900">Clear log files</h3>
                <p className="text-xs dark:text-[#7A7A85] text-gray-600 mt-1">
                  Currently using {storage ? formatBytes(storage.totalBytes) : '—'} on disk. This cannot be undone.
                </p>
              </div>
              <button
                onClick={() => setShowClearModal(false)}
                className="dark:text-[#7A7A85] text-gray-500 hover:opacity-70"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2">
              <button
                disabled={clearing}
                onClick={() => handleClearLogs('old')}
                className="w-full text-left px-3 py-3 rounded dark:bg-[#1A1A24] bg-gray-50 hover:dark:bg-[#00FF88]/10 hover:bg-gray-100 disabled:opacity-50"
              >
                <div className="text-sm font-semibold dark:text-[#E0E0E6] text-gray-900">
                  Delete logs older than 7 days
                </div>
                <div className="text-xs dark:text-[#7A7A85] text-gray-600">
                  Recommended · frees {storage ? formatBytes(storage.staleBytes) : '—'}
                </div>
              </button>

              <button
                disabled={clearing}
                onClick={() => handleClearLogs('truncate')}
                className="w-full text-left px-3 py-3 rounded dark:bg-[#1A1A24] bg-gray-50 hover:dark:bg-[#00FF88]/10 hover:bg-gray-100 disabled:opacity-50"
              >
                <div className="text-sm font-semibold dark:text-[#E0E0E6] text-gray-900">
                  Empty all log files
                </div>
                <div className="text-xs dark:text-[#7A7A85] text-gray-600">
                  Keeps files in place so running services keep writing
                </div>
              </button>

              <button
                disabled={clearing}
                onClick={() => handleClearLogs('all')}
                className="w-full text-left px-3 py-3 rounded bg-red-500/10 border border-red-500/40 hover:bg-red-500/20 disabled:opacity-50"
              >
                <div className="text-sm font-semibold text-red-400">
                  Delete everything
                </div>
                <div className="text-xs text-red-400/70">
                  Removes archived logs, empties the active ones
                </div>
              </button>
            </div>

            {clearing && (
              <div className="flex items-center gap-2 text-xs dark:text-[#7A7A85] text-gray-600">
                <Loader2 className="animate-spin" size={14} /> Clearing...
              </div>
            )}
            {clearResult && (
              <div className={`text-xs font-mono ${clearResult.ok ? 'text-[#00FF88]' : 'text-red-400'}`}>
                {clearResult.text}
              </div>
            )}

            <button
              onClick={() => setShowClearModal(false)}
              className="w-full px-3 py-2 rounded dark:bg-[#1A1A24] dark:text-[#7A7A85] bg-gray-100 text-gray-600 text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
