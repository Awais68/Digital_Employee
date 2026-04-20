import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, Clock, DollarSign, Mail, Share2 } from 'lucide-react'
import axios from 'axios'

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

// Dummy data for approvals
const DUMMY_APPROVALS = [
  {
    id: '1',
    type: 'PAYMENT',
    title: 'AWS Monthly Invoice',
    description: 'Cloud infrastructure costs for April 2026.',
    amount: 1240.50,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    status: 'pending'
  },
  {
    id: '2',
    type: 'EMAIL',
    title: 'Newsletter to 5000+ Subscribers',
    description: 'Weekly tech digest featuring new AI integrations.',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    status: 'pending'
  },
  {
    id: '3',
    type: 'POST',
    title: 'LinkedIn: Product Update',
    description: 'Post about the new dashboard features.',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7200000).toISOString(),
    status: 'pending'
  },
  {
    id: '4',
    type: 'PAYMENT',
    title: 'Office Rent - April',
    description: 'Monthly rent for the main office space.',
    amount: 3500.00,
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    expiresAt: new Date(Date.now() - 86400000).toISOString(),
    status: 'approved'
  }
];

export default function Approvals() {
  const [activeTab, setActiveTab] = useState('pending')
  const [approvals, setApprovals] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchApprovals()
  }, [activeTab])

  const fetchApprovals = async () => {
    setLoading(true)
    /*
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
    } finally {
      setLoading(false)
    }
    */
    // Use dummy data based on tab
    setTimeout(() => {
      const filtered = DUMMY_APPROVALS.filter(a => {
        if (activeTab === 'pending') return a.status === 'pending'
        if (activeTab === 'approved') return a.status === 'approved'
        if (activeTab === 'rejected') return a.status === 'rejected'
        return true
      })
      setApprovals(filtered)
      setLoading(false)
    }, 500)
  }

  const handleApprove = async (id) => {
    // In dummy mode, just update local state or show alert
    console.log('Dummy Approve:', id)
    setApprovals(prev => prev.filter(a => a.id !== id))
    /*
    try {
      await axios.post(`/api/approvals/${id}/approve`)
      fetchApprovals()
    } catch (err) {
      console.error('Failed to approve:', err)
    }
    */
  }

  const handleReject = async (id) => {
    // In dummy mode, just update local state or show alert
    console.log('Dummy Reject:', id)
    setApprovals(prev => prev.filter(a => a.id !== id))
    /*
    try {
      await axios.post(`/api/approvals/${id}/reject`)
      fetchApprovals()
    } catch (err) {
      console.error('Failed to reject:', err)
    }
    */
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

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 border-b dark:border-[#1A1A24] border-gray-200">
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

      {/* Approvals Grid */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 dark:border-[#00FF88] border-blue-500" />
          </div>
        ) : approvals.length === 0 ? (
          <div className="text-center py-12">
            <p className="dark:text-[#7A7A85] text-gray-500">No {activeTab} items</p>
          </div>
        ) : (
          approvals.map(approval => {
            const Icon = typeIcons[approval.type] || Share2
            const isExpired = activeTab === 'pending' && new Date(approval.expiresAt) < new Date()
            
            return (
              <div key={approval.id} className="card p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-3">
                      <Icon size={20} className={`${typeColors[approval.type] && 'dark:text-[#00FF88]'}`} />
                      <span className={`badge ${typeColors[approval.type]}`}>
                        {approval.type}
                      </span>
                      {approval.amount && (
                        <span className="text-lg font-bold text-red-500">
                          ${approval.amount.toFixed(2)}
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <h3 className="text-lg font-bold dark:text-[#E0E0E6] text-gray-900 mb-2">
                      {approval.title}
                    </h3>

                    {/* Description */}
                    <p className="text-sm dark:text-[#7A7A85] text-gray-600 mb-4">
                      {approval.description}
                    </p>

                    {/* Timestamps */}
                    <div className="flex items-center gap-6 text-xs">
                      <div>
                        <p className="dark:text-[#7A7A85] text-gray-500">Created</p>
                        <p className="dark:text-[#E0E0E6] text-gray-900 font-mono">
                          {formatTime(approval.createdAt)}
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
                          className="flex items-center gap-2 px-3 py-2 rounded font-medium text-sm dark:bg-green-500/20 dark:text-green-400 bg-green-50 text-green-700 hover:dark:bg-green-500/30 hover:bg-green-100 transition-colors"
                        >
                          <CheckCircle size={16} />
                          Approve
                        </button>
                        <button
                          onClick={() => handleReject(approval.id)}
                          className="flex items-center gap-2 px-3 py-2 rounded font-medium text-sm dark:bg-red-500/20 dark:text-red-400 bg-red-50 text-red-700 hover:dark:bg-red-500/30 hover:bg-red-100 transition-colors"
                        >
                          <XCircle size={16} />
                          Reject
                        </button>
                        <button className="flex items-center gap-2 px-3 py-2 rounded font-medium text-sm dark:bg-blue-500/20 dark:text-blue-400 bg-blue-50 text-blue-700 hover:dark:bg-blue-500/30 hover:bg-blue-100 transition-colors">
                          Edit
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
