import { useState } from 'react'
import { Power, AlertTriangle, GitBranch } from 'lucide-react'

export default function CloudStatus() {
  const [vmStatus, setVmStatus] = useState('offline')
  const [showConfirm, setShowConfirm] = useState(false)

  const toggleVM = (newStatus) => {
    if (newStatus === 'off') {
      setShowConfirm(true)
    } else {
      setVmStatus('online')
      setShowConfirm(false)
    }
  }

  const confirmTurnOff = () => {
    setVmStatus('offline')
    setShowConfirm(false)
  }

  const vmMetrics = {
    cpu: { used: 45, total: 100 },
    memory: { used: 8, total: 16 },
    disk: { used: 256, total: 500 },
  }

  const cloudServices = [
    { name: 'Email Triage', status: 'running' },
    { name: 'Post Drafts', status: 'running' },
    { name: 'LinkedIn Watch', status: 'running' },
  ]

  const localServices = [
    { name: 'WhatsApp Session', status: 'running' },
    { name: 'Payments', status: 'running' },
    { name: 'Approvals', status: 'running' },
  ]

  const ProgressBar = ({ used, total, label, color }) => {
    const percent = (used / total) * 100
    return (
      <div>
        <div className="flex justify-between mb-2">
          <span className="text-sm dark:text-[#7A7A85] text-gray-600">{label}</span>
          <span className="text-sm font-bold dark:text-[#E0E0E6] text-gray-900">{used}/{total}GB</span>
        </div>
        <div className="w-full h-2 dark:bg-[#1A1A24] bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${color}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Confirmation Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card p-6 max-w-md">
            <h3 className="font-bold dark:text-[#E0E0E6] text-gray-900 mb-3 flex items-center gap-2">
              <AlertTriangle size={20} className="text-yellow-500" />
              Turn Off Cloud VM?
            </h3>
            <p className="text-sm dark:text-[#7A7A85] text-gray-600 mb-4">
              All cloud watchers will stop. Are you sure?
            </p>
            <div className="flex gap-3">
              <button
                onClick={confirmTurnOff}
                className="flex-1 px-3 py-2 rounded font-medium text-sm dark:bg-red-500/20 dark:text-red-400 bg-red-50 text-red-700"
              >
                Yes, Turn Off
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-3 py-2 rounded font-medium text-sm dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-100 text-gray-900"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VM Control */}
      <div className="card p-6 bg-gradient-to-r dark:from-blue-500/10 dark:to-[#12121A] from-blue-50 to-white border-l-4 dark:border-l-blue-500 border-l-blue-500">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-bold dark:text-[#E0E0E6] text-gray-900 text-lg">Oracle Cloud VM</h3>
            <div className="flex items-center gap-2 mt-2">
              <div className={`w-3 h-3 rounded-full animate-pulse ${vmStatus === 'online' ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className={`text-sm font-semibold ${vmStatus === 'online' ? 'dark:text-green-400 text-green-600' : 'dark:text-red-400 text-red-600'}`}>
                {vmStatus === 'online' ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
          </div>
          <button
            onClick={() => toggleVM(vmStatus === 'online' ? 'off' : 'on')}
            className={`flex items-center gap-2 px-4 py-2 rounded font-medium text-sm transition-all ${
              vmStatus === 'online'
                ? 'dark:bg-red-500/20 dark:text-red-400 bg-red-50 text-red-700 hover:dark:bg-red-500/30'
                : 'dark:bg-green-500/20 dark:text-green-400 bg-green-50 text-green-700 hover:dark:bg-green-500/30'
            }`}
          >
            <Power size={16} />
            {vmStatus === 'online' ? 'Turn Off' : 'Turn On'}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
          <div>
            <p className="dark:text-[#7A7A85] text-gray-500">IP Address</p>
            <p className="font-mono dark:text-[#E0E0E6] text-gray-900">203.0.113.42</p>
          </div>
          <div>
            <p className="dark:text-[#7A7A85] text-gray-500">Region</p>
            <p className="font-semibold dark:text-[#E0E0E6] text-gray-900">US-Phoenix</p>
          </div>
          <div>
            <p className="dark:text-[#7A7A85] text-gray-500">Uptime</p>
            <p className="font-semibold dark:text-[#E0E0E6] text-gray-900">47d 8h</p>
          </div>
        </div>

        {/* Resource Usage */}
        <div className="space-y-3">
          <ProgressBar used={vmMetrics.cpu.used} total={vmMetrics.cpu.total} label="CPU" color="bg-blue-500" />
          <ProgressBar used={vmMetrics.memory.used} total={vmMetrics.memory.total} label="RAM" color="bg-purple-500" />
          <ProgressBar used={vmMetrics.disk.used} total={vmMetrics.disk.total} label="Storage" color="bg-orange-500" />
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
            <span className="dark:text-[#7A7A85] text-gray-600">Last sync</span>
            <span className="font-semibold dark:text-[#E0E0E6] text-gray-900">5 minutes ago</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="dark:text-[#7A7A85] text-gray-600">Files synced</span>
            <span className="font-semibold dark:text-[#E0E0E6] text-gray-900">247</span>
          </div>
          <button className="w-full px-4 py-2 rounded font-medium text-sm dark:bg-[#00FF88] dark:text-[#0A0A0F] bg-blue-500 text-white hover:opacity-90">
            Force Sync
          </button>
        </div>
      </div>

      {/* Cloud vs Local Delegation */}
      <div className="grid grid-cols-2 gap-6">
        {/* Cloud Services */}
        <div className="card p-6">
          <h3 className="font-bold dark:text-[#E0E0E6] text-gray-900 mb-4">Cloud Services</h3>
          <div className="space-y-3">
            {cloudServices.map((svc, i) => (
              <div key={i} className="flex items-center justify-between p-3 dark:bg-[#1A1A24] bg-gray-50 rounded">
                <span className="dark:text-[#E0E0E6] text-gray-900">{svc.name}</span>
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        </div>

        {/* Local Services */}
        <div className="card p-6">
          <h3 className="font-bold dark:text-[#E0E0E6] text-gray-900 mb-4">Local Services</h3>
          <div className="space-y-3">
            {localServices.map((svc, i) => (
              <div key={i} className="flex items-center justify-between p-3 dark:bg-[#1A1A24] bg-gray-50 rounded">
                <span className="dark:text-[#E0E0E6] text-gray-900">{svc.name}</span>
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Delegation Queue */}
      <div className="card p-6">
        <h3 className="font-bold dark:text-[#E0E0E6] text-gray-900 mb-4">Delegation Queue</h3>
        <p className="text-sm dark:text-[#7A7A85] text-gray-600 mb-4">
          Files waiting to be merged into Dashboard
        </p>
        <div className="flex gap-3">
          <button className="flex-1 px-4 py-2 rounded font-medium text-sm dark:bg-[#00FF88] dark:text-[#0A0A0F] bg-blue-500 text-white hover:opacity-90">
            Merge All
          </button>
          <button className="flex-1 px-4 py-2 rounded font-medium text-sm dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-100 text-gray-900">
            Review Each
          </button>
        </div>
      </div>
    </div>
  )
}
