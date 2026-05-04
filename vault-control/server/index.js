import 'dotenv/config'
import express from 'express'
import { WebSocketServer } from 'ws'
import { createServer } from 'http'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'
import chokidar from 'chokidar'
import { refreshAndBroadcast, getVaultCounts, getRecentActivity, getPendingApprovals, getServiceStatus } from './system-status.js'
import { testConnection, closePool } from './database/connection.js'
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

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const distPath = join(__dirname, '../dist')

const PORT = process.env.PORT || 3000
const ENABLE_AUTH = process.env.ENABLE_AUTH === 'true'

const app = express()
app.use(express.json())

const server = createServer(app)
const wss = new WebSocketServer({ server })

// Initialize database
let dbConnected = false
testConnection().then(connected => {
  dbConnected = connected
})

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
app.use('/api', rateLimiter({ windowMs: 15 * 60 * 1000, max: 200 }))

// Auth middleware (optional - enabled via ENABLE_AUTH=true)
if (ENABLE_AUTH) {
  app.use('/api', (req, res, next) => {
    // Skip auth for login/register/health
    if (req.path.startsWith('/auth/') || req.path.startsWith('/health')) {
      return next()
    }
    authenticateToken(req, res, next)
  })
}

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

// API Routes
app.use('/api/auth', authRouter)
app.use('/api/approvals', approvalsRouter)
app.use('/api/emails', emailsRouter)
app.use('/api/drafts', draftsRouter)
app.use('/api/social', socialRouter)
app.use('/api/system', systemRouter)
app.use('/api/logs', logsRouter)
app.use('/api/odoo', odooRouter)
app.use('/api/whatsapp', whatsappRouter)
app.use('/api/vault', vaultRouter)
app.use('/api/export', exportRouter)
app.use('/api/todos', todosRouter)

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
wss.on('connection', async (ws) => {
  console.log('WebSocket client connected')

  // Send initial dashboard state
  const initialState = {
    type: 'initial_state',
    vaultCounts: getVaultCounts(true),
    recentActivity: getRecentActivity(10),
    pendingApprovals: getPendingApprovals(),
    services: await getServiceStatus(),
    timestamp: new Date(),
  }
  ws.send(JSON.stringify(initialState))

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message)
      console.log('Received:', data)

      if (data.type === 'refresh') {
        const updated = await refreshAndBroadcast()
        ws.send(JSON.stringify(updated))
      }
    } catch (err) {
      console.error('Failed to parse message:', err)
    }
  })

  ws.on('close', () => {
    console.log('WebSocket client disconnected')
  })
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

// Broadcast to all connected clients
function broadcast(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      try {
        client.send(JSON.stringify(message))
      } catch (err) {
        console.error('Broadcast error:', err)
      }
    }
  })
}

global.broadcast = broadcast

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

// Start servers
server.listen(PORT, () => {
  console.log(`[HTTP] Server running on http://localhost:${PORT}`)
  console.log(`[WebSocket] Server running on ws://localhost:${PORT}`)
  console.log(`[Auth] ${ENABLE_AUTH ? 'Enabled' : 'Disabled (dev mode)'}`)
  console.log(`[Database] ${dbConnected ? 'Connected' : 'Not connected (file-based mode)'}`)
})
