import { useState, useEffect, useCallback } from 'react'
import { Shield, Key, Eye, EyeOff, Check, Loader2, AlertCircle, LogIn, RotateCcw, Server, Globe } from 'lucide-react'
import axios from 'axios'
import { useToast } from '../context/ToastContext'

const API_KEYS = [
  { key: 'gemini', label: 'Gemini API Key' },
  { key: 'openai', label: 'OpenAI API Key' },
  { key: 'openrouter', label: 'OpenRouter API Key' },
  { key: 'claude', label: 'Claude / Anthropic API Key' },
  { key: 'groq', label: 'Groq API Key' },
  { key: 'facebook', label: 'Facebook System User Token' },
  { key: 'instagram', label: 'Instagram Access Token' },
  { key: 'linkedin', label: 'LinkedIn Access Token' },
  { key: 'twitter_key', label: 'Twitter API Key' },
  { key: 'twitter_secret', label: 'Twitter API Secret' },
  { key: 'whatsapp', label: 'WhatsApp Cloud API Token' },
  { key: 'discord', label: 'Discord Bot Token' },
]

const SOURCE_STYLES = {
  thirdparty: {
    label: 'THIRD-PARTY ACTIVE',
    icon: Globe,
    className: 'dark:bg-[#00FF88]/20 dark:text-[#00FF88] bg-green-100 text-green-700',
  },
  backend: {
    label: 'BACKEND DEFAULT',
    icon: Server,
    className: 'dark:bg-[#FFB800]/20 dark:text-[#FFB800] bg-yellow-100 text-yellow-700',
  },
  none: {
    label: 'NOT SET',
    icon: AlertCircle,
    className: 'dark:bg-red-500/20 dark:text-red-400 bg-red-100 text-red-600',
  },
}

export default function AdminPanel() {
  const [token, setToken] = useState(localStorage.getItem('admin_token'))
  const [password, setPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [keys, setKeys] = useState([])
  const [keyValues, setKeyValues] = useState({})
  const [visibleKeys, setVisibleKeys] = useState({})
  const [busyKey, setBusyKey] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { success, error: toastError } = useToast()

  const logout = useCallback(() => {
    setToken(null)
    setKeys([])
    localStorage.removeItem('admin_token')
  }, [])

  const fetchKeys = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/admin/keys', {
        headers: { Authorization: `Bearer ${token}` },
      })
      setKeys(Array.isArray(res.data) ? res.data : [])
      setError(null)
    } catch (err) {
      if (err?.response?.status === 401 || err?.response?.status === 403) logout()
      else setError('Failed to load API keys')
    } finally {
      setLoading(false)
    }
  }, [token, logout])

  useEffect(() => {
    if (token) fetchKeys()
    else setLoading(false)
  }, [token, fetchKeys])

  const handleLogin = async () => {
    if (!password) return
    setLoginLoading(true)
    setLoginError('')
    try {
      const res = await axios.post('/api/admin/login', { password })
      localStorage.setItem('admin_token', res.data.token)
      setToken(res.data.token)
      setPassword('')
      success('Admin authenticated')
    } catch {
      setLoginError('Invalid password')
      toastError('Invalid password')
    } finally {
      setLoginLoading(false)
    }
  }

  const handleSaveKey = async (keyName) => {
    const value = (keyValues[keyName] || '').trim()
    if (!value) return
    setBusyKey(keyName)
    try {
      const res = await axios.put(`/api/admin/keys/${keyName}`, { value }, {
        headers: { Authorization: `Bearer ${token}` },
      })
      success(`${res.data.envVar} switched to third-party key`)
      setKeyValues(prev => ({ ...prev, [keyName]: '' }))
      await fetchKeys()
    } catch (err) {
      toastError(err?.response?.data?.error || `Failed to save ${keyName}`)
    } finally {
      setBusyKey(null)
    }
  }

  const handleRevert = async (keyName) => {
    setBusyKey(keyName)
    try {
      const res = await axios.delete(`/api/admin/keys/${keyName}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      success(res.data.source === 'backend'
        ? `${keyName} reverted to backend key`
        : `${keyName} override removed (no backend key left)`)
      await fetchKeys()
    } catch (err) {
      toastError(err?.response?.data?.error || `Failed to revert ${keyName}`)
    } finally {
      setBusyKey(null)
    }
  }

  if (!token) {
    return (
      <div className="max-w-md mx-auto mt-20 px-4">
        <div className="card p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <Shield size={28} className="dark:text-[#00FF88] text-blue-600" />
            <h1 className="text-xl font-bold dark:text-[#E0E0E6] text-gray-900 font-mono">ADMIN LOGIN</h1>
          </div>
          {loginError && (
            <div className="mb-4 flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
              <AlertCircle size={16} /> {loginError}
            </div>
          )}
          <div className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="Enter admin password"
              className="w-full px-4 py-3 rounded-lg dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-50 text-sm"
            />
            <button
              onClick={handleLogin}
              disabled={loginLoading || !password}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-bold dark:bg-[#00FF88] dark:text-[#0A0A0F] bg-blue-500 text-white disabled:opacity-50"
            >
              {loginLoading ? <Loader2 className="animate-spin" size={18} /> : <LogIn size={18} />}
              Authenticate
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[#00FF88]" />
      </div>
    )
  }

  const overrideCount = keys.filter(k => k.source === 'thirdparty').length

  return (
    <div className="max-w-2xl mx-auto space-y-6 px-4 sm:px-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Shield size={24} className="dark:text-[#00FF88] text-blue-600" />
          <h1 className="text-xl font-bold dark:text-[#E0E0E6] text-gray-900 font-mono">ADMIN PANEL</h1>
        </div>
        <button onClick={logout} className="text-xs dark:text-[#7A7A85] text-gray-500 underline shrink-0">
          Logout
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="card p-4 sm:p-6">
        <h2 className="text-lg font-bold dark:text-[#E0E0E6] text-gray-900 mb-1 font-mono flex items-center gap-2">
          <Key size={18} className="dark:text-[#FFB800] text-yellow-600" />
          API KEY MANAGEMENT
        </h2>
        <p className="text-xs dark:text-[#7A7A85] text-gray-500 mb-4">
          Saving a key here overwrites the backend key immediately — the system starts using the
          third-party API without a restart. {overrideCount > 0 && `${overrideCount} override(s) active.`}
        </p>

        <div className="space-y-4">
          {API_KEYS.map(({ key, label }) => {
            const info = keys.find(k => k.name === key)
            const source = info?.source || 'none'
            const style = SOURCE_STYLES[source]
            const SourceIcon = style.icon
            const isBusy = busyKey === key
            return (
              <div key={key} className="p-4 rounded-lg dark:bg-[#1B2A48] bg-gray-50 border dark:border-[#2A3E5F] border-gray-200">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-sm font-semibold dark:text-[#E0E0E6] text-gray-900">{label}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded flex items-center gap-1 shrink-0 ${style.className}`}>
                    <SourceIcon size={10} /> {style.label}
                  </span>
                </div>
                <div className="text-[10px] font-mono dark:text-[#7A7A85] text-gray-500 mb-2 break-all">
                  {info?.envVar}{info?.maskedValue ? ` = ${info.maskedValue}` : ''}
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1 min-w-0">
                    <input
                      type={visibleKeys[key] ? 'text' : 'password'}
                      value={keyValues[key] || ''}
                      onChange={e => setKeyValues(prev => ({ ...prev, [key]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && handleSaveKey(key)}
                      placeholder="Paste third-party key to override..."
                      className="w-full px-3 py-2 pr-8 rounded dark:bg-[#0F1A2E] dark:text-[#E0E0E6] bg-white text-sm font-mono"
                    />
                    <button
                      onClick={() => setVisibleKeys(prev => ({ ...prev, [key]: !prev[key] }))}
                      className="absolute right-2 top-2.5 dark:text-[#7A7A85] text-gray-400"
                      title={visibleKeys[key] ? 'Hide' : 'Show'}
                    >
                      {visibleKeys[key] ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <button
                    onClick={() => handleSaveKey(key)}
                    disabled={!keyValues[key] || isBusy}
                    title="Save & activate"
                    className="px-3 py-2 rounded dark:bg-[#00FF88] dark:text-[#0A0A0F] bg-blue-500 text-white disabled:opacity-50"
                  >
                    {isBusy ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
                  </button>
                  {source === 'thirdparty' && (
                    <button
                      onClick={() => handleRevert(key)}
                      disabled={isBusy}
                      title="Revert to backend key"
                      className="px-3 py-2 rounded border dark:border-[#2A3E5F] border-gray-300 dark:text-[#7A7A85] text-gray-500 disabled:opacity-50"
                    >
                      <RotateCcw size={14} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
