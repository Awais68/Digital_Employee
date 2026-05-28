import 'dotenv/config'
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
import { testConnection, initializeSchema, closePool, query } from './database/connection.js'
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

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const distPath = join(__dirname, '../dist')

const PORT = process.env.PORT || 3000
const ENABLE_AUTH = process.env.ENABLE_AUTH === 'true'

const app = express()
app.use(compression())
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
  if (sent > 0) console.log(`[WS] Broadcast to ${sent} clients:`, data.type)
}
global.broadcast = global.wsBroadcast

// Initialize database
let dbConnected = false
async function initDatabase() {
  const connected = await testConnection()
  dbConnected = connected
  if (connected) {
    await initializeSchema()
  }
  return dbConnected
}

// Security headers
app.use((req, res, next) => {
  res.header('X-Content-Type-Options', 'nosniff')
  res.header('X-Frame-Options', 'DENY')
  res.header('X-XSS-Protection', '1; mode=block')
  next()
})

// CORS - configurable
app.use((req, res, next) => {
  const allowedOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173'
  res.header('Access-Control-Allow-Origin', allowedOrigin)
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
app.use('/api/whatsapp',      whatsappRouter)
app.use('/api/auth',          authRouter)

// CSRF token endpoint
app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: generateCSRFToken() })
})

// Health check (no auth required)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database: dbConnected ? 'connected' : 'disconnected',
    auth: ENABLE_AUTH ? 'enabled' : 'disabled',
    timestamp: new Date().toISOString(),
  })
})

// ─── AUTH MIDDLEWARE (optional - enabled via ENABLE_AUTH=true) ──
if (ENABLE_AUTH) {
  app.use('/api', (req, res, next) => {
    // Skip auth for routes registered above
    if (req.path.startsWith('/notifications/') || req.path.startsWith('/whatsapp/') ||
        req.path.startsWith('/internal/') || req.path.startsWith('/csrf-token') ||
        req.path.startsWith('/health') || req.path.startsWith('/auth/')) {
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
app.use('/api/admin', adminRouter)

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
app.post('/api/internal/process-email', express.json(), async (req, res) => {
  res.json({ received: true })

  const { subject, sender, body, priority, filename } = req.body
  console.log(`[AI Email] Processing: "${subject?.substring(0, 60)}" from ${sender} [${priority}]`)

  try {
    const { callAI } = await import('./services/aiProvider.js')
    const { notify } = await import('./services/notificationService.js')

    const systemPrompt = `You are an autonomous AI employee. Analyze this email and decide what action to take. Respond ONLY in valid JSON with no markdown formatting.`
    const userPrompt = `Email from: ${sender}
Subject: ${subject}
Priority: ${priority}
Body: ${body?.substring(0, 1500) || ''}

Respond with this exact JSON structure:
{
  "requires_response": true/false,
  "urgency": "immediate/today/this_week/no_action",
  "action_type": "reply/forward/create_task/archive/escalate",
  "draft_reply": "if reply needed, the full reply text here, else null",
  "task_title": "if task needed, short task title here, else null",
  "task_description": "task details if needed",
  "summary": "one line summary of what needs to happen"
}`

    let plan
    try {
      const raw = await callAI(systemPrompt, userPrompt, 800)
      const cleaned = raw.replace(/```json|```/g, '').trim()
      plan = JSON.parse(cleaned)
    } catch {
      plan = { requires_response: false, urgency: 'today', action_type: 'archive', summary: 'Email logged for review' }
    }

    console.log('[AI Email] Plan:', JSON.stringify(plan))

    // 1. Create todo if action needed
    if (plan.task_title) {
      try {
        const { query } = await import('./database/connection.js')
        await query(
          `INSERT INTO todos(title, description, source, priority) VALUES($1,$2,'email',$3)`,
          [plan.task_title, plan.task_description || body?.substring(0, 200) || '',
           priority === 'high' ? 'high' : 'medium']
        )
        notify('info', 'Task Created', plan.task_title)
      } catch (dbErr) {
        console.error('[AI Email] DB error creating todo:', dbErr.message)
      }
    }

    // 2. Create draft reply in Pending_Approval if response needed
    if (plan.requires_response && plan.draft_reply) {
      try {
        const fs = await import('fs')
        const path = await import('path')
        const vaultPath = process.env.VAULT_PATH || '.'
        const approvalDir = path.join(vaultPath, 'Pending_Approval')
        fs.mkdirSync(approvalDir, { recursive: true })

        const approvalFile = path.join(approvalDir, `EMAIL_REPLY_${Date.now()}.md`)

        const replyContent = `---
type: email_reply
to: ${sender || 'unknown'}
subject: Re: ${subject || ''}
priority: ${priority || 'medium'}
status: pending_approval
created: ${new Date().toISOString()}
action: send_email
---

## Proposed Reply

${plan.draft_reply}

## Original Email
From: ${sender || 'unknown'}
Subject: ${subject || ''}

---
Move to /Approved/ to send this reply.
`
        fs.writeFileSync(approvalFile, replyContent, 'utf-8')
        console.log(`[AI Email] Approval file created: ${approvalFile}`)

        notify('warning', 'Reply Draft Ready',
          `Draft reply to "${subject?.substring(0, 50)}" needs your approval`,
          { file: approvalFile, action: 'approve_reply' })
      } catch (fsErr) {
        console.error('[AI Email] Error creating approval file:', fsErr.message)
      }
    }

    // 3. WhatsApp notification for urgent emails
    if (priority === 'high') {
      try {
        const whatsapp = await import('./services/whatsappService.js')
        if (whatsapp.getStatus() === 'connected') {
          const ownerPhone = process.env.OWNER_PHONE
          if (ownerPhone) {
            await whatsapp.sendMessage(ownerPhone,
              `🔴 *URGENT EMAIL*\n\nFrom: ${sender}\nSubject: ${subject}\n\nAI Action: ${plan.summary || 'Review required'}${plan.requires_response ? '\n📝 Draft reply created — check dashboard' : ''}`
            ).catch(() => {})
          }
        }
      } catch (waErr) {
        console.error('[AI Email] WhatsApp notify error:', waErr.message)
      }
    }

    // 4. Final confirmation notification
    notify(
      priority === 'high' ? 'urgent' : 'info',
      `Email Processed: ${(subject || '').substring(0, 40)}`,
      plan.summary || 'Email processed by AI',
      { action: plan.action_type, hasReply: !!plan.requires_response }
    )

  } catch (e) {
    console.error('[AI Email] Processing error:', e.message)
  }
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

// Serve React app
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
      /\.git/,
      /\.obsidian/,
      /\.claude/,
      /\.qwen/,
    ],
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
      console.log('[Vault Change] Refreshing dashboard data...')
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

  watcher.on('add', (path) => {
    console.log(`[Vault Change] File added: ${path}`)
    debouncedRefresh()
  })

  watcher.on('change', (path) => {
    console.log(`[Vault Change] File changed: ${path}`)
    debouncedRefresh()
  })

  watcher.on('unlink', (path) => {
    console.log(`[Vault Change] File deleted: ${path}`)
    debouncedRefresh()
  })

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
    const server = net.createServer()
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false)
      } else {
        resolve(false)
      }
      server.close()
    })
    server.once('listening', () => {
      server.close()
      resolve(true)
    })
    server.listen(port)
  })
}

async function findFreePort(ports) {
  for (const port of ports) {
    const isFree = await checkPort(port)
    if (isFree) {
      console.log(`[INFO] Port ${port} is available`)
      return port
    }
    console.warn(`[WARN] Port ${port} is in use, skipping...`)
  }
  return null
}

// Start servers — CRITICAL STARTUP ORDER 🚨
initDatabase().then(async () => {
  // 1. Load encrypted API keys
  const { loadApiKeysFromDb } = await import('./database/connection.js')
  await loadApiKeysFromDb()

  // 2. Load secrets
  const { loadSecrets } = await import('./services/secretsManager.js')
  loadSecrets()

  // 3. Init notifications table (DB-backed)
  try {
    const { initNotificationsTable } = await import('./services/notificationService.js')
    await initNotificationsTable()
    console.log('[Startup] Notifications table ready')
  } catch (e) {
    console.warn('[Startup] Notifications table init skipped:', e.message)
  }

  // 4. Start event listeners (wires bus -> notifications, todos, etc.)
  try {
    const { startEventListeners } = await import('./services/eventListeners.js')
    startEventListeners()
    console.log('[Startup] Event listeners active')
  } catch (e) {
    console.warn('[Startup] Event listeners error:', e.message)
  }

  // 5. Start scheduler (cron jobs)
  try {
    await import('./services/scheduler.js')
    console.log('[Startup] Scheduler started')
  } catch (e) {
    console.warn('[Startup] Scheduler error:', e.message)
  }

  const startPort = parseInt(process.env.PORT || '3000')
  const portsToTry = [startPort, ...FALLBACK_PORTS.filter(p => p !== startPort)]
  console.log(`[INFO] Trying ports: ${portsToTry.join(', ')}`)
  
  const freePort = await findFreePort(portsToTry)
  if (!freePort) {
    console.error('[ERROR] All ports are in use. Please free up a port.')
    process.exit(1)
  }

  server.listen(freePort, () => {
    console.log(`[HTTP] Server running on http://localhost:${freePort}`)
    console.log(`[WebSocket] Server running on ws://localhost:${freePort}`)
    console.log(`[Auth] ${ENABLE_AUTH ? 'Enabled' : 'Disabled (dev mode)'}`)
    console.log(`[Database] ${dbConnected ? 'Connected' : 'Not connected (file-based mode)'}`)

    // 6. Initialize WhatsApp (after everything else is ready)
    import('./services/whatsappService.js').then(ws => {
      ws.initWhatsApp()
    }).catch(err => {
      console.warn('[WhatsApp] Failed to initialize:', err.message)
    })

    // Scheduled post checker — runs every 30 seconds
    setInterval(async () => {
      try {
        const due = await query(
          `SELECT * FROM scheduled_posts WHERE status='scheduled' AND scheduled_for <= NOW() LIMIT 5`
        )
        for (const post of due.rows) {
          try {
            await query(`UPDATE scheduled_posts SET status='publishing' WHERE id=$1`, [post.id])
            console.log(`[Scheduler] Publishing scheduled post ${post.id}...`)
            const { default: axios } = await import('axios')
            await axios.post(`http://localhost:${freePort}/api/social/draft/${post.id}/publish`)
            await query(`UPDATE scheduled_posts SET status='published', published_at=NOW() WHERE id=$1`, [post.id])
            console.log(`[Scheduler] Published ${post.id}`)
          } catch (err) {
            console.error(`[Scheduler] Failed post ${post.id}:`, err.message)
            await query(`UPDATE scheduled_posts SET status='failed' WHERE id=$1`, [post.id]).catch(() => {})
          }
        }
      } catch {}
    }, 30000)
  })
})
