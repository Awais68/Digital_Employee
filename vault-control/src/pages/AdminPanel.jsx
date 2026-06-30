import { useState, useEffect } from 'react'
import { Shield, Key, Eye, EyeOff, Check, Loader2, AlertCircle, LogIn } from 'lucide-react'
import axios from 'axios'
import { useToast } from '../context/ToastContext'

const API_KEYS = [
  { key: 'gemini', label: 'Gemini API Key', env: 'GEMINI_API_KEY' },
  { key: 'openai', label: 'OpenAI API Key', env: 'OPENAI_API_KEY' },
  { key: 'openrouter', label: 'OpenRouter API Key', env: 'OPENROUTER_API_KEY' },
  { key: 'claude', label: 'Claude/Anthropic API Key', env: 'ANTHROPIC_API_KEY' },
  { key: 'facebook', label: 'Facebook System User Token', env: 'META_SYSTEM_USER_TOKEN' },
  { key: 'instagram', label: 'Instagram Access Token', env: 'INSTAGRAM_ACCESS_TOKEN' },
  { key: 'linkedin', label: 'LinkedIn Access Token', env: 'LINKEDIN_ACCESS_TOKEN' },
  { key: 'twitter_key', label: 'Twitter API Key', env: 'TWITTER_API_KEY' },
  { key: 'twitter_secret', label: 'Twitter API Secret', env: 'TWITTER_API_SECRET' },
  { key: 'whatsapp', label: 'WhatsApp API Key', env: 'WHATSAPP_API_KEY' },
  { key: 'discord', label: 'Discord Bot Token', env: 'DISCORD_BOT_TOKEN' },
]

export default function AdminPanel() {
  const [token, setToken] = useState(localStorage.getItem('admin_token'))
  const [password, setPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [keys, setKeys] = useState([])
  const [keyValues, setKeyValues] = useState({})
  const [visibleKeys, setVisibleKeys] = useState({})
  const [savingKey, setSavingKey] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { success, error: toastError } = useToast()

  useEffect(() => {
    if (token) fetchKeys()
    else setLoading(false)
  }, [token])

  const fetchKeys = async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/admin/keys', {
        headers: { Authorization: `Bearer ${token}` }
      })
      setKeys(Array.isArray(res.data) ? res.data : (res.data?.keys || res.data?.data || []))
    } catch {
      setError('Failed to load API keys')
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async () => {
    setLoginLoading(true)
    try {
      const res = await axios.post('/api/admin/login', { password })
      setToken(res.data.token)
      localStorage.setItem('admin_token', res.data.token)
      setPassword('')
      success('Admin authenticated')
    } catch {
      toastError('Invalid password')
    } finally {
      setLoginLoading(false)
    }
  }

  const handleSaveKey = async (keyName) => {
    const value = keyValues[keyName]
    if (!value) return
    setSavingKey(keyName)
    try {
      await axios.put(`/api/admin/keys/${keyName}`, { value }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      success(`${keyName} key updated`)
      setKeyValues(prev => ({ ...prev, [keyName]: '' }))
      fetchKeys()
    } catch {
      toastError(`Failed to save ${keyName}`)
    } finally {
      setSavingKey(null)
    }
  }

  if (!token) {
    return (
      <div className="max-w-md mx-auto mt-20">
        <div className="card p-8">
          <div className="flex items-center gap-3 mb-6">
            <Shield size={28} className="dark:text-[#00FF88] text-blue-600" />
            <h1 className="text-xl font-bold dark:text-[#E0E0E6] text-gray-900 font-mono">ADMIN LOGIN</h1>
          </div>
          <div className="space-y-4">
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="Enter admin password"
              className="w-full px-4 py-3 rounded-lg dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-50 text-sm" />
            <button onClick={handleLogin} disabled={loginLoading || !password}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-bold dark:bg-[#00FF88] dark:text-[#0A0A0F] bg-blue-500 text-white disabled:opacity-50">
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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield size={24} className="dark:text-[#00FF88] text-blue-600" />
          <h1 className="text-xl font-bold dark:text-[#E0E0E6] text-gray-900 font-mono">ADMIN PANEL</h1>
        </div>
        <button onClick={() => { setToken(null); localStorage.removeItem('admin_token') }}
          className="text-xs dark:text-[#7A7A85] underline">Logout</button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="card p-6">
        <h2 className="text-lg font-bold dark:text-[#E0E0E6] text-gray-900 mb-4 font-mono flex items-center gap-2">
          <Key size={18} className="dark:text-[#FFB800] text-yellow-600" />
          API KEY MANAGEMENT
        </h2>
        <div className="space-y-4">
          {API_KEYS.map(({ key, label }) => {
            const existing = keys.find(k => k.key === `api_${key}`)
            const isSaving = savingKey === key
            return (
              <div key={key} className="p-4 rounded-lg dark:bg-[#1B2A48] bg-gray-50 border dark:border-[#2A3E5F] border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold dark:text-[#E0E0E6] text-gray-900">{label}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded ${existing?.isSet ? 'dark:bg-green-500/20 bg-green-100 text-green-600' : 'dark:bg-red-500/20 bg-red-100 text-red-500'}`}>
                    {existing?.isSet ? 'SET' : 'NOT SET'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={visibleKeys[key] ? 'text' : 'password'}
                      value={keyValues[key] || ''}
                      onChange={e => setKeyValues(prev => ({ ...prev, [key]: e.target.value }))}
                      placeholder={existing?.maskedValue || 'Enter new key...'}
                      className="w-full px-3 py-2 pr-8 rounded dark:bg-[#0F1A2E] dark:text-[#E0E0E6] bg-white text-sm font-mono"
                    />
                    <button onClick={() => setVisibleKeys(prev => ({ ...prev, [key]: !prev[key] }))}
                      className="absolute right-2 top-2.5 dark:text-[#7A7A85]">
                      {visibleKeys[key] ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <button onClick={() => handleSaveKey(key)} disabled={!keyValues[key] || isSaving}
                    className="px-3 py-2 rounded dark:bg-[#00FF88] dark:text-[#0A0A0F] bg-blue-500 text-white disabled:opacity-50">
                    {isSaving ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
