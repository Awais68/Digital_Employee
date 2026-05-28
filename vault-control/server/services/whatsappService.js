import { createRequire } from 'module'
import path from 'path'
import fs from 'fs'
import { bus, EVENTS } from './eventBus.js'
import { notify } from './notificationService.js'
import { query } from '../database/connection.js'

const require = createRequire(import.meta.url)

const SESSION_DIR = path.resolve(
  process.env.WHATSAPP_SESSION_PATH ||
  path.join(process.cwd(), 'whatsapp_session')
)
fs.mkdirSync(SESSION_DIR, { recursive: true })
console.log('[WhatsApp] Session directory:', SESSION_DIR)

let waClient  = null
let waStatus  = 'disconnected'
let qrData    = null
let initTried = false

let chatsCache     = null
let chatsCacheTime = 0
const CACHE_TTL    = 20000

export async function initWhatsApp() {
  if (initTried && waClient) {
    console.log('[WhatsApp] Already initialized, status:', waStatus)
    return
  }
  initTried = true

  try {
    const { Client, LocalAuth } = require('whatsapp-web.js')
    const QRCode                = require('qrcode')

    waClient = new Client({
      authStrategy: new LocalAuth({
        dataPath:  SESSION_DIR,
        clientId: 'ai-employee'
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
          '--single-process'
        ]
      },
      restartOnAuthFail: false
    })

    waClient.on('qr', async (qr) => {
      qrData   = await QRCode.toDataURL(qr)
      waStatus = 'qr_pending'
      console.log('[WhatsApp] QR generated — scan ONCE to connect permanently')
      broadcast('whatsapp:qr',     { qr: qrData })
      broadcast('whatsapp:status', { status: 'qr_pending' })
    })

    waClient.on('authenticated', () => {
      qrData   = null
      waStatus = 'authenticated'
      console.log('[WhatsApp] Authenticated — session saved permanently to:', SESSION_DIR)
      broadcast('whatsapp:status', { status: 'authenticated' })
    })

    waClient.on('auth_failure', (msg) => {
      console.error('[WhatsApp] Auth failed:', msg)
      waStatus = 'auth_failed'
      notify('error', 'WhatsApp Auth Failed', msg)
    })

    waClient.on('ready', async () => {
      waStatus = 'connected'
      qrData   = null
      console.log('[WhatsApp] CONNECTED and ready')
      broadcast('whatsapp:status', { status: 'connected' })
      notify('success', 'WhatsApp Connected', 'WhatsApp is connected and monitoring messages')
      bus.emit(EVENTS.WA_CONNECTED, { time: new Date().toISOString() })

      setTimeout(() => refreshChatsCache(), 2000)
    })

    waClient.on('message', async (msg) => {
      if (msg.from === 'status@broadcast') return
      if (!msg.body?.trim()) return

      let contactName = msg.from
      try {
        const contact = await msg.getContact()
        contactName = contact.pushname || contact.name || msg.from
      } catch {}

      const msgData = {
        id:        msg.id.id,
        from:      msg.from,
        body:      msg.body,
        timestamp: new Date(msg.timestamp * 1000).toISOString(),
        isGroup:   msg.from.endsWith('@g.us'),
        contact:   contactName,
      }

      await saveMessageToDB(msgData)

      chatsCache = null

      broadcast('whatsapp:message', msgData)
      bus.emit(EVENTS.WA_MESSAGE, msgData)

      notify('info', `WhatsApp: ${contactName}`, msg.body.substring(0, 80))
    })

    waClient.on('disconnected', (reason) => {
      waStatus = 'disconnected'
      console.warn('[WhatsApp] Disconnected:', reason)
      broadcast('whatsapp:status', { status: 'disconnected', reason })
      notify('warning', 'WhatsApp Disconnected', reason || 'Connection lost')

      const sessionExists = fs.existsSync(
        path.join(SESSION_DIR, '.wwebjs_auth')
      )
      if (sessionExists) {
        console.log('[WhatsApp] Session found — reconnecting in 10s...')
        setTimeout(() => {
          if (waClient) waClient.initialize().catch(console.error)
        }, 10000)
      } else {
        console.log('[WhatsApp] No session found — will show QR on next init')
      }
    })

    await waClient.initialize()
    console.log('[WhatsApp] Initialized — checking saved session...')

  } catch (err) {
    console.error('[WhatsApp] Init failed:', err.message)
    waStatus = 'error'
    notify('error', 'WhatsApp Init Error', err.message)
  }
}

export async function sendMessage(to, text) {
  if (waStatus !== 'connected' || !waClient) {
    throw new Error(`WhatsApp not connected (status: ${waStatus})`)
  }
  const chatId = to.includes('@') ? to : `${to}@c.us`
  await waClient.sendMessage(chatId, text)
  return { success: true }
}

export async function getLiveChats() {
  if (waStatus !== 'connected' || !waClient) return []

  if (chatsCache && (Date.now() - chatsCacheTime) < CACHE_TTL) {
    return chatsCache
  }

  await refreshChatsCache()
  return chatsCache || []
}

async function refreshChatsCache() {
  if (!waClient || waStatus !== 'connected') return
  try {
    const chats = await waClient.getChats()
    chatsCache = await Promise.all(
      chats.slice(0, 60).map(async (chat) => {
        try {
          const msgs = await chat.fetchMessages({ limit: 1 })
          const last = msgs[msgs.length - 1]
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
      })
    )
    chatsCacheTime = Date.now()
  } catch (e) {
    console.error('[WhatsApp] refreshChatsCache error:', e.message)
  }
}

export async function getLiveChatMessages(chatId, limit = 50) {
  if (waStatus !== 'connected' || !waClient) return []
  try {
    const chat = await waClient.getChatById(chatId)
    await chat.sendSeen().catch(() => {})
    const msgs = await chat.fetchMessages({ limit })
    chatsCache = null
    return msgs.map(m => ({
      id:     m.id._serialized,
      text:   m.body,
      time:   new Date(m.timestamp * 1000).toISOString(),
      sender: m.fromMe ? 'Me' : (m._data?.notifyName || m.from),
      type:   m.fromMe ? 'outgoing' : 'incoming',
      fromMe: m.fromMe,
    }))
  } catch (e) {
    console.error('[WhatsApp] getLiveChatMessages error:', e.message)
    return []
  }
}

export function getStatus() { return waStatus }
export function getQR()     { return qrData   }

async function saveMessageToDB(msg) {
  try {
    await query(`
      INSERT INTO whatsapp_messages
        (msg_id, from_number, body, timestamp, is_group, contact_name, direction, type, is_read)
      VALUES($1,$2,$3,$4,$5,$6,'incoming','incoming',false)
      ON CONFLICT(msg_id) DO NOTHING
    `, [msg.id, msg.from, msg.body, msg.timestamp, msg.isGroup, msg.contact])
  } catch {}
}

function broadcast(type, data) {
  if (global.wsBroadcast) global.wsBroadcast({ type, ...data })
}
