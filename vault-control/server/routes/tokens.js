import express from 'express'
import { execFile } from 'child_process'
import { promisify } from 'util'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { requireAdmin } from '../database/auth.js'
import { reloadEnvIntoProcess } from '../services/envWriter.js'

const execFileAsync = promisify(execFile)
const router = express.Router()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.join(__dirname, '../../../')
const STATE_FILE = path.join(ROOT_DIR, 'config', 'token_state.json')
const PYTHON = process.env.TOKEN_PYTHON || process.env.ODOO_PYTHON || 'python3'

// token_manager check hits three remote APIs with a 15s timeout each, and the
// LinkedIn probe retries once on a 500. 90s covers the worst case without
// letting a hung socket pin the request forever.
const PY_TIMEOUT = 90_000

const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization'
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'

// r_liteprofile is the legacy pair for /v2/me. renew_linkedin_token.py validates
// through /v2/userinfo, which is OpenID Connect — asking for the legacy scopes
// produces a token that cannot be validated and the renewal aborts after the
// user has already approved. Override per-app with LINKEDIN_SCOPES if the app
// is still on the legacy product.
const DEFAULT_SCOPES = 'openid profile email w_member_social'

function scopes() {
  return process.env.LINKEDIN_SCOPES || DEFAULT_SCOPES
}

// SERVER_PUBLIC_URL deliberately not consulted: it points at the Oracle box,
// while this OAuth dance has to come back to whichever machine the dashboard is
// actually being served from.
function redirectUri(req) {
  if (process.env.LINKEDIN_REDIRECT_URI) return process.env.LINKEDIN_REDIRECT_URI
  const host = req?.get?.('host') || `localhost:${process.env.PORT || 3000}`
  const proto = req?.protocol === 'https' ? 'https' : 'http'
  return `${proto}://${host}/api/tokens/linkedin/callback`
}

function mask(value, show = 6) {
  if (!value) return null
  if (value.length <= show * 2) return '*'.repeat(value.length)
  return `${value.slice(0, show)}...${value.slice(-4)}`
}

// Tokens leak through subprocess output constantly — the Graph API echoes them
// back in error bodies, and every renewal script prints a prefix. Scrub before
// anything reaches the browser.
const TOKEN_RE = /\b(?:EAA|AQ[A-Za-z]|IGQ)[A-Za-z0-9_-]{20,}/g
function redact(text) {
  return String(text || '').replace(TOKEN_RE, '<redacted-token>')
}

function tailLines(text, n = 25) {
  return redact(text).trim().split('\n').slice(-n).join('\n')
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'))
  } catch {
    return null
  }
}

// Presence flags only — the values themselves never cross the wire. The UI needs
// to know *why* a platform cannot self-renew, and that is entirely a question of
// which credentials exist.
function configFlags(req) {
  return {
    linkedin: {
      hasClientId: Boolean(process.env.LINKEDIN_CLIENT_ID),
      hasClientSecret: Boolean(process.env.LINKEDIN_CLIENT_SECRET),
      hasRefreshToken: Boolean(process.env.LINKEDIN_REFRESH_TOKEN),
      redirectUri: redirectUri(req),
      scopes: scopes(),
    },
    meta: {
      hasSystemToken: Boolean(process.env.META_SYSTEM_USER_TOKEN),
      hasPageId: Boolean(process.env.FACEBOOK_PAGE_ID),
      hasIgAccountId: Boolean(process.env.INSTAGRAM_ACCOUNT_ID),
    },
    live: {
      linkedin: mask(process.env.LINKEDIN_ACCESS_TOKEN),
      instagram: mask(process.env.INSTAGRAM_ACCESS_TOKEN || process.env.META_SYSTEM_USER_TOKEN),
      facebook: mask(process.env.META_SYSTEM_USER_TOKEN),
    },
  }
}

// Two renewals running at once means two processes rewriting the same .env and
// minting competing Meta page tokens — the last writer wins and the other's
// token is orphaned. The UI disables its buttons while busy, but a second tab
// (or the cron) does not know about that, so the guard belongs here.
let inflight = null

function runExclusive(label, fn) {
  if (inflight) return Promise.resolve({ code: -1, output: `Busy: ${inflight} already running.`, busy: true })
  inflight = label
  return fn().finally(() => { inflight = null })
}

async function runPython(args) {
  try {
    const { stdout, stderr } = await execFileAsync(PYTHON, args, {
      cwd: ROOT_DIR,
      timeout: PY_TIMEOUT,
      maxBuffer: 4 * 1024 * 1024,
    })
    return { code: 0, output: tailLines(`${stdout}\n${stderr}`) }
  } catch (err) {
    // token_manager uses exit codes as its result channel: 1 = a token is
    // genuinely broken, 2 = a human has to re-authorise. Neither is a crash, so
    // they must not surface as a 500.
    if (typeof err.code === 'number') {
      return { code: err.code, output: tailLines(`${err.stdout || ''}\n${err.stderr || ''}`) }
    }
    return { code: -1, output: redact(err.message), failed: true }
  }
}

// ─── Status ────────────────────────────────────────────────────────────────

router.get('/status', (req, res) => {
  const state = readState()
  res.json({
    state,
    config: configFlags(req),
    stale: !state,
  })
})

// A fresh probe of all three platforms. POST, not GET: it makes outbound calls
// and rewrites config/token_state.json.
router.post('/check', requireAdmin, async (req, res) => {
  const result = await runExclusive('check', () => runPython(['token_manager.py', 'check']))
  if (result.busy) return res.status(409).json({ error: result.output })
  if (result.failed) return res.status(500).json({ error: result.output })
  res.json({ exitCode: result.code, output: result.output, state: readState(), config: configFlags(req) })
})

// ─── Renew ─────────────────────────────────────────────────────────────────

router.post('/renew', requireAdmin, async (req, res) => {
  const platform = String(req.body?.platform || 'all').toLowerCase()
  const jobs = {
    meta: ['renew_meta_tokens.py'],
    linkedin: ['token_manager.py', 'renew'],
    all: ['token_manager.py', 'renew'],
  }
  if (!jobs[platform]) return res.status(400).json({ error: `Unknown platform: ${platform}` })

  const steps = await runExclusive('renew', async () => {
    const out = []
    if (platform === 'all' || platform === 'meta') {
      out.push({ name: 'meta', result: await runPython(jobs.meta) })
    }
    if (platform === 'all' || platform === 'linkedin') {
      out.push({ name: 'linkedin', result: await runPython(jobs.linkedin) })
    }
    return out
  })
  if (!Array.isArray(steps)) return res.status(409).json({ error: steps.output })

  // The renewal scripts write .env, but this process booted with the old values
  // and dotenv will not overwrite what is already in process.env. Without this
  // reload the dashboard keeps posting with the dead token until PM2 restarts.
  const reloaded = reloadEnvIntoProcess(['LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_REFRESH_TOKEN', 'INSTAGRAM_ACCESS_TOKEN', 'META_SYSTEM_USER_TOKEN', 'FACEBOOK_PAGE_ID', 'INSTAGRAM_ACCOUNT_ID'])

  const refresh = await runExclusive('post-renew check', () => runPython(['token_manager.py', 'check']))
  res.json({
    steps: steps.map(s => ({ platform: s.name, exitCode: s.result.code, output: s.result.output })),
    reloaded,
    manualActionNeeded: steps.some(s => s.result.code === 2),
    checkOutput: refresh.output,
    state: readState(),
    config: configFlags(req),
  })
})

// ─── LinkedIn 3-legged OAuth ───────────────────────────────────────────────
//
// LinkedIn only issues a refresh_token through the authorization-code flow with
// a registered redirect URI. That is the whole reason auto-renewal has never
// worked for LinkedIn here: the stored token set has no refresh_token, so every
// expiry needed a human at a CLI. One button click now walks the flow.

const pendingStates = new Map()
const STATE_TTL_MS = 10 * 60 * 1000

function newState(uri) {
  const value = crypto.randomBytes(16).toString('hex')
  pendingStates.set(value, { uri, createdAt: Date.now() })
  for (const [k, v] of pendingStates) {
    if (Date.now() - v.createdAt > STATE_TTL_MS) pendingStates.delete(k)
  }
  return value
}

router.get('/linkedin/auth-url', requireAdmin, (req, res) => {
  const clientId = process.env.LINKEDIN_CLIENT_ID
  const uri = redirectUri(req)
  if (!clientId || !process.env.LINKEDIN_CLIENT_SECRET) {
    return res.status(400).json({
      error: 'LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET missing from .env',
      redirectUri: uri,
    })
  }
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: uri,
    scope: scopes(),
    state: newState(uri),
  })
  res.json({ url: `${LINKEDIN_AUTH_URL}?${params}`, redirectUri: uri, scopes: scopes() })
})

function resultPage(ok, title, detail) {
  const colour = ok ? '#00FF88' : '#FF5C5C'
  const safe = String(detail).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))
  return `<!doctype html><meta charset="utf-8"><title>LinkedIn token</title>
<body style="font-family:system-ui;background:#0F1A2E;color:#E6ECFF;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="max-width:520px;text-align:center">
  <div style="font-size:44px">${ok ? '✅' : '❌'}</div>
  <h2 style="color:${colour}">${title}</h2>
  <pre style="white-space:pre-wrap;text-align:left;background:#1B2A48;padding:14px;border-radius:8px;font-size:12px">${safe}</pre>
  <p style="color:#8FA3CC;font-size:13px">Ye tab band kar dein — dashboard khud refresh ho jayega.</p>
</div>
<script>
  try { window.opener && window.opener.postMessage({ type: 'linkedin-token', ok: ${ok} }, '*') } catch (e) {}
  setTimeout(() => { try { window.close() } catch (e) {} }, ${ok ? 2500 : 15000})
</script>`
}

// AUTH-FREE by necessity: LinkedIn redirects the browser here with no Bearer
// header. The `state` value is the authorisation — it was minted by an
// admin-only endpoint moments earlier and is single-use.
router.get('/linkedin/callback', async (req, res) => {
  res.type('html')
  const { code, state, error, error_description: errorDescription } = req.query

  if (error) {
    return res.status(400).send(resultPage(false, 'LinkedIn ne approve nahi kiya', `${error}: ${errorDescription || ''}`))
  }
  const pending = state && pendingStates.get(state)
  if (!pending) {
    return res.status(400).send(resultPage(false, 'State invalid ya expire', 'Dashboard se dobara "Connect LinkedIn" click karein (link 10 minute valid rehta hai).'))
  }
  pendingStates.delete(state)
  if (!code) {
    return res.status(400).send(resultPage(false, 'Code nahi mila', 'LinkedIn ne authorization code return nahi kiya.'))
  }

  let tmpFile = null
  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      client_id: process.env.LINKEDIN_CLIENT_ID,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET,
      redirect_uri: pending.uri,
    })
    const resp = await fetch(LINKEDIN_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok || !data.access_token) {
      return res.status(400).send(resultPage(false, 'Token exchange fail', redact(JSON.stringify(data).slice(0, 400))))
    }

    // Handing the token set to renew_linkedin_token.py rather than writing .env
    // here: that script is the single place that knows every store a LinkedIn
    // token lives in (.env, .linkedin_session/session.json,
    // config/linkedin_config.json) and writes them atomically.
    tmpFile = path.join(os.tmpdir(), `li_token_${crypto.randomBytes(6).toString('hex')}.json`)
    fs.writeFileSync(tmpFile, JSON.stringify({
      access_token: data.access_token,
      refresh_token: data.refresh_token || '',
      expires_in: data.expires_in,
    }), { mode: 0o600 })

    const result = await runExclusive('linkedin-save', () => runPython(['renew_linkedin_token.py', '--token-file', tmpFile]))
    if (result.code !== 0) {
      return res.status(500).send(resultPage(false, 'Token save fail', result.output))
    }

    reloadEnvIntoProcess(['LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_REFRESH_TOKEN'])

    const gotRefresh = Boolean(data.refresh_token)
    return res.send(resultPage(
      true,
      'LinkedIn token save ho gaya',
      gotRefresh
        ? 'refresh_token bhi mil gaya — ab cron khud renew karta rahega, dobara login ki zaroorat nahi.'
        : 'refresh_token NAHI mila. LinkedIn ye sirf approved apps ko deta hai; token expiry pe ye button dobara chalana padega.'
    ))
  } catch (err) {
    return res.status(500).send(resultPage(false, 'Callback error', redact(err.message)))
  } finally {
    if (tmpFile) { try { fs.unlinkSync(tmpFile) } catch { /* already gone */ } }
  }
})

export default router
