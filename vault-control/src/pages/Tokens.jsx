import { useState, useEffect, useCallback, useRef } from 'react'
import {
  KeyRound, RefreshCw, ShieldCheck, ShieldAlert, ShieldQuestion,
  Linkedin, Facebook, Instagram, Loader2, ExternalLink, Copy, Check, AlertTriangle,
} from 'lucide-react'
import axios from 'axios'
import usePolling from '../hooks/usePolling'

const REFRESH_INTERVAL = 60000

const PLATFORMS = [
  { key: 'linkedin',        label: 'LinkedIn',        icon: Linkedin  },
  { key: 'facebook_system', label: 'Facebook (Page)', icon: Facebook  },
  { key: 'instagram',       label: 'Instagram',       icon: Instagram },
]

// A token that has already expired and one that expires next month need very
// different reactions, so days-left drives the colour rather than a boolean.
const EXPIRY_WARN_DAYS = 14

function statusOf(check) {
  if (!check) return 'unknown'
  if (check.network_error) return 'unknown'
  if (!check.ok) return 'failing'
  if (typeof check.days_left === 'number' && check.days_left <= EXPIRY_WARN_DAYS) return 'warning'
  return 'ok'
}

const STATUS_STYLE = {
  ok:      { icon: ShieldCheck,    text: 'text-green-400',  ring: 'border-green-500/40',  label: 'Healthy'     },
  warning: { icon: AlertTriangle,  text: 'text-orange-400', ring: 'border-orange-500/40', label: 'Expiring'    },
  failing: { icon: ShieldAlert,    text: 'text-red-400',    ring: 'border-red-500/40',    label: 'Broken'      },
  unknown: { icon: ShieldQuestion, text: 'text-gray-400',   ring: 'border-gray-500/30',   label: 'Unreachable' },
}

function timeAgo(iso) {
  if (!iso) return 'never'
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 90) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

function CopyField({ value }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="flex items-center gap-2 w-full text-left font-mono text-[11px] px-3 py-2 rounded-lg dark:bg-[#0F1A2E] bg-gray-100 dark:text-[#B0C4FF] text-gray-700 hover:opacity-80 transition-opacity"
    >
      <span className="flex-1 break-all">{value}</span>
      {copied ? <Check size={14} className="text-green-400 shrink-0" /> : <Copy size={14} className="shrink-0 opacity-60" />}
    </button>
  )
}

function TokenCard({ platform, check, liveMask }) {
  const status = statusOf(check)
  const style = STATUS_STYLE[status]
  const StatusIcon = style.icon
  const Icon = platform.icon

  return (
    <div className={`rounded-xl border ${style.ring} dark:bg-[#1B2A48] bg-white p-4 flex flex-col gap-3`}>
      <div className="flex items-center gap-3">
        <Icon size={20} className="dark:text-[#B0C4FF] text-gray-600" />
        <span className="font-semibold dark:text-white text-gray-900 flex-1">{platform.label}</span>
        <span className={`flex items-center gap-1.5 text-xs font-medium ${style.text}`}>
          <StatusIcon size={15} />
          {style.label}
        </span>
      </div>

      <p className="text-xs dark:text-[#8FA3CC] text-gray-500 min-h-[16px]">
        {check?.message || 'No check has run yet.'}
      </p>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <span className="dark:text-[#7A7A85] text-gray-400 block">Expires</span>
          <span className="dark:text-[#B0C4FF] text-gray-700">
            {typeof check?.days_left === 'number' ? `${check.days_left} days` : 'no expiry reported'}
          </span>
        </div>
        <div>
          <span className="dark:text-[#7A7A85] text-gray-400 block">Auto-renew</span>
          <span className={check?.has_refresh === false ? 'text-orange-400' : 'dark:text-[#B0C4FF] text-gray-700'}>
            {platform.key === 'linkedin'
              ? (check?.has_refresh ? 'yes (refresh token)' : 'no refresh token')
              : 'yes (system token)'}
          </span>
        </div>
      </div>

      {/* The value the *running server* is actually posting with. It can differ
          from the file on disk after an out-of-process renewal, which is exactly
          the failure that made posts fail with a token that looked fine. */}
      <div className="font-mono text-[10px] dark:text-[#7A7A85] text-gray-400">
        in use: {liveMask || '—'}
      </div>
    </div>
  )
}

export default function Tokens() {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(null)
  const [log, setLog] = useState('')
  const [error, setError] = useState('')
  const popupRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const res = await axios.get('/api/tokens/status')
      setData(res.data)
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    }
  }, [])

  useEffect(() => { load() }, [load])
  usePolling(load, REFRESH_INTERVAL)

  // The OAuth tab reports back when it is done, so the cards refresh without the
  // user having to guess whether it worked.
  useEffect(() => {
    const onMessage = (event) => {
      if (event.data?.type === 'linkedin-token') {
        setBusy(null)
        setLog(event.data.ok ? 'LinkedIn token saved.' : 'LinkedIn authorisation failed — dekhein us tab me kya likha hai.')
        load()
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [load])

  const run = async (label, fn) => {
    setBusy(label)
    setError('')
    setLog('')
    try {
      const res = await fn()
      if (res?.data?.state) setData({ state: res.data.state, config: res.data.config })
      const steps = res?.data?.steps
      setLog(steps ? steps.map(s => `── ${s.platform} (exit ${s.exitCode})\n${s.output}`).join('\n\n') : (res?.data?.output || ''))
      if (res?.data?.manualActionNeeded) {
        setError('Ek platform ko manual re-auth chahiye — neeche "Connect LinkedIn" use karein.')
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setBusy(null)
      load()
    }
  }

  const connectLinkedIn = async () => {
    setBusy('linkedin-oauth')
    setError('')
    try {
      const res = await axios.get('/api/tokens/linkedin/auth-url')
      // Opened here, in the click handler, so the browser still counts it as a
      // user gesture — opening it inside the await would be popup-blocked.
      popupRef.current = window.open(res.data.url, 'linkedin-oauth', 'width=620,height=760')
      if (!popupRef.current) {
        setError('Popup block ho gaya. Browser me is site ke liye popups allow karein.')
        setBusy(null)
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message)
      setBusy(null)
    }
  }

  const state = data?.state
  const config = data?.config
  const checks = state?.checks || {}
  const li = config?.linkedin
  const canOAuth = li?.hasClientId && li?.hasClientSecret

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <KeyRound className="text-[#00FF88]" size={24} />
        <div className="flex-1">
          <h1 className="text-xl font-bold dark:text-white text-gray-900">Tokens</h1>
          <p className="text-xs dark:text-[#8FA3CC] text-gray-500">
            Last check: {timeAgo(state?.last_check)} · cron har 6 ghante khud chalta hai
          </p>
        </div>

        <button
          onClick={() => run('check', () => axios.post('/api/tokens/check'))}
          disabled={Boolean(busy)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm dark:bg-[#2A3E5F] bg-gray-200 dark:text-white text-gray-800 disabled:opacity-50"
        >
          {busy === 'check' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          Check now
        </button>

        <button
          onClick={() => run('renew', () => axios.post('/api/tokens/renew', { platform: 'all' }))}
          disabled={Boolean(busy)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-[#00FF88] text-[#0F1A2E] font-semibold disabled:opacity-50"
        >
          {busy === 'renew' ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
          Generate / renew tokens
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 text-sm px-4 py-3">{error}</div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {PLATFORMS.map(p => (
          <TokenCard
            key={p.key}
            platform={p}
            check={checks[p.key]}
            liveMask={config?.live?.[p.key === 'facebook_system' ? 'facebook' : p.key]}
          />
        ))}
      </div>

      {/* LinkedIn is the only platform that cannot renew itself: Meta mints page
          tokens from the long-lived system-user token, but LinkedIn hands out a
          refresh_token only through the authorization-code flow. */}
      <div className="rounded-xl border dark:border-[#2A3E5F] border-gray-200 dark:bg-[#1B2A48] bg-white p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Linkedin size={18} className="dark:text-[#B0C4FF] text-gray-600" />
          <h2 className="font-semibold dark:text-white text-gray-900">LinkedIn — browser se token generate</h2>
        </div>

        <p className="text-xs dark:text-[#8FA3CC] text-gray-500">
          {li?.hasRefreshToken
            ? 'refresh_token maujood hai — cron khud renew karta rahega. Ye button sirf tab chahiye jab LinkedIn access revoke ho jaye.'
            : 'Abhi refresh_token nahi hai, is liye expiry par token khud renew nahi ho sakta. Ek dafa neeche wala button chala dein — LinkedIn refresh_token de dega aur uske baad ye automatic ho jayega.'}
        </p>

        <button
          onClick={connectLinkedIn}
          disabled={Boolean(busy) || !canOAuth}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-[#0A66C2] text-white font-semibold disabled:opacity-50"
        >
          {busy === 'linkedin-oauth' ? <Loader2 size={15} className="animate-spin" /> : <ExternalLink size={15} />}
          Connect LinkedIn
        </button>

        {!canOAuth && (
          <p className="text-xs text-orange-400">
            LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET .env me nahi hain — button tab tak disabled rahega.
          </p>
        )}

        <div className="space-y-1">
          <span className="text-[11px] dark:text-[#7A7A85] text-gray-400">
            Ye redirect URL LinkedIn app ke <strong>Auth → Authorized redirect URLs</strong> me exactly add hona chahiye:
          </span>
          <CopyField value={li?.redirectUri || ''} />
          <span className="text-[11px] dark:text-[#7A7A85] text-gray-400">Scopes: <code>{li?.scopes}</code></span>
        </div>
      </div>

      {log && (
        <div className="rounded-xl border dark:border-[#2A3E5F] border-gray-200 dark:bg-[#0F1A2E] bg-gray-50 p-4">
          <h3 className="text-xs font-semibold dark:text-[#B0C4FF] text-gray-600 mb-2">Output</h3>
          <pre className="text-[11px] whitespace-pre-wrap dark:text-[#8FA3CC] text-gray-600 max-h-72 overflow-auto">{log}</pre>
        </div>
      )}
    </div>
  )
}
