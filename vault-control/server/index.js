import express from 'express'
import { WebSocketServer } from 'ws'
import { createServer } from 'http'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'
import dotenv from 'dotenv'
import chokidar from 'chokidar'
import { refreshAndBroadcast, getVaultCounts, getRecentActivity, getPendingApprovals, getServiceStatus } from './system-status.js'

// Import routes
import approvalsRouter from './routes/approvals.js'
import emailsRouter from './routes/emails.js'
import draftsRouter from './routes/drafts.js'
import socialRouter from './routes/social.js'
import systemRouter from './routes/system.js'
import logsRouter from './routes/logs.js'
import odooRouter from './routes/odoo.js'

dotenv.config({ override: true })
// ... rest of imports

// API Routes
app.use('/api/approvals', approvalsRouter)
app.use('/api/emails', emailsRouter)
app.use('/api/drafts', draftsRouter)
app.use('/api/social', socialRouter)
app.use('/api/system', systemRouter)
app.use('/api/logs', logsRouter)
app.use('/api/odoo', odooRouter)

// Serve React app (only if dist exists)
if (existsSync(join(distPath, 'index.html'))) {
  app.get('/*', (req, res) => {
    res.sendFile(join(distPath, 'index.html'))
  })
}

// WebSocket Connection
wss.on('connection', (ws) => {
  console.log('WebSocket client connected')

  // Send initial dashboard state
  const initialState = {
    type: 'initial_state',
    vaultCounts: getVaultCounts(true),
    recentActivity: getRecentActivity(10),
    pendingApprovals: getPendingApprovals(),
    services: getServiceStatus(),
    timestamp: new Date(),
  }
  ws.send(JSON.stringify(initialState))

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message)
      console.log('Received:', data)

      // Handle refresh request
      if (data.type === 'refresh') {
        const updated = refreshAndBroadcast()
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

// Vault file watcher - emit WebSocket events on changes
const vaultPath = process.env.VAULT_PATH
if (vaultPath) {
  const watcher = chokidar.watch(vaultPath, {
    ignored: /(^|[\/\\])\.|node_modules/,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100,
    },
  })

  // Debounce rapid changes
  let debounceTimer = null
  const debouncedRefresh = () => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      console.log('[Vault Change] Refreshing dashboard data...')
      refreshAndBroadcast()
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
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(JSON.stringify(message))
    }
  })
}

// Global broadcast function for use in routes
global.broadcast = broadcast

// Periodic refresh every 30 seconds
setInterval(() => {
  refreshAndBroadcast()
}, 30000)

// Start servers
server.listen(PORT, () => {
  console.log(`[HTTP] Server running on http://localhost:${PORT}`)
  console.log(`[WebSocket] Server running on ws://localhost:${PORT}`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...')
  server.close(() => console.log('HTTP server closed'))
  wss.close(() => console.log('WebSocket server closed'))
})
