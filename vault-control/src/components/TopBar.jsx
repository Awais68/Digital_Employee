import { Search, Bell, Moon, Sun, LogOut, User, FileText, FolderOpen, ArrowRight } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'
import NotificationBell from './NotificationBell'

const pageNames = {
  dashboard: 'Dashboard',
  approvals: 'Approvals',
  emails: 'Emails',
  whatsapp: 'WhatsApp',
  social: 'Social Media',
  accounting: 'Accounting',
  oracle: 'Oracle Cloud',
  logs: 'Logs',
  vault: 'Vault Editor',
}

const folderIcons = {
  Pending_Approval: FileText,
  Approved: FileText,
  Rejected: FileText,
  Emails: Bell,
  WhatsApp: FolderOpen,
  Social: FolderOpen,
  Logs: FolderOpen,
  Todos: FolderOpen,
  Drafts: FolderOpen,
}

export default function TopBar({ isDark, setIsDark, currentPage, setCurrentPage })  {
  const [searchFocus, setSearchFocus] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const { user, logout } = useAuth()
  const debounceRef = useRef(null)

  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([])
      return
    }

    setSearching(true)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await axios.get(`/api/system/search?q=${encodeURIComponent(searchQuery)}`)
        setSearchResults(res.data)
      } catch (err) {
        console.error('Search failed:', err)
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => clearTimeout(debounceRef.current)
    // eslint-disable-next-line react-hooks/set-state-in-effect
  }, [searchQuery])

  const handleResultClick = (result) => {
    // Map folder to page
    const folderToPage = {
      Pending_Approval: 'approvals',
      Approved: 'approvals',
      Rejected: 'approvals',
      Emails: 'emails',
      WhatsApp: 'whatsapp',
      Social: 'social',
      Logs: 'logs',
      Todos: 'todos',
      Drafts: 'approvals',
    }
    const page = folderToPage[result.folder] || 'dashboard'
    setCurrentPage(page)
    setSearchQuery('')
    setSearchFocus(false)
  }

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
      <div className="relative hidden sm:block">
        <div className={`
          flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 w-64
          dark:bg-[#1A1A24] dark:border dark:border-[#1A1A24]
          bg-gray-100 border border-gray-200
          ${searchFocus ? 'dark:border-[#00FF88]/50 border-blue-400 w-80' : ''}
        `}>
          <Search size={18} className="dark:text-[#7A7A85] text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search vault..."
            onFocus={() => setSearchFocus(true)}
            onBlur={() => setTimeout(() => setSearchFocus(false), 200)}
            className="bg-transparent outline-none text-sm w-full dark:text-[#E0E0E6] dark:placeholder-[#7A7A85] text-gray-900 placeholder-gray-500"
          />
        </div>
        {searchFocus && searchQuery.length >= 2 && (
          <div className="absolute top-10 left-0 w-96 card rounded-lg shadow-xl z-50 max-h-80 overflow-auto">
            {searching ? (
              <div className="p-4 text-center text-sm dark:text-[#7A7A85]">Searching...</div>
            ) : searchResults.length === 0 ? (
              <div className="p-4 text-center text-sm dark:text-[#7A7A85]">No results found</div>
            ) : (
              searchResults.map((result, i) => {
                const FolderIcon = folderIcons[result.folder] || FolderOpen
                return (
                  <button
                    key={i}
                    onMouseDown={() => handleResultClick(result)}
                    className="w-full flex items-center gap-3 p-3 text-left hover:dark:bg-[#1A1A24] hover:bg-gray-50 border-b last:border-0 dark:border-[#1A1A24] border-gray-100 transition-colors"
                  >
                    <FolderIcon size={16} className="dark:text-[#7A7A85] text-gray-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium dark:text-[#E0E0E6] text-gray-900 truncate">
                        {result.frontmatter.title || result.frontmatter.subject || result.filename}
                      </p>
                      <p className="text-xs dark:text-[#7A7A85] text-gray-500">
                        {result.folder}
                      </p>
                    </div>
                    <ArrowRight size={14} className="dark:text-[#7A7A85] text-gray-400" />
                  </button>
                )
              })
            )}
          </div>
        )}
      </div>

       {/* Right: Actions */}
       <div className="flex items-center gap-3">
         {/* Notifications */}
         <NotificationBell setCurrentPage={setCurrentPage} />

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

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 p-2 rounded-lg hover:dark:bg-[#1A1A24] hover:bg-gray-100 transition-colors"
          >
            <div className="w-8 h-8 rounded-full dark:bg-[#00FF88]/20 bg-blue-100 flex items-center justify-center">
              <User size={16} className="dark:text-[#00FF88] text-blue-500" />
            </div>
            {user && (
              <span className="text-sm dark:text-[#E0E0E6] text-gray-900 hidden sm:block">
                {user.username}
              </span>
            )}
          </button>
          {showUserMenu && (
            <div className="absolute right-0 top-10 w-56 card p-2 shadow-xl z-50">
              {user && (
                <div className="p-3 border-b dark:border-[#1A1A24] border-gray-100">
                  <p className="font-bold dark:text-[#E0E0E6] text-sm">{user.username}</p>
                  <p className="text-xs dark:text-[#7A7A85]">{user.email}</p>
                  <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded dark:bg-[#00FF88]/20 dark:text-[#00FF88] bg-blue-100 text-blue-600 font-bold uppercase">
                    {user.role}
                  </span>
                </div>
              )}
              <button
                onClick={() => {
                  logout()
                  setShowUserMenu(false)
                }}
                className="w-full flex items-center gap-2 p-3 rounded text-sm dark:text-red-400 text-red-600 hover:dark:bg-red-500/10 hover:bg-red-50 transition-colors"
              >
                <LogOut size={16} />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
