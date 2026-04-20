import { Zap, RotateCw, Trash2 } from 'lucide-react'

export default function StatusIndicator({ service, status, uptime, lastActivity }) {
  const statusColor = {
    running: 'bg-green-500',
    warning: 'bg-yellow-500',
    offline: 'bg-red-500',
  }

  return (
    <div className="flex items-center justify-between p-4 rounded-lg card">
      <div className="flex items-center gap-4 flex-1">
        <div className={`w-3 h-3 rounded-full animate-pulse ${statusColor[status]}`} />
        
        <div className="flex-1">
          <p className="font-semibold dark:text-[#E0E0E6] text-gray-900 text-sm">
            {service}
          </p>
          <p className="text-xs dark:text-[#7A7A85] text-gray-500 mt-0.5">
            {status === 'offline' ? '—' : `Uptime: ${uptime}`}
          </p>
        </div>

        <div className="text-right">
          <p className="text-xs dark:text-[#00FF88] text-blue-600 font-mono">
            {status.toUpperCase()}
          </p>
          <p className="text-xs dark:text-[#7A7A85] text-gray-500 mt-1">
            {lastActivity || '—'}
          </p>
        </div>
      </div>

      <div className="flex gap-2 ml-4">
        <button className="p-1.5 hover:dark:bg-[#1A1A24] hover:bg-gray-100 rounded transition-colors">
          <RotateCw size={16} className="dark:text-[#7A7A85] text-gray-600" />
        </button>
        <button className="p-1.5 hover:dark:bg-[#1A1A24] hover:bg-gray-100 rounded transition-colors">
          <Trash2 size={16} className="dark:text-[#7A7A85] text-gray-600" />
        </button>
      </div>
    </div>
  )
}
