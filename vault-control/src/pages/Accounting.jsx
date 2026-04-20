import { useState, useEffect } from 'react'
import { RefreshCw, TrendingUp, AlertCircle, Loader2 } from 'lucide-react'
import axios from 'axios'

export default function Accounting() {
  const [selectedPeriod, setSelectedPeriod] = useState('month')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    
    setError(null)
    try {
      const [summaryRes, transRes] = await Promise.all([
        axios.get('/api/odoo/summary'),
        axios.get('/api/odoo/transactions?limit=20')
      ])
      
      setSummary(summaryRes.data)
      setTransactions(transRes.data.transactions || [])
    } catch (err) {
      console.error('Failed to fetch Odoo data:', err)
      setError('Failed to connect to Odoo server. Please ensure the Odoo MCP is running.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const subscriptions = [
    { id: 1, name: 'Slack Pro', cost: 99, lastUsed: '2 days ago', action: 'Keep' },
    { id: 2, name: 'Unused Tool', cost: 49, lastUsed: '3 months ago', action: 'Cancel' },
    { id: 3, name: 'GitHub Enterprise', cost: 231, lastUsed: '1 hour ago', action: 'Keep' },
  ]

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-[#00FF88]" />
        <p className="text-[#7A7A85] font-mono">FETCHING ODOO LEDGER...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-lg flex items-center gap-3 text-red-400">
          <AlertCircle size={20} />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {/* Odoo Connection Status */}
      <div className="card p-6 bg-gradient-to-r dark:from-green-500/10 dark:to-[#12121A] from-green-50 to-white border-l-4 dark:border-l-green-500 border-l-green-500">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold dark:text-[#E0E0E6] text-gray-900 mb-2">Odoo Server</h3>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full animate-pulse ${error ? 'bg-red-500' : 'bg-green-500'}`} />
              <span className={`text-sm ${error ? 'text-red-400' : 'text-green-400'}`}>
                {error ? 'Connection Failed' : 'Running'}
              </span>
              <span className="text-xs dark:text-[#7A7A85] text-gray-500 ml-4">
                Last sync: {new Date().toLocaleTimeString()}
              </span>
            </div>
          </div>
          <button 
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded font-medium text-sm dark:bg-[#1A1A24] dark:text-[#00FF88] bg-gray-100 hover:dark:bg-[#00FF88]/10 disabled:opacity-50"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4 text-center">
          <p className="text-xs dark:text-[#7A7A85] text-gray-500 mb-2">Total Receivable</p>
          <p className="text-3xl font-bold dark:text-green-400 text-green-600">
            ${summary?.total_receivable?.toLocaleString() || '0.00'}
          </p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs dark:text-[#7A7A85] text-gray-500 mb-2">Total Payable</p>
          <p className="text-3xl font-bold dark:text-red-400 text-red-600">
            ${summary?.total_payable?.toLocaleString() || '0.00'}
          </p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs dark:text-[#7A7A85] text-gray-500 mb-2">Bank Balance</p>
          <p className="text-3xl font-bold dark:text-[#00FF88] text-blue-600">
            ${summary?.bank_balance?.toLocaleString() || '0.00'}
          </p>
        </div>
      </div>

      {/* Period Filter */}
      <div className="flex gap-2">
        {['week', 'month', 'quarter', 'year'].map(period => (
          <button
            key={period}
            onClick={() => setSelectedPeriod(period)}
            className={`px-4 py-2 rounded capitalize font-medium text-sm transition-all ${
              selectedPeriod === period
                ? 'dark:bg-[#00FF88] dark:text-[#0A0A0F] bg-blue-500 text-white'
                : 'dark:bg-[#1A1A24] dark:text-[#7A7A85] bg-gray-100 text-gray-600'
            }`}
          >
            {period}
          </button>
        ))}
      </div>

      {/* Transactions Table */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b dark:border-[#1A1A24] border-gray-200">
          <h3 className="font-bold dark:text-[#E0E0E6] text-gray-900 font-mono">RECENT TRANSACTIONS</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b dark:border-[#1A1A24] border-gray-200">
                <th className="px-4 py-2 text-left dark:text-[#7A7A85] text-gray-500">Date</th>
                <th className="px-4 py-2 text-left dark:text-[#7A7A85] text-gray-500">Description</th>
                <th className="px-4 py-2 text-left dark:text-[#7A7A85] text-gray-500">Partner</th>
                <th className="px-4 py-2 text-left dark:text-[#7A7A85] text-gray-500">Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length > 0 ? (
                transactions.map(tx => (
                  <tr key={tx.id} className="border-b dark:border-[#1A1A24] border-gray-100 hover:dark:bg-[#1A1A24] hover:bg-gray-50">
                    <td className="px-4 py-3 dark:text-[#7A7A85] text-gray-600">{tx.date}</td>
                    <td className="px-4 py-3 dark:text-[#E0E0E6] text-gray-900">{tx.name !== '/' ? tx.name : 'Journal Item'}</td>
                    <td className="px-4 py-3 dark:text-[#7A7A85] text-gray-600">{tx.partner_id?.[1] || 'N/A'}</td>
                    <td className={`px-4 py-3 font-semibold ${tx.debit > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {tx.debit > 0 ? '+' : '-'}${tx.debit > 0 ? tx.debit : tx.credit}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="px-4 py-8 text-center text-[#7A7A85] italic">No transactions found in this period</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CEO Briefing (Placeholder for real one if available) */}
      <div className="card p-6 bg-gradient-to-r dark:from-purple-500/10 dark:to-[#12121A] from-purple-50 to-white border-l-4 dark:border-l-purple-500 border-l-purple-500">
        <div className="flex items-start justify-between mb-4">
          <h3 className="font-bold dark:text-[#E0E0E6] text-gray-900 text-lg">Real-time Financial Insights</h3>
          <button className="px-3 py-1 rounded text-xs font-medium dark:bg-[#1A1A24] dark:text-[#00FF88] bg-gray-100">
            View Reports
          </button>
        </div>
        
        <div className="grid grid-cols-2 gap-6">
          <div>
            <h4 className="font-semibold dark:text-[#E0E0E6] text-gray-900 mb-3 flex items-center gap-2">
              <AlertCircle size={16} />
              Recent Alerts
            </h4>
            <ul className="space-y-1 text-sm dark:text-[#7A7A85] text-gray-600">
              <li>• {summary?.recent_invoices_count || 0} invoices created in the last 30 days</li>
              <li>• Total Payable: ${summary?.total_payable || 0}</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold dark:text-[#E0E0E6] text-gray-900 mb-3 flex items-center gap-2">
              <TrendingUp size={16} />
              Quick Summary
            </h4>
            <p className="text-sm dark:text-[#7A7A85] text-gray-600">
              Financial health is currently {summary?.bank_balance > 0 ? 'stable' : 'low'}. 
              You have {summary?.recent_invoices_count} active items in your ledger.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
