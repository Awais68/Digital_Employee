import { Search, Bell, Moon, Sun, AlertCircle } from 'lucide-react'
import { useState } from 'react'

const pageNames = {
  dashboard: 'Dashboard',
  approvals: 'Approvals',
  emails: 'Emails',
  whatsapp: 'WhatsApp',
  social: 'Social Media',
  accounting: 'Accounting',
  cloud: 'Cloud Status',
  logs: 'Logs',
}

export default function TopBar({ isDark, setIsDark, currentPage }) {
  const [searchFocus, setSearchFocus] = useState(false)

  return (
    <div className={`
      h-16 border-b transition-all duration-200
      dark:bg-[#12121A] dark:border-[#1A1A24]
      bg-white border-gray-200
      flex items-center justify-between px-6 gap-4
    `}>
      {/* Left: Page Title */}
      <div className="flex-1 min-w-0">
        <h2 className="text-lg font-semibold dark:text-[#E0E0E6] text-gray-900 font-mono">
          {pageNames[currentPage]}
        </h2>
      </div>

      {/* Center: Search */}
      <div className={`
        hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg
        transition-all duration-200
        dark:bg-[#1A1A24] dark:border dark:border-[#1A1A24]
        bg-gray-100 border border-gray-200
        ${searchFocus ? 'dark:border-[#00FF88]/50 border-blue-400' : ''}
      `}>
        <Search size={18} className="dark:text-[#7A7A85] text-gray-500" />
        <input
          type="text"
          placeholder="Search vault..."
          onFocus={() => setSearchFocus(true)}
          onBlur={() => setSearchFocus(false)}
          className={`
            bg-transparent outline-none text-sm w-48
            dark:text-[#E0E0E6] dark:placeholder-[#7A7A85]
            text-gray-900 placeholder-gray-500
          `}
        />
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-3">
        {/* Notifications */}
        <button className="relative p-2 rounded-lg hover:dark:bg-[#1A1A24] hover:bg-gray-100 transition-colors">
          <Bell size={20} className="dark:text-[#7A7A85] text-gray-600" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        {/* System Status */}
        <div className="flex items-center gap-1 px-3 py-2 rounded-lg dark:bg-[#1A1A24] bg-gray-100 text-xs">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="dark:text-[#7A7A85] text-gray-600">OK</span>
        </div>

        {/* Theme Toggle */}
        <button
          onClick={() => setIsDark(!isDark)}
          className="p-2 rounded-lg hover:dark:bg-[#1A1A24] hover:bg-gray-100 transition-colors"
        >
          {isDark ? (
            <Sun size={20} className="text-[#00FF88]" />
          ) : (
            <Moon size={20} className="text-blue-600" />
          )}
        </button>
      </div>
    </div>
  )
}
