import { useState, useEffect, useRef } from 'react'
import { Bell, Check } from 'lucide-react'
import { useApp } from '../context/AppContext'

const TYPE_COLORS = {
  success: 'bg-green-500',
  error: 'bg-red-500',
  warning: 'bg-yellow-500',
  info: 'bg-blue-500',
  urgent: 'bg-orange-500',
}

const NOISE_PATTERNS = [
  'Post Published', 'Post Failed', 'Posts Pending Approval',
  'Task Created', 'Task Updated', 'Task marked',
]

function isUsefulNotification(n) {
  if (n.type === 'urgent' || n.type === 'warning' || n.type === 'error') return true
  const src = n.data?.source
  if (src === 'email' || src === 'whatsapp' || src === 'todo') return true
  const title = n.title || ''
  if (NOISE_PATTERNS.some(p => title.includes(p))) return false
  if (title.includes('Reminder') || title.includes('📧') || title.includes('📱') || title.includes('📝')) return true
  return false
}

function getPageFromNotification(n) {
  const src = n.data?.source
  const title = n.title || ''
  const msg = n.message || ''

  if (src === 'email' || title.includes('📧') || title.includes('Email') || msg.includes('email')) return 'emails'
  if (src === 'whatsapp' || title.includes('📱') || title.includes('WhatsApp')) return 'whatsapp'
  if (src === 'todo' || title.includes('📝') || title.includes('Todo') || title.includes('Task') || title.includes('Reminder')) return 'todos'
  if (src === 'social' || title.includes('Post') || title.includes('Draft')) return 'social'
  if (n.type === 'error' || n.type === 'warning') return 'logs'
  return null
}

export default function NotificationBell({ setCurrentPage }) {
  const { notifications, unreadCount, markAllRead } = useApp()
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef(null)
  const filteredNotifications = notifications.filter(isUsefulNotification)
  const unread = notifications.filter(n => !n.read && isUsefulNotification(n)).length

  useEffect(() => {
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

  const handleToggle = () => {
    setOpen(prev => !prev)
    if (!open && unread > 0) {
      markAllRead()
    }
  }

  const handleNotificationClick = (n) => {
    const page = getPageFromNotification(n)
    if (page && setCurrentPage) {
      setCurrentPage(page)
    }
    setOpen(false)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleToggle}
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
              <button onClick={handleToggle} className="text-[9px] dark:text-[#00FF88] hover:underline">
                Mark all read
              </button>
            )}
          </div>

          {filteredNotifications.length === 0 ? (
            <div className="p-6 text-center text-[10px] font-mono dark:text-[#7A7A85]">
              No important notifications
            </div>
          ) : (
            filteredNotifications.map(n => {
              const targetPage = getPageFromNotification(n)
              return (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`p-3 border-b dark:border-[#1A1A24] transition-colors ${
                    n.read ? '' : 'dark:bg-[#1A1A24]/40 bg-blue-50/30'
                  } ${targetPage ? 'cursor-pointer hover:dark:bg-[#1A1A24] hover:bg-gray-50' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${TYPE_COLORS[n.type] || 'bg-gray-500'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <p className="text-xs font-bold dark:text-[#E0E0E6] truncate">{n.title}</p>
                        {targetPage && (
                          <span className="text-[8px] dark:text-[#00FF88] text-blue-500 shrink-0">→ {targetPage}</span>
                        )}
                      </div>
                      <p className="text-[10px] dark:text-[#7A7A85] mt-0.5 line-clamp-2">{n.message}</p>
                      <small className="text-[9px] dark:text-[#7A7A85] mt-1 block opacity-60">
                        {n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}
                      </small>
                    </div>
                    {!n.read && (
                      <Check size={12} className="dark:text-[#00FF88] mt-1 flex-shrink-0" />
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}