import { createRequire } from 'module'

const require = createRequire(import.meta.url)

let _createNotification = null
async function getNotifier() {
  if (!_createNotification) {
    const mod = await import('./notificationService.js')
    _createNotification = mod.createNotification
  }
  return _createNotification
}

let waClient = null
let qrCodeData = null
let waStatus = 'disconnected'

function waBroadcast(type, data) {
  if (global.broadcast) {
    global.broadcast({ type, ...data })
  }
}

export async function initWhatsApp() {
  try {
    const { Client, LocalAuth } = require('whatsapp-web.js')
    const QRCode = require('qrcode')

    waClient = new Client({
      authStrategy: new LocalAuth({
        dataPath: process.env.WHATSAPP_SESSION_PATH || './whatsapp_session',
      }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
      },
    })

    waClient.on('qr', async (qr) => {
      qrCodeData = await QRCode.toDataURL(qr)
      waStatus = 'qr_pending'
      console.log('[WhatsApp] QR code generated — scan with phone')
      waBroadcast('whatsapp:qr', { qr: qrCodeData })
    })

    waClient.on('authenticated', () => {
      waStatus = 'authenticated'
      qrCodeData = null
      console.log('[WhatsApp] Authenticated')
      waBroadcast('whatsapp:status', { status: 'authenticated' })
    })

    waClient.on('ready', () => {
      waStatus = 'connected'
      chatsCache = null
      chatsCacheTime = 0
      console.log('[WhatsApp] Connected')
      waBroadcast('whatsapp:status', { status: 'connected' })
    })

    waClient.on('message', async (msg) => {
      chatsCache = null
      let contactName = msg.from
      try {
        const c = await msg.getContact()
        contactName = c.pushname || c.name || msg.from
      } catch {}
      const messageData = {
        id: msg.id.id,
        from: msg.from,
        body: msg.body,
        timestamp: new Date(msg.timestamp * 1000).toISOString(),
        isGroup: msg.from.endsWith('@g.us'),
        contact: contactName,
      }
      await saveWhatsAppMessage(messageData)
      waBroadcast('whatsapp:message', messageData)
      const notify = await getNotifier()
      if (!msg.from.endsWith('@g.us')) {
        notify('info', 'WhatsApp Message', `From: ${contactName} — ${msg.body.substring(0, 80)}`, { source: 'whatsapp', contact: contactName })
      }
    })

    waClient.on('disconnected', (reason) => {
      waStatus = 'disconnected'
      console.log('[WhatsApp] Disconnected:', reason)
      waBroadcast('whatsapp:status', { status: 'disconnected', reason })
      setTimeout(() => waClient.initialize(), 5000)
    })

    await waClient.initialize()
    console.log('[WhatsApp] Initialized — waiting for QR scan...')
  } catch (err) {
    const msg = err.message || ''
    // Stale session — delete and retry once
    if (msg.includes('browser is already running') || msg.includes('Session closed')) {
      console.warn('[WhatsApp] Stale session detected, cleaning up...')
      try {
        const fs = require('fs')
        const p = require('path')
        const sessionDir = process.env.WHATSAPP_SESSION_PATH || './whatsapp_session'
        if (fs.existsSync(sessionDir)) {
          fs.rmSync(sessionDir, { recursive: true, force: true })
          console.log('[WhatsApp] Stale session removed, retrying...')
          setTimeout(() => initWhatsApp(), 2000)
          waStatus = 'disconnected'
          return
        }
      } catch (e) {
        console.warn('[WhatsApp] Cleanup failed:', e.message)
      }
    }
    console.warn('[WhatsApp] Failed to init:', msg)
    waStatus = 'error'
  }
}

export async function sendMessage(to, message) {
  if (!waClient || waStatus !== 'connected') throw new Error('WhatsApp not connected')
  const chatId = to.includes('@') ? to : `${to}@c.us`
  await waClient.sendMessage(chatId, message)
  return { success: true }
}

async function saveWhatsAppMessage(msg) {
  try {
    const { query } = await import('../database/connection.js')
    await query(`
      INSERT INTO whatsapp_messages(msg_id, from_number, body, timestamp, is_group, contact_name, direction, type, is_read)
      VALUES($1,$2,$3,$4,$5,$6,'incoming','incoming',false) ON CONFLICT(msg_id) DO NOTHING
    `, [msg.id, msg.from, msg.body, msg.timestamp, msg.isGroup, msg.contact])
  } catch {}
}

async function createTodoFromWhatsApp(msg) {
  try {
    const { query } = await import('../database/connection.js')
    await query(`
      INSERT INTO todos(title, description, source, source_id, priority)
      VALUES($1,$2,'whatsapp',$3,'medium')
    `, [`WhatsApp: ${msg.body.substring(0, 60)}`, msg.body, msg.id])
  } catch {}
}

export function getStatus() {
  return waStatus
}

export function getQR() {
  return qrCodeData
}

let chatsCache = null
let chatsCacheTime = 0
let chatsPromise = null

export async function getLiveChats() {
  if (chatsCache && Date.now() - chatsCacheTime < 15000) {
    return chatsCache
  }

  if (chatsPromise) return chatsPromise

  if (!waClient || waStatus !== 'connected') return []

  chatsPromise = (async () => {
    try {
      const chats = await waClient.getChats()
      const sorted = chats
        .filter(c => !c.isGroup || c.unreadCount > 0)
        .slice(0, 60)

      const result = await Promise.all(sorted.map(async (chat) => {
        try {
          const msgs = await chat.fetchMessages({ limit: 1 })
          const last  = msgs[msgs.length - 1]
          return {
            id:           chat.id._serialized,
            name:         chat.name || chat.id.user,
            phone:        chat.id.user,
            isGroup:      chat.isGroup,
            unread:       chat.unreadCount || 0,
            preview:      last?.body?.substring(0, 80) || '',
            time:         last
                            ? new Date(last.timestamp * 1000).toISOString()
                            : new Date().toISOString(),
            messageCount: chat.lastMessage ? 1 : 0,
            pinned:       chat.pinned || false,
          }
        } catch {
          return {
            id: chat.id._serialized, name: chat.name || chat.id.user,
            phone: chat.id.user, isGroup: chat.isGroup,
            unread: chat.unreadCount || 0, preview: '',
            time: new Date().toISOString(), messageCount: 0, pinned: false,
          }
        }
      }))

      chatsCache = result
      chatsCacheTime = Date.now()
      return result
    } catch (e) {
      console.error('[WA] getLiveChats error:', e.message)
      return []
    } finally {
      chatsPromise = null
    }
  })()

  return chatsPromise
}

export async function getLiveChatMessages(chatId, limit = 50) {
  if (!waClient || waStatus !== 'connected') return []
  try {
    const chat = await waClient.getChatById(chatId)
    await chat.sendSeen().catch(() => {})
    const msgs = await chat.fetchMessages({ limit })
    return msgs.map(m => ({
      id:     m.id._serialized,
      text:   m.body,
      time:   new Date(m.timestamp * 1000).toISOString(),
      sender: m.fromMe ? 'Me' : (m._data?.notifyName || m.from),
      type:   m.fromMe ? 'outgoing' : 'incoming',
      fromMe: m.fromMe,
    }))
  } catch (e) {
    console.error('[WA] getLiveChatMessages error:', e.message)
    return []
  }
}