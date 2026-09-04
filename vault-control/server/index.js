import './loadEnv.js'   // must stay first — populates process.env before any other module evaluates
import express from 'express'
import { WebSocketServer } from 'ws'
import { createServer } from 'http'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'
import net from 'net'
import chokidar from 'chokidar'
import compression from 'compression'
import { refreshAndBroadcast, getVaultCounts, getRecentActivity, getPendingApprovals, getServiceStatus } from './system-status.js'
import { testConnection, initializeSchema, closePool, query, getDbHealth } from './database/connection.js'
import { generateCSRFToken, verifyCSRF } from './database/csrf.js'
import { authenticateToken, authenticateApiKey, optionalAuth } from './database/auth.js'
import { rateLimiter, authRateLimiter } from './database/rateLimiter.js'
import { errorHandler, notFoundHandler, asyncHandler } from './database/errorHandler.js'

// Import routes
import approvalsRouter from './routes/approvals.js'
import emailsRouter from './routes/emails.js'
import draftsRouter from './routes/drafts.js'
import socialRouter from './routes/social.js'
import systemRouter from './routes/system.js'
import logsRouter from './routes/logs.js'
import odooRouter from './routes/odoo.js'
import whatsappRouter from './routes/whatsapp.js'
import vaultRouter from './routes/vault.js'
import exportRouter from './routes/export.js'
import authRouter from './routes/auth.js'
import todosRouter from './routes/todos.js'
import notificationsRouter from './routes/notifications.js'
import templatesRouter from './routes/templates.js'
import postsRouter from './routes/posts.js'
import adminRouter from './routes/admin.js'
import oracleCloudRouter from './routes/oracle-cloud.js'
import analyticsRouter from './routes/analytics.js'
import { bus as chatbotEventBus } from './services/eventBus.js'

// Chatbot router lives at repo root server/ as CommonJS — bridge via createRequire
import { createRequire } from 'module'
const cjsRequire = createRequire(import.meta.url)
const { router: chatbotRouter, setEventBus: setChatbotEventBus } = cjsRequire('../../server/chatbotRouter.js')

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const distPath = join(__dirname, '../dist')

const PORT = process.env.PORT || 3000
const ENABLE_AUTH = process.env.ENABLE_AUTH === 'true'

let serverReady = false
let dbConnected = false

const app = express()
app.use(compression({
  filter: (req, res) => {
    // SSE streams must not be buffered by compression
    if (req.path === '/api/chat/stream') return false
    return compression.filter(req, res)
  },
}))
app.use(express.json())

const server = createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })

global.wsBroadcast = (data) => {
  const msg = JSON.stringify(data)
  let sent = 0
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(msg)
      sent++
    }
  })
  if (sent > 0 && process.env.DEBUG_WS === 'true') console.log(`[WS] Broadcast to ${sent} clients:`, data.type)
}
global.broadcast = global.wsBroadcast

// Security headers
app.use((req, res, next) => {
  res.header('X-Content-Type-Options', 'nosniff')
  res.header('X-Frame-Options', 'DENY')
  res.header('X-XSS-Protection', '1; mode=block')
  next()
})

// CORS - configurable (supports * or specific origin)
app.use((req, res, next) => {
  const allowedOrigin = process.env.CORS_ORIGIN || '*'
  const origin = req.headers.origin
  if (allowedOrigin === '*') {
    res.header('Access-Control-Allow-Origin', origin || '*')
  } else {
    res.header('Access-Control-Allow-Origin', allowedOrigin)
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token, X-API-Key')
  res.header('Access-Control-Allow-Credentials', 'true')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

// Rate limiting (global)
app.use('/api', rateLimiter({ windowMs: 15 * 60 * 1000, max: 1000 }))

// ─── AUTH-FREE ROUTES (registered before auth middleware) ──────
app.use('/api/notifications', notificationsRouter)
app.use('/api/whatsapp',      optionalAuth, whatsappRouter)  // optionalAuth => req.user set so requireAdmin enforces admin on write routes; GET reads stay public
app.use('/api/auth',          authRouter)

// CSRF token endpoint
app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: generateCSRFToken() })
})

// Startup readiness — returns 503 until DB + schema are ready
app.use('/api', (req, res, next) => {
  if (serverReady) return next()
  // Health check always works
  if (req.path === '/health') return next()
  res.status(503).json({ error: 'Server starting up', retryAfter: 2 })
})

// DB status is derived from the last REAL query, not a heartbeat — pinging Neon
// on a timer is what kept its compute from ever suspending. Before any query has
// run we fall back to the one-shot boot check.
function dbStatus() {
  const h = getDbHealth()
  const known = h.lastQueryAt ? h.healthy : dbConnected
  return known ? 'connected' : 'disconnected'
}

// Health check (no auth required)
app.get('/api/health', (req, res) => {
  const health = getDbHealth()
  const database = dbStatus()
  // status used to be a hardcoded 'ok' with a 200 even while database read
  // 'disconnected' — a monitor watching this endpoint saw green through a total
  // DB outage. Let the DB decide both the body and the status code.
  const degraded = database !== 'connected'
  res.status(degraded ? 503 : 200).json({
    status: degraded ? 'degraded' : 'ok',
    // Derived from the last REAL query, not a heartbeat — pinging Neon on a
    // timer is what kept the compute from ever suspending.
    database,
    databaseLastQueryAt: health.lastQueryAt,
    databaseLastError: health.lastError || undefined,
    auth: ENABLE_AUTH ? 'enabled' : 'disabled',
    timestamp: new Date().toISOString(),
  })
})

// ─── AUTH MIDDLEWARE (optional - enabled via ENABLE_AUTH=true) ──
if (ENABLE_AUTH) {
  app.use('/api', (req, res, next) => {
    // Skip auth for routes registered above
    if (req.path.startsWith('/chat/') || req.path.startsWith('/notifications/') || req.path.startsWith('/whatsapp/') ||
        req.path.startsWith('/internal/') || req.path.startsWith('/csrf-token') ||
        req.path.startsWith('/health') || req.path.startsWith('/auth/') ||
        req.path === '/admin/login') {   // admin panel has its own password gate
      return next()
    }
    authenticateToken(req, res, next)
  })
}

// ─── PROTECTED ROUTES (after auth middleware) ──────────────────
app.use('/api/approvals', approvalsRouter)
app.use('/api/emails', emailsRouter)
app.use('/api/drafts', draftsRouter)
app.use('/api/social', socialRouter)
app.use('/api/system', systemRouter)
app.use('/api/logs', logsRouter)
app.use('/api/odoo', odooRouter)
app.use('/api/vault', vaultRouter)
app.use('/api/export', exportRouter)
app.use('/api/todos', todosRouter)
app.use('/api/email-templates', templatesRouter)
app.use('/api/posts', postsRouter)
app.use('/api/admin/login', authRateLimiter())
app.use('/api/admin', adminRouter)
app.use('/api/oracle', oracleCloudRouter)
app.use('/api/analytics', analyticsRouter)

// Chatbot SSE — eventBus injected after import (already initialized above)
// optionalAuth (not authenticateToken) so chat stays usable without login, but
// req.user is populated — the router uses it to gate outward-facing actions
// (send email / publish post / WhatsApp) to admins when ENABLE_AUTH is on.
setChatbotEventBus(chatbotEventBus)
app.use('/api', optionalAuth, chatbotRouter)

// Internal notification endpoint (localhost only, no auth)
app.post('/api/internal/notify', express.json(), async (req, res) => {
  const { notify } = await import('./services/notificationService.js')
  const { type, title, message, data } = req.body
  notify(type || 'info', title || 'Notification', message || '', data || {})
  res.json({ success: true })
})

// Email event endpoint — receives events from gmail_watcher.py
app.post('/api/internal/email-event', express.json(), async (req, res) => {
  res.json({ received: true })

  setImmediate(async () => {
    try {
      const { bus, EVENTS } = await import('./services/eventBus.js')
      bus.emit(EVENTS.EMAIL_NEW, req.body)
    } catch (e) {
      console.error('[EmailEvent]', e.message)
    }
  })
})

// Internal email processing endpoint — AI analysis + auto-reply + notifications
// PostgreSQL atomic dedup via emails.msg_id UNIQUE constraint
const _recentlyProcessedEmailIds = new Set()
setInterval(() => _recentlyProcessedEmailIds.clear(), 5 * 60 * 1000)

// Every branch of this handler MUST answer the request. gmail_watcher.py only
// marks a mail read (and applies AI/Processed) after a 2xx or a 409; anything
// else means "not processed, try again". The two filter branches that used to
// `return` without touching `res` therefore made the watcher sit out its 60s
// read timeout and re-submit the very same junk mail on every cycle, forever.
// Re-send a still-pending approval to every owner number. Needed whenever the
// approver list changes: the original message only ever reached whoever was
// configured at the time, and the request itself is still valid.
app.post('/api/internal/hitl/notify', express.json(), async (req, res) => {
  try {
    const ref = String(req.body?.ref || '').trim()
    if (!ref) return res.status(400).json({ error: 'ref required' })
    const { query } = await import('./database/connection.js')
    const r = await query(`SELECT * FROM hitl_requests WHERE ref=$1 AND status='pending'`, [ref])
    const row = r.rows[0]
    if (!row) return res.status(404).json({ error: `No pending request #${ref}` })

    const { createHitlRequest } = await import('./services/hitl.js')
    const payload = typeof row.payload === 'string' ? JSON.parse(row.payload || '{}') : (row.payload || {})
    // Re-raising the same ref rewrites the row in place rather than opening a
    // second request for the same thing.
    await createHitlRequest({
      ref, kind: row.kind, sourceId: row.source_id, title: row.title,
      summary: row.summary, draft: row.draft, payload,
    })
    res.json({ resent: true, ref })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/internal/process-email', express.json(), async (req, res) => {
  // The Gmail watcher posts `sender`; the webhook path and manual replays use
  // `from`. Accept either so a key mismatch can never blank the sender and
  // silently disable every domain-based triage rule.
  const { subject, body, priority, email_id, thread_id } = req.body
  const sender = req.body.sender || req.body.from || ''
  console.log(`[AI Email] Processing: "${subject?.substring(0, 60)}" from ${sender} [${priority}]${email_id ? ` id=${email_id}` : ''}`)

  const answer = (payload, code = 200) => { if (!res.headersSent) res.status(code).json(payload) }

  // ── LAYER 1: In-memory dedup (fast path) ──
  if (email_id && _recentlyProcessedEmailIds.has(email_id)) {
    console.log(`[AI Email] Dedup (memory): Already processed email ${email_id} — skipping`)
    return answer({ error: 'duplicate', layer: 'memory' }, 409)
  }

  const { query } = await import('./database/connection.js')

  // ── TRIAGE: one verdict decides everything downstream ──
  // junk       → DB row only. No task file, no draft, no ping. This is what
  //              stops the system from writing job applications to Instagram.
  // info       → task file for the record; nothing is sent to anyone.
  // actionable → task file + draft + WhatsApp approval to the owner.
  const { triageEmail } = await import('./services/emailTriage.js')
  const triage = await triageEmail({ from: sender, subject, body, priority })
  console.log(`[AI Email] Triage: ${triage.verdict} (${triage.decidedBy}) — ${triage.reason}`)

  if (triage.verdict === 'junk') {
    if (email_id) _recentlyProcessedEmailIds.add(email_id)
    try {
      await query(
        `INSERT INTO emails(msg_id, from_address, subject, body, status, received_at, thread_id, category, category_reason)
         VALUES($1,$2,$3,$4,'skipped',NOW(),$5,$6,$7)
         ON CONFLICT(msg_id) DO NOTHING`,
        [email_id || `skipped-${Date.now()}`, sender || 'unknown', subject || '', body || '',
         thread_id || '', triage.category, triage.reason]
      )
    } catch (dbErr) {
      console.warn('[AI Email] DB skip insert failed:', dbErr.message)
    }
    console.log(`[AI Email] SKIPPED (${triage.category}): "${subject?.substring(0, 60)}" — no reply, no task file, no alert`)
    return answer({ received: true, skipped: true, verdict: 'junk', reason: triage.reason })
  }

  // ── LAYER 2: PostgreSQL atomic dedup (ultimate guarantee) ──
  try {
    const result = await query(
      `INSERT INTO emails(msg_id, from_address, subject, body, status, received_at, thread_id, category, category_reason)
       VALUES($1,$2,$3,$4,'pending',NOW(),$5,$6,$7)
       ON CONFLICT(msg_id) DO NOTHING
       RETURNING id`,
      [email_id || `no-id-${Date.now()}`, sender || 'unknown', subject || '', body || '',
       thread_id || '', triage.category, triage.reason]
    )
    if (result.rows.length === 0 && email_id) {
      console.log(`[AI Email] Dedup (DB): Email ${email_id} already exists in DB — skipping`)
      return answer({ error: 'duplicate', layer: 'database' }, 409)
    }
  } catch (dbErr) {
    // If DB is down, fall back to memory-only dedup
    console.warn('[AI Email] DB dedup check failed, proceeding with memory-only:', dbErr.message)
  }

  if (email_id) _recentlyProcessedEmailIds.add(email_id)

  // ── Create Needs_Action/ task file (actionable + info only) ──
  try {
    const fs = await import('fs')
    const path = await import('path')
    const vaultPath = process.env.VAULT_PATH || '.'
    const needsActionDir = path.join(vaultPath, 'Needs_Action')
    fs.mkdirSync(needsActionDir, { recursive: true })

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)
    const safeSubject = (subject || 'email').replace(/[^\w\s-]/g, '').replace(/[-\s]+/g, '_').toLowerCase().substring(0, 50) || 'email'
    const filename = `${timestamp.replace(/[T]/g, '_')}_email_${safeSubject}.md`
    const taskPath = path.join(needsActionDir, filename)

    if (!fs.existsSync(taskPath)) {
      const taskContent = `---
type: email
from: ${sender || 'unknown'}
subject: ${subject || ''}
received: ${new Date().toISOString()}
priority: ${triage.priority}
status: pending
verdict: ${triage.verdict}
category: ${triage.category}
email_id: ${email_id || ''}
thread_id: ${thread_id || ''}
---

# 📧 Email: ${subject || ''}

## Email Details

| Field | Value |
|-------|-------|
| **From** | ${sender || 'unknown'} |
| **Received** | ${new Date().toISOString()} |
| **Priority** | ${triage.priority.toUpperCase()} |
| **Triage** | ${triage.verdict} — ${triage.reason} |
| **Status** | Pending |

---

## Email Content

${body || ''}

---

*Processed by vault-control server on ${new Date().toISOString()}*
`
      fs.writeFileSync(taskPath, taskContent, 'utf-8')
      console.log(`[AI Email] Task file created: ${filename}`)
    } else {
      console.log(`[AI Email] Task file already exists: ${filename}`)
    }

    try {
      if (typeof global.wsBroadcast === 'function') {
        global.wsBroadcast({
          type: 'dashboard_update',
          message: `New email: ${subject?.substring(0, 40)}`,
          timestamp: new Date()
        })
      }
    } catch {}
  } catch (fsErr) {
    console.error('[AI Email] Error creating task file:', fsErr.message)
  }

  // The watcher is released here; everything below is slow work (LLM calls,
  // WhatsApp) that must not hold its socket open.
  answer({ received: true, verdict: triage.verdict })

  setImmediate(async () => {
    try {
      const { callAI } = await import('./services/aiProvider.js')
      const { notify } = await import('./services/notificationService.js')

      // An `info` email is real mail that asks nothing of us: file it, tell the
      // dashboard, and stop. No draft, no WhatsApp.
      if (triage.verdict === 'info') {
        notify('info', `Email: ${(subject || '').substring(0, 40)}`,
          `Filed for the record — ${triage.reason}`, { verdict: 'info' })
        return
      }

      // ── ACTIONABLE ────────────────────────────────────────────────────────
      const systemPrompt = `You are an autonomous AI employee. Analyze this email and decide what action to take. Respond ONLY in valid JSON with no markdown formatting.`
      const userPrompt = `Email from: ${sender}
Subject: ${subject}
Priority: ${triage.priority}
Body: ${body?.substring(0, 1500) || ''}

This email has already been confirmed as a genuine request that needs a human
reply. Write the reply — do not decide whether one is needed.

Respond with this exact JSON structure:
{
  "asked": "in one plain sentence, what the sender is asking for",
  "draft_reply": "the full reply text, professional, no placeholders",
  "task_title": "short task title if we must do something, else null",
  "task_description": "task details if needed",
  "summary": "one line summary of what needs to happen"
}`

      let plan
      try {
        const raw = await callAI(systemPrompt, userPrompt, 900)
        plan = JSON.parse(raw.replace(/```json|```/g, '').trim())
      } catch (e) {
        // The draft is optional; the escalation is not. A model failure must
        // still put this email in front of the owner.
        console.warn('[AI Email] Plan generation failed:', e.message)
        plan = { asked: triage.reason, draft_reply: null, summary: 'Needs your reply — AI draft unavailable' }
      }
      console.log('[AI Email] Plan:', JSON.stringify(plan).substring(0, 300))

      // 1. Todos — from the plan and from the email body itself
      const { extractTasksFromEmail, createTodoFromText } = await import('./services/taskCapture.js')
      if (plan.task_title) {
        await createTodoFromText(plan.task_title, {
          source: 'email',
          sourceId: email_id || '',
          description: plan.task_description || `From ${sender} — "${subject}"`,
        }).catch(e => console.warn('[AI Email] Todo create failed:', e.message))
      }
      extractTasksFromEmail({ msgId: email_id || '', from: sender, subject, body })
        .catch(e => console.warn('[AI Email] Task extraction failed:', e.message))

      // 2. Draft reply in Pending_Approval (dedup on email_id)
      const fs = await import('fs')
      const path = await import('path')
      const vaultPath = process.env.VAULT_PATH || '.'
      const approvalDir = path.join(vaultPath, 'Pending_Approval')
      fs.mkdirSync(approvalDir, { recursive: true })

      let approvalFileName = null
      if (plan.draft_reply) {
        const already = fs.readdirSync(approvalDir).find(f => {
          try { return email_id && fs.readFileSync(path.join(approvalDir, f), 'utf-8').includes(`email_id: ${email_id}`) }
          catch { return false }
        })
        if (already) {
          console.log(`[AI Email] Dedup: Approval file already exists for email ${email_id}`)
          approvalFileName = already
        } else {
          approvalFileName = `EMAIL_REPLY_${Date.now()}.md`
          const replyContent = `---
type: email_reply
to: ${sender || 'unknown'}
subject: Re: ${subject || ''}
priority: ${triage.priority}
status: pending_approval
created: ${new Date().toISOString()}
action: send_email
email_id: ${email_id || ''}
thread_id: ${thread_id || ''}
---

## What they asked

${plan.asked || triage.reason}

## Reply

${plan.draft_reply}

## Original Email
From: ${sender || 'unknown'}
Subject: ${subject || ''}

---
Move to /Approved/ to send this reply.
`
          fs.writeFileSync(path.join(approvalDir, approvalFileName), replyContent, 'utf-8')
          console.log(`[AI Email] Approval file created: ${approvalFileName}`)
        }
      }

      // 3. HITL — the owner's standing rule: every genuine email goes to
      //    WhatsApp for a decision, whatever its priority. The old code only
      //    pinged on priority === 'high', which is exactly how a real inbound
      //    lead ("We ARe looking for FDE engineer", priority NORMAL) was filed
      //    and then silently forgotten.
      const { createHitlRequest } = await import('./services/hitl.js')
      await createHitlRequest({
        kind: 'email',
        sourceId: email_id || '',
        title: subject || '(no subject)',
        summary: plan.asked || plan.summary || triage.reason,
        draft: plan.draft_reply || '',
        payload: { from: sender, threadId: thread_id || '', vaultFile: approvalFileName, priority: triage.priority },
      }).catch(e => console.error('[AI Email] HITL request failed:', e.message))

      notify(triage.priority === 'high' ? 'urgent' : 'warning',
        `Approval needed: ${(subject || '').substring(0, 40)}`,
        plan.summary || 'Sent to WhatsApp for your decision',
        { action: 'approve_reply', file: approvalFileName })

    } catch (e) {
      console.error('[AI Email] Processing error:', e.message)
    }
  })
})

// Gmail webhook endpoint — receives Google Pub/Sub push notifications
// When Gmail API watch() is set up, Google sends push notifications here
app.post('/api/webhook/gmail', express.json(), async (req, res) => {
  res.status(200).end()  // Acknowledge immediately per Pub/Sub protocol

  setImmediate(async () => {
    try {
      const { message } = req.body
      if (!message || !message.data) return

      // Pub/Sub sends base64-encoded data
      const decoded = JSON.parse(Buffer.from(message.data, 'base64').toString())
      const emailId = decoded?.message?.data?.emailId ||
                       decoded?.historyId ||
                       decoded?.email_id

      if (!emailId) {
        console.log('[Gmail Webhook] No email ID in push notification')
        return
      }

      console.log(`[Gmail Webhook] Push notification for email: ${emailId}`)

      // To fully process, the server would need Gmail API credentials.
      // For now, this is a placeholder for future Gmail Pub/Sub integration.
      // When credentials are added, it will:
      //   1. Fetch email content via Gmail API
      //   2. Call /api/internal/process-email
      //
      // Until then, the gmail_watcher.py handles email fetching.
    } catch (e) {
      console.error('[Gmail Webhook] Error:', e.message)
    }
  })
})

// WebPush notification subscription
app.post('/api/notifications/subscribe', (req, res) => {
  const sub = req.body
  if (!sub || !sub.endpoint) return res.status(400).json({ error: 'Invalid subscription' })
  // Store subscription (web-push module handled separately)
  const subs = global._webPushSubs || new Map()
  subs.set(sub.endpoint, sub)
  global._webPushSubs = subs
  console.log('[Push] Subscribed:', sub.endpoint.slice(0, 40) + '...')
  res.json({ success: true })
})

// Serve uploaded images and generated images (always available)
app.use('/uploads', express.static(join(__dirname, '../public/uploads'), { maxAge: '7d' }))
app.use('/generated', express.static(join(__dirname, '../public/generated'), { maxAge: '7d' }))

// Serve React app (optional — frontend may be on Vercel)
if (existsSync(join(distPath, 'index.html'))) {
  app.use(express.static(distPath))
  app.get('/*', (req, res) => {
    res.sendFile(join(distPath, 'index.html'))
  })
}

// Error handling
app.use(notFoundHandler)
app.use(errorHandler)

// WebSocket Connection
wss.on('connection', async (ws, req) => {
  console.log('[WS] Client connected from', req.socket.remoteAddress)

  // Send initial state
  try {
    const initialState = {
      type: 'initial_state',
      vaultCounts: getVaultCounts(true),
      recentActivity: getRecentActivity(10),
      pendingApprovals: getPendingApprovals(),
      services: await getServiceStatus(),
      timestamp: new Date(),
    }
    ws.send(JSON.stringify(initialState))
  } catch {}

  // Send WhatsApp status immediately
  try {
    const wa = await import('./services/whatsappService.js')
    ws.send(JSON.stringify({
      type:   'whatsapp:status',
      status: wa.getStatus(),
      qr:     wa.getQR()
    }))
  } catch {}

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message)
      if (data.type === 'refresh') {
        const updated = await refreshAndBroadcast()
        ws.send(JSON.stringify(updated))
      }
    } catch {}
  })

  ws.on('error', () => {})
  ws.on('close', () => console.log('[WS] Client disconnected'))
})

// Vault file watcher - excluding session folders
const vaultPath = process.env.VAULT_PATH
if (vaultPath) {
  const watcher = chokidar.watch(vaultPath, {
    ignored: [
      /(^|[\/\\])\./,
      /node_modules/,
      /whatsapp_session/,
      /linkedin_session/,
      /facebook_session/,
      /odoo-docker/,
      /venv/,
      /\.git/,
      /\.obsidian/,
      /\.claude/,
      /\.qwen/,
      /(^|[\/\\])vault-control([\/\\]|$)/,
      /(^|[\/\\])AI_Employee_Vault([\/\\]|$)/,
    ],
    followSymlinks: false,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100,
    },
  })

  let debounceTimer = null
  const debouncedRefresh = async () => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(async () => {
      try {
        const { cacheDel } = await import('./services/cache.js')
        cacheDel('system_stats')
      } catch {}
      await refreshAndBroadcast()
    }, 1000)
  }

  watcher.on('ready', () => {
    console.log(`[Vault Watcher] Watching: ${vaultPath}`)
  })

  watcher.on('add', () => debouncedRefresh())
  watcher.on('change', () => debouncedRefresh())
  watcher.on('unlink', () => debouncedRefresh())

  watcher.on('error', (error) => {
    console.error('[Vault Watcher] Error:', error)
  })
}

// Start cron scheduler — imported dynamically AFTER everything is initialized
// (done inside initDatabase callback)

// Graceful shutdown
async function gracefulShutdown() {
  console.log('Shutting down gracefully...')
  await closePool()
  server.close(() => console.log('HTTP server closed'))
  wss.close(() => console.log('WebSocket server closed'))
  process.exit(0)
}

process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)

// Auto-select port from fallback list
const FALLBACK_PORTS = [3000, 3001, 3002, 3003]

function checkPort(port) {
  return new Promise((resolve) => {
    const s = net.createServer()
    s.once('error', () => { s.close(); resolve(false) })
    s.once('listening', () => { s.close(); resolve(true) })
    s.listen(port)
  })
}

async function findFreePort(ports) {
  for (const port of ports) {
    if (await checkPort(port)) return port
  }
  return null
}

// ─── START SERVER IMMEDIATELY (serve static + 503 for API) ─────
async function boot() {
  const startPort = parseInt(process.env.PORT || '3000')
  const portsToTry = [startPort, ...FALLBACK_PORTS.filter(p => p !== startPort)]
  const freePort = await findFreePort(portsToTry)
  if (!freePort) {
    console.error('[ERROR] All ports are in use.')
    process.exit(1)
  }

  // Start HTTP + WS immediately — frontend can load, API returns 503
  server.listen(freePort, () => {
    console.log(`[HTTP] Server listening on http://localhost:${freePort} (warming up...)`)
    console.log(`[WebSocket] Server running on ws://localhost:${freePort}`)
  })

  // ─── INIT DB + SERVICES IN BACKGROUND ────────────────────────
  try {
    const connected = await testConnection()
    dbConnected = connected
    if (connected) {
      console.log('[Database] Connected — initializing schema...')
      const schemaOk = await initializeSchema()
      if (schemaOk) console.log('[Database] Schema ready')
      else console.warn('[Database] Schema init returned false')
    }

    const { loadApiKeysFromDb } = await import('./database/connection.js')
    await loadApiKeysFromDb()

    const { loadSecrets } = await import('./services/secretsManager.js')
    loadSecrets()

    try {
      const { initNotificationsTable } = await import('./services/notificationService.js')
      await initNotificationsTable()
      console.log('[Startup] Notifications table ready')
    } catch (e) { console.warn('[Startup] Notifications table init skipped:', e.message) }

    try {
      const { startEventListeners } = await import('./services/eventListeners.js')
      startEventListeners()
      console.log('[Startup] Event listeners active')
    } catch (e) { console.warn('[Startup] Event listeners error:', e.message) }

    try {
      await import('./services/scheduler.js')
      console.log('[Startup] Scheduler started')
    } catch (e) { console.warn('[Startup] Scheduler error:', e.message) }

    // Initialize WhatsApp (embedded client — single source of truth).
    // Gated so it can be toggled without code edits: set ENABLE_WHATSAPP=false to disable.
    if (process.env.ENABLE_WHATSAPP !== 'false') {
      import('./services/whatsappService.js').then(ws => {
        ws.initWhatsApp()
      }).catch(err => {
        console.warn('[WhatsApp] Failed to initialize:', err.message)
      })
    } else {
      console.log('[WhatsApp] Disabled via ENABLE_WHATSAPP=false')
    }

    // ✅ Server fully ready — allow API requests
    serverReady = true
    console.log(`[HTTP] Server ready on http://localhost:${freePort}`)
    console.log(`[Auth] ${ENABLE_AUTH ? 'Enabled' : 'Disabled (dev mode)'}`)
    console.log(`[Database] ${dbConnected ? 'Connected' : 'Not connected (file-based mode)'}`)

    // NOTE: the old 30s `SELECT 1` keep-alive and the 30s scheduled-post scan
    // used to live here. Both kept the Neon compute awake 24/7 (it only
    // suspends after ~5 min with zero queries), which blew through the compute
    // quota every ~8 days. Health is now derived from real query traffic
    // (database/connection.js) and due work runs on exact-time timers
    // (services/dueScheduler.js). Do not reintroduce a periodic ping here.
    try {
      const { startDueScheduler } = await import('./services/dueScheduler.js')
      startDueScheduler(freePort)
    } catch (e) {
      console.warn('[Startup] Due scheduler error:', e.message)
    }

  } catch (err) {
    console.error('[Startup] Critical error:', err.message)
    // Still mark ready so at least static files work
    serverReady = true
  }
}

boot()
