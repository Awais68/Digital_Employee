import {
  Home, Mail, MessageCircle, CheckSquare, Share2,
  DollarSign, Cloud, FileText, Menu, X, ChevronLeft, CheckCircle2,
  FolderOpen, Shield, Activity,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import axios from 'axios'

function WorkerStatus() {
  const [workers, setWorkers] = useState({})
  const [expanded, setExpanded] = useState(true)
  useEffect(() => {
    axios.get('/api/system/workers').then(r => setWorkers(r.data.workers || {})).catch(() => {})
    const iv = setInterval(() => {
      axios.get('/api/system/workers').then(r => setWorkers(r.data.workers || {})).catch(() => {})
    }, 30000)
    return () => clearInterval(iv)
  }, [])
  const workerList = Object.values(workers)
  const anyRunning = workerList.some(w => w.running)
  return (
    <div className="border-t dark:border-[#2A3E5F] border-gray-200">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-3 text-xs dark:text-[#B0C4FF] text-gray-500 hover:dark:bg-[#2A3E5F]/50 transition-colors"
      >
        <Activity size={14} />
        <span className="flex-1 text-left">Workers</span>
        <div className={`w-2 h-2 rounded-full ${anyRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-1">
          {workerList.length > 0 ? workerList.map(w => (
            <div key={w.name} className="flex items-center justify-between text-[10px]">
              <span className="dark:text-[#7A7A85] text-gray-500 truncate">{w.name.replace(/_/g, ' ')}</span>
              <div className={`w-1.5 h-1.5 rounded-full ${w.running ? 'bg-green-500' : 'bg-red-500'}`} />
            </div>
          )) : (
            <span className="text-[10px] dark:text-[#7A7A85]">No workers</span>
          )}
          <span className="text-[10px] dark:text-[#7A7A85] font-mono block mt-1">
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      )}
    </div>
  )
}

const menuItems = [
  { id: 'dashboard', label: 'Dashboard',     icon: Home,          badge: null   },
  { id: 'approvals', label: 'Approvals',     icon: CheckSquare,   badge: 'HITL' },
  { id: 'emails',    label: 'Emails',        icon: Mail,          badge: null   },
  { id: 'whatsapp',  label: 'WhatsApp',      icon: MessageCircle, badge: null   },
  { id: 'todos',     label: 'Todos',         icon: CheckCircle2,  badge: null   },
  { id: 'social',    label: 'Social Media',  icon: Share2,        badge: null   },
  { id: 'accounting',label: 'Accounting',    icon: DollarSign,    badge: null   },
  { id: 'cloud',     label: 'Cloud Status',  icon: Cloud,         badge: null   },
  { id: 'admin',     label: 'Admin',         icon: Shield,        badge: null   },
  { id: 'logs',      label: 'Logs',          icon: FileText,      badge: null   },
  { id: 'vault',     label: 'Vault Editor',  icon: FolderOpen,    badge: null   },
]

export default function Sidebar({ currentPage, setCurrentPage }) {
  const [isOpen,      setIsOpen]      = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 left-4 z-50 md:hidden dark:text-[#00FF88] text-blue-500"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <div className={`
        fixed md:relative h-screen dark:bg-[#1B2A48] bg-white
        dark:border-r dark:border-[#2A3E5F] border-r border-gray-200
        transition-all duration-300 z-40 flex flex-col overflow-hidden
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        ${isCollapsed ? 'w-20' : 'w-64'}
      `}>

        {/* Header */}
        <div className="p-6 border-b dark:border-[#2A3E5F] border-gray-200 relative">
          {!isCollapsed && (
            <>
              <h1 className="text-2xl font-bold font-mono dark:text-[#00FF88] text-blue-600">
                DIGITAL FTE
              </h1>
              <p className="text-xs dark:text-[#B0C4FF] text-gray-500 mt-1">AI Employee System</p>
            </>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden md:block absolute top-6 right-4 dark:text-[#7A7A85] hover:dark:text-[#00FF88] text-gray-600 hover:text-blue-600"
          >
            <ChevronLeft
              size={20}
              className={`transition-transform ${isCollapsed ? 'rotate-180' : ''}`}
            />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {menuItems.map(item => {
            const Icon     = item.icon
            const isActive = currentPage === item.id

            return (
              <button
                key={item.id}
                onClick={() => {
                  setCurrentPage(item.id)
                  setIsOpen(false)
                }}
                title={isCollapsed ? item.label : undefined}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-2
                  transition-all duration-200 font-medium text-sm
                  ${isActive
                    ? 'dark:bg-[#00FF88]/10 dark:text-[#00FF88] bg-blue-50 text-blue-600 dark:border dark:border-[#00FF88]/30'
                    : 'dark:text-[#B0C4FF] text-gray-600 hover:dark:bg-[#2A3E5F] hover:bg-gray-50'
                  }
                  ${isCollapsed ? 'justify-center px-3' : ''}
                `}
              >
                <Icon size={20} />
                {!isCollapsed && (
                  <>
                    <span>{item.label}</span>
                    {item.badge && (
                      <span className="ml-auto text-xs dark:bg-[#00FF88]/20 dark:text-[#00FF88] bg-blue-100 text-blue-600 px-2 py-0.5 rounded">
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </button>
            )
          })}
        </nav>

        {/* Worker Status — always mounted (hooks can't be conditional) */}
        {!isCollapsed && <WorkerStatus />}
      </div>

      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsOpen(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') setIsOpen(false) }}
          role="button"
          tabIndex={0}
          aria-label="Close sidebar overlay"
        />
      )}
    </>
  )
}
