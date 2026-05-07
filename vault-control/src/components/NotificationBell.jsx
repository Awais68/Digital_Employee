import { useState, useEffect, useRef } from 'react'
import { Bell, X, Check } from 'lucide-react'

function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`
  return `${Math.floor(seconds / 86400)} day ago`
}

function getPriorityDot(priority) {
  const colors = {
    IMMEDIATE: 'bg-red-500',
    URGENT: 'bg-orange-500',
    NORMAL: 'bg-yellow-500',
    INFO: 'bg-green-500'
  }
  return colors[priority] || 'bg-gray-500'
}

export default function NotificationBell() {
  const [notifs, setNotifs] = useState([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    if (global.ws) {
      global.ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data)
          if (data.type === 'notification') {
            const notif = { ...data, id: Date.now(), timestamp: Date.now() }
            setNotifs(prev => [notif, ...prev].slice(0, 50))
            setUnread(prev => prev + 1)
            if (Notification.permission === 'granted') {
              new Notification(data.event, { body: typeof data.data === 'string' ? data.data : data.data?.message || '' })
            }
          }
        } catch (e) {}
      }
    }

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const markAllRead = () => {
    setUnread(0)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => { setOpen(!open); markAllRead() }}
        className="relative p-2 rounded-lg dark:bg-[#1A1A24] bg-gray-100 hover:dark:bg-[#2A2A3A] transition-colors"
      >
        <Bell size={18} className="dark:text-[#E0E0E6]" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 dark:bg-[#0D0D14] bg-white border dark:border-[#1A1A24] rounded-lg shadow-2xl z-50 max-h-96 overflow-y-auto">
          <div className="flex items-center justify-between p-3 border-b dark:border-[#1A1A24]">
            <h4 className="text-xs font-bold dark:text-[#E0E0E6] uppercase tracking-widest">Notifications</h4>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-[9px] dark:text-[#00FF88] hover:underline">
                Mark all read
              </button>
            )}
          </div>

          {notifs.length === 0 ? (
            <div className="p-6 text-center text-[10px] font-mono dark:text-[#7A7A85]">
              No notifications yet
            </div>
          ) : (
            notifs.map(n => (
              <div key={n.id} className={`p-3 border-b dark:border-[#1A1A24] hover:dark:bg-[#1A1A24]/50 transition-colors`}>
                <div className="flex items-start gap-2">
                  <span className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${getPriorityDot(n.priority)}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold dark:text-[#E0E0E6] truncate">{n.event}</p>
                    <p className="text-[10px] dark:text-[#7A7A85] mt-0.5 line-clamp-2">
                      {typeof n.data === 'string' ? n.data : n.data?.message || JSON.stringify(n.data)}
                    </p>
                    <small className="text-[9px] dark:text-[#7A7A85] mt-1 block">{timeAgo(n.timestamp)}</small>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
