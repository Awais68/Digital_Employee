import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, XCircle, Clock, DollarSign, Mail, Share2, Loader2, AlertCircle, Undo2, Trash2 } from 'lucide-react'
import axios from 'axios'
import { useToast } from '../context/ToastContext'

const TABS = ['pending', 'approved', 'rejected']

const typeIcons = {
  PAYMENT: DollarSign,
  EMAIL: Mail,
  POST: Share2,
}

const typeColors = {
  PAYMENT: 'badge-payment',
  EMAIL: 'badge-email',
  POST: 'badge-post',
  OTHER: 'badge-other',
}

export default function Approvals() {
  const [activeTab, setActiveTab] = useState('pending')
  const [approvals, setApprovals] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)
  const [selectedForBulk, setSelectedForBulk] = useState(new Set())
  const [showUndo, setShowUndo] = useState(null)
  const { success, error: toastError, info } = useToast()

  useEffect(() => {
    fetchApprovals()
  }, [activeTab])

  const fetchApprovals = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let url = '/api/approvals'
      if (activeTab === 'approved') {
        url += '/approved'
      } else if (activeTab === 'rejected') {
        url += '/rejected'
      }
      
      const res = await axios.get(url)
      setApprovals(res.data)
    } catch (err) {
      console.error('Failed to fetch approvals:', err)
      setError('Failed to load approvals. Please try again.')
      setApprovals([])
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  // Optimistic update for approve
  const handleApprove = async (id) => {
    setActionLoading(id)
    
    // Optimistic update
    const itemToRemove = approvals.find(a => a.id === id)
    setApprovals(prev => prev.filter(a => a.id !== id))
    
    try {
      await axios.post(`/api/approvals/${id}/approve`)
      success('Item approved successfully')
      setShowUndo({ action: 'approved', item: itemToRemove, id })
      setTimeout(() => setShowUndo(null), 5000)
    } catch (err) {
      console.error('Failed to approve:', err)
      // Rollback
      setApprovals(prev => [...prev, itemToRemove])
      toastError('Failed to approve item')
    } finally {
      setActionLoading(null)
    }
  }

  // Optimistic update for reject
  const handleReject = async (id) => {
    setActionLoading(id)
    
    const itemToRemove = approvals.find(a => a.id === id)
    setApprovals(prev => prev.filter(a => a.id !== id))
    
    try {
      await axios.post(`/api/approvals/${id}/reject`)
      success('Item rejected')
      setShowUndo({ action: 'rejected', item: itemToRemove, id })
      setTimeout(() => setShowUndo(null), 5000)
    } catch (err) {
      console.error('Failed to reject:', err)
      setApprovals(prev => [...prev, itemToRemove])
      toastError('Failed to reject item')
    } finally {
      setActionLoading(null)
    }
  }

  // Undo last action
  const handleUndo = async () => {
    if (!showUndo) return
    
    try {
      if (showUndo.action === 'approved') {
        // Move back from Approved to Pending
        await axios.post(`/api/approvals/${showUndo.id}/undo`)
      } else {
        // Move back from Rejected to Pending
        await axios.post(`/api/approvals/${showUndo.id}/undo`)
      }
      setApprovals(prev => [showUndo.item, ...prev])
      setShowUndo(null)
      info('Action undone')
    } catch (err) {
      toastError('Failed to undo')
    }
  }

  // Bulk approve/reject
  const handleBulkAction = async (action) => {
    if (selectedForBulk.size === 0) return
    
    setActionLoading('bulk')
    const selectedIds = Array.from(selectedForBulk)
    
    // Optimistic update
    setApprovals(prev => prev.filter(a => !selectedIds.includes(a.id)))
    setSelectedForBulk(new Set())
    
    try {
      await Promise.all(
        selectedIds.map(id => axios.post(`/api/approvals/${id}/${action}`))
      )
      success(`${selectedIds.length} items ${action}d`)
    } catch (err) {
      console.error(`Bulk ${action} failed:`, err)
      fetchApprovals()
      toastError(`Failed to bulk ${action}`)
    } finally {
      setActionLoading(null)
    }
  }

  const toggleBulkSelect = (id) => {
    setSelectedForBulk(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectAll = () => {
    if (selectedForBulk.size === approvals.length) {
      setSelectedForBulk(new Set())
    } else {
      setSelectedForBulk(new Set(approvals.map(a => a.id)))
    }
  }

  const formatTime = (date) => {
    const d = new Date(date)
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const timeUntilExpiry = (expiryDate) => {
    const now = new Date()
    const expiry = new Date(expiryDate)
    const diffMs = expiry - now
    const diffMins = Math.floor(diffMs / 60000)
    
    if (diffMins < 0) return 'Expired'
    if (diffMins < 30) return `${diffMins}m left`
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h left`
    return `${Math.floor(diffMins / 1440)}d left`
  }

  const getExpiryColor = (expiryDate) => {
    const now = new Date()
    const expiry = new Date(expiryDate)
    const diffMins = Math.floor((expiry - now) / 60000)
    
    if (diffMins < 30) return 'animate-pulse text-red-500'
    if (diffMins < 120) return 'text-yellow-500'
    return 'text-gray-500'
  }

  const getItemType = (approval) => {
    if (approval.type) return approval.type
    if (approval.amount) return 'PAYMENT'
    if (approval.subject || approval.from) return 'EMAIL'
    if (approval.platform || approval.content) return 'POST'
    return 'OTHER'
  }

  return (
    <div className="space-y-6">
      {/* Undo Banner */}
      {showUndo && (
        <div className="flex items-center justify-between p-4 rounded-lg dark:bg-[#00FF88]/10 bg-green-50 border dark:border-[#00FF88]/30 border-green-200">
          <span className="text-sm dark:text-[#E0E0E6] text-gray-900">
            Item {showUndo.action}d successfully
          </span>
          <button
            onClick={handleUndo}
            className="flex items-center gap-2 px-3 py-1.5 rounded font-medium text-sm dark:bg-[#00FF88] dark:text-[#0A0A0F] bg-green-500 text-white hover:opacity-90"
          >
            <Undo2 size={14} />
            Undo
          </button>
        </div>
      )}

      {/* Tabs + Bulk Actions */}
      <div className="flex items-center justify-between border-b dark:border-[#1A1A24] border-gray-200">
        <div className="flex gap-2">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`
                px-4 py-3 font-medium text-sm transition-all border-b-2 capitalize
                ${activeTab === tab
                  ? 'dark:border-[#00FF88] dark:text-[#00FF88] border-blue-500 text-blue-600'
                  : 'dark:border-transparent dark:text-[#7A7A85] border-transparent text-gray-500 hover:dark:text-[#E0E0E6] hover:text-gray-700'
                }
              `}
            >
              {tab}
            </button>
          ))}
        </div>
        {activeTab === 'pending' && selectedForBulk.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm dark:text-[#7A7A85] text-gray-600">
              {selectedForBulk.size} selected
            </span>
            <button
              onClick={() => handleBulkAction('approve')}
              disabled={actionLoading === 'bulk'}
              className="px-3 py-1.5 rounded font-medium text-sm dark:bg-green-500/20 dark:text-green-400 bg-green-50 text-green-700 disabled:opacity-50"
            >
              {actionLoading === 'bulk' ? <Loader2 size={14} className="animate-spin" /> : 'Approve All'}
            </button>
            <button
              onClick={() => handleBulkAction('reject')}
              disabled={actionLoading === 'bulk'}
              className="px-3 py-1.5 rounded font-medium text-sm dark:bg-red-500/20 dark:text-red-400 bg-red-50 text-red-700 disabled:opacity-50"
            >
              Reject All
            </button>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-lg flex items-center gap-3 text-red-400 font-mono text-sm">
          <AlertCircle size={20} />
          {error}
          <button onClick={fetchApprovals} className="ml-auto underline hover:opacity-80">Retry</button>
        </div>
      )}

      {/* Approvals Grid */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="animate-spin text-[#00FF88]" size={32} />
            <p className="text-[#7A7A85] font-mono text-sm">LOADING {activeTab.toUpperCase()} ITEMS...</p>
          </div>
        ) : approvals.length === 0 ? (
          <div className="text-center py-12">
            <p className="dark:text-[#7A7A85] text-gray-500">No {activeTab} items</p>
          </div>
        ) : (
          approvals.map(approval => {
            const itemType = getItemType(approval)
            const Icon = typeIcons[itemType] || Share2
            const isSelected = selectedForBulk.has(approval.id)
            
            return (
              <div key={approval.id} className={`card p-6 transition-all ${isSelected ? 'dark:bg-[#00FF88]/5 border-[#00FF88]' : ''}`}>
                <div className="flex items-start gap-4">
                  {/* Bulk Select Checkbox */}
                  {activeTab === 'pending' && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleBulkSelect(approval.id)}
                      className="mt-1 w-4 h-4 rounded accent-[#00FF88]"
                    />
                  )}
                  
                  <div className="flex-1">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-3">
                      <Icon size={20} className={`${typeColors[itemType] && 'dark:text-[#00FF88]'}`} />
                      <span className={`badge ${typeColors[itemType] || 'badge-other'}`}>
                        {itemType}
                      </span>
                      {approval.amount && (
                        <span className="text-lg font-bold text-red-500">
                          ${approval.amount.toFixed ? approval.amount.toFixed(2) : approval.amount}
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <h3 className="text-lg font-bold dark:text-[#E0E0E6] text-gray-900 mb-2">
                      {approval.title || approval.subject || approval.filename || 'Untitled'}
                    </h3>

                    {/* Description */}
                    <p className="text-sm dark:text-[#7A7A85] text-gray-600 mb-4">
                      {approval.description || approval.preview || 'No description available'}
                    </p>

                    {/* Timestamps */}
                    <div className="flex items-center gap-6 text-xs">
                      <div>
                        <p className="dark:text-[#7A7A85] text-gray-500">Created</p>
                        <p className="dark:text-[#E0E0E6] text-gray-900 font-mono">
                          {formatTime(approval.createdAt || new Date())}
                        </p>
                      </div>
                      {activeTab === 'pending' && approval.expiresAt && (
                        <div>
                          <p className="dark:text-[#7A7A85] text-gray-500">Expires</p>
                          <p className={`font-mono font-bold ${getExpiryColor(approval.expiresAt)}`}>
                            {timeUntilExpiry(approval.expiresAt)}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 min-w-fit">
                    {activeTab === 'pending' && (
                      <>
                        <button
                          onClick={() => handleApprove(approval.id)}
                          disabled={actionLoading === approval.id}
                          className="flex items-center gap-2 px-3 py-2 rounded font-medium text-sm dark:bg-green-500/20 dark:text-green-400 bg-green-50 text-green-700 hover:dark:bg-green-500/30 hover:bg-green-100 transition-colors disabled:opacity-50"
                        >
                          {actionLoading === approval.id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                          Approve
                        </button>
                        <button
                          onClick={() => handleReject(approval.id)}
                          disabled={actionLoading === approval.id}
                          className="flex items-center gap-2 px-3 py-2 rounded font-medium text-sm dark:bg-red-500/20 dark:text-red-400 bg-red-50 text-red-700 hover:dark:bg-red-500/30 hover:bg-red-100 transition-colors disabled:opacity-50"
                        >
                          <XCircle size={16} />
                          Reject
                        </button>
                      </>
                    )}
                    {activeTab === 'approved' && (
                      <button className="flex items-center gap-2 px-3 py-2 rounded font-medium text-sm dark:bg-gray-500/20 dark:text-gray-400 bg-gray-50 text-gray-700">
                        View Details
                      </button>
                    )}
                    {activeTab === 'rejected' && (
                      <>
                        <button className="flex items-center gap-2 px-3 py-2 rounded font-medium text-sm dark:bg-gray-500/20 dark:text-gray-400 bg-gray-50 text-gray-700">
                          Reconsider
                        </button>
                        <button className="flex items-center gap-2 px-3 py-2 rounded font-medium text-sm dark:bg-red-500/20 dark:text-red-400 bg-red-50 text-red-700">
                          <Trash2 size={16} />
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
