import { Home, Mail, MessageCircle, CheckSquare, Share2, DollarSign, Cloud, FileText, Menu, X, ChevronLeft, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: Home, badge: null },
  { id: 'approvals', label: 'Approvals', icon: CheckSquare, badge: 'HITL' },
  { id: 'emails', label: 'Emails', icon: Mail, badge: '3' },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, badge: '5' },
  { id: 'todos', label: 'Todos', icon: CheckCircle2, badge: '12' },
  { id: 'social', label: 'Social Media', icon: Share2, badge: null },
  { id: 'accounting', label: 'Accounting', icon: DollarSign, badge: null },
  { id: 'cloud', label: 'Cloud Status', icon: Cloud, badge: null },
  { id: 'logs', label: 'Logs', icon: FileText, badge: null },
]

export default function Sidebar({ currentPage, setCurrentPage }) {
  const [isOpen, setIsOpen] = useState(false)
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
        fixed md:relative h-screen dark:bg-[#1B2A48] bg-white dark:border-r dark:border-[#2A3E5F] border-r border-gray-200
        transition-all duration-300 z-40
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        flex flex-col overflow-hidden
        ${isCollapsed ? 'w-20' : 'w-64'}
      `}>
        {/* Header with Collapse Button */}
        <div className="p-6 border-b dark:border-[#2A3E5F] border-gray-200 relative">
          {!isCollapsed && (
            <>
              <h1 className="text-2xl font-bold font-mono dark:text-[#00FF88] text-blue-600">
                VAULT_CTRL
              </h1>
              <p className="text-xs dark:text-[#B0C4FF] text-gray-500 mt-1">v1.0.0</p>
            </>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden md:block absolute top-6 right-4 dark:text-[#7A7A85] hover:dark:text-[#00FF88] text-gray-600 hover:text-blue-600"
          >
            <ChevronLeft size={20} className={`transition-transform ${isCollapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {menuItems.map(item => {
            const Icon = item.icon
            const isActive = currentPage === item.id
            return (
              <button
                key={item.id}
                onClick={() => {
                  setCurrentPage(item.id)
                  setIsOpen(false)
                }}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-2
                  transition-all duration-200 font-medium text-sm
                  ${isActive
                    ? 'dark:bg-[#00FF88]/10 dark:text-[#00FF88] bg-blue-50 text-blue-600 dark:border dark:border-[#00FF88]/30'
                    : 'dark:text-[#B0C4FF] text-gray-600 hover:dark:bg-[#2A3E5F] hover:bg-gray-50'
                  }
                  ${isCollapsed ? 'justify-center px-3' : ''}
                `}
                title={isCollapsed ? item.label : undefined}
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

        {/* Bottom Status */}
        <div className={`p-4 border-t dark:border-[#2A3E5F] border-gray-200 ${isCollapsed ? 'text-center' : ''}`}>
          <div className="flex items-center gap-2 text-xs dark:text-[#B0C4FF] text-gray-500">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            {!isCollapsed && <span>System Active</span>}
          </div>
          {!isCollapsed && (
            <p className="text-xs dark:text-[#B0C4FF] text-gray-500 mt-2 font-mono">
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
      </div>

      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  )
}
