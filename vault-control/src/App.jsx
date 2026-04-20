import { useState, useEffect } from 'react'
import { Moon, Sun } from 'lucide-react'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import Dashboard from './pages/Dashboard'
import Approvals from './pages/Approvals'
import Emails from './pages/Emails'
import WhatsApp from './pages/WhatsApp'
import Todos from './pages/Todos'
import SocialMedia from './pages/SocialMedia'
import Accounting from './pages/Accounting'
import CloudStatus from './pages/CloudStatus'
import Logs from './pages/Logs'

export default function App() {
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('theme')
    if (saved) {
      setIsDark(saved === 'dark')
    } else {
      setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches)
    }
  }, [])

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [isDark])

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />
      case 'approvals':
        return <Approvals />
      case 'emails':
        return <Emails />
      case 'whatsapp':
        return <WhatsApp />
      case 'todos':
        return <Todos />
      case 'social':
        return <SocialMedia />
      case 'accounting':
        return <Accounting />
      case 'cloud':
        return <CloudStatus />
      case 'logs':
        return <Logs />
      default:
        return <Dashboard />
    }
  }

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDark ? 'dark bg-[#0F1A2E]' : 'bg-[#F9FAFB]'}`}>
      <div className="flex h-screen">
        <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} />
        
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar 
            isDark={isDark} 
            setIsDark={setIsDark}
            currentPage={currentPage}
          />
          
          <main className="flex-1 overflow-auto">
            <div className="p-6">
              {renderPage()}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
