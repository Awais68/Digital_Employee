import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { execFileSync } from 'child_process'
import { bus, EVENTS } from './eventBus.js'
import { notify } from './notificationService.js'
import { query } from '../database/connection.js'

const require = createRequire(import.meta.url)

// First existing path wins; undefined lets puppeteer fall back to its own
// bundled download on a dev machine where Chrome was installed by npm.
function resolveChromePath() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
  ].filter(Boolean)
  return candidates.find(c => fs.existsSync(c))
}

// Anchor the session to this file's location, never process.cwd().
// cwd varies between `npm run dev`, PM2 and systemd, and every different cwd
// produced a *new* session directory -> a new QR scan every time.
const SERVICE_DIR = path.dirname(fileURLToPath(import.meta.url))
const SESSION_DIR = path.resolve(
  process.env.WHATSAPP_SESSION_PATH ||
  path.join(SERVICE_DIR, '..', '..', 'whatsapp_session')
)
// LocalAuth({ dataPath, clientId }) stores everything under `session-<clientId>`.
const WA_CLIENT_ID = 'ai-employee'
const AUTH_DIR = path.join(SESSION_DIR, `session-${WA_CLIENT_ID}`)
fs.mkdirSync(SESSION_DIR, { recursive: true })
console.log('[WhatsApp] Session directory:', SESSION_DIR)

const hasSavedSession = () =>
  fs.existsSync(AUTH_DIR) && fs.readdirSync(AUTH_DIR).length > 0

// --- Stale Chrome cleanup ---------------------------------------------------
// A Chrome left over from a previous PM2 run keeps holding AUTH_DIR, so
// whatsapp-web.js dies with "browser is already running for ... Use a
// different userDataDir". Deleting the lock files is not enough while the
// owning process is alive — it has to be killed first.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// The absolute path contains spaces and other regex metacharacters, and
// `pgrep -f` treats its pattern as a regex — escape it so it matches literally.
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Only processes whose command line carries this exact session path, never a
// generic "chrome" match — the user's own browser must survive.
function findStaleSessionPids(authDir) {
  const own = new Set([process.pid, process.ppid])
  try {
    const out = execFileSync('pgrep', ['-f', escapeRegex(authDir)], {
      encoding: 'utf8',
      timeout:  5000
    })
    return out
      .split('\n')
      .map((l) => parseInt(l.trim(), 10))
      .filter((pid) => Number.isInteger(pid) && pid > 0 && !own.has(pid))
  } catch {
    // pgrep exits 1 when nothing matches — that is the healthy case.
    return []
  }
}

function clearSessionLocks(authDir) {
  for (const name of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    try { fs.rmSync(path.join(authDir, name), { force: true }) } catch {}
  }
}

// Runs before every initialize() and before every reconnect attempt.
// Zero stale processes is a perfectly normal outcome — never throws.
async function killStaleSessionProcess(authDir) {
  let pids = []
  try {
    pids = findStaleSessionPids(authDir)
    for (const pid of pids) {
      try { process.kill(pid, 'SIGKILL') } catch {}
    }
    if (pids.length) await sleep(1000)   // let the OS release the dir lock
    clearSessionLocks(authDir)
  } catch (e) {
    console.warn('[WhatsApp] Stale-process cleanup skipped:', e.message)
  }
  console.log(`[WhatsApp] Cleaned ${pids.length} stale process(es) before init`)
  return pids.length
}

let reconnectAttempts = 0
let reconnectTimer    = null

let waClient  = null
let waStatus  = 'disconnected'
let qrData    = null
let initTried = false
let qrLogged  = false

let chatsCache     = null
let chatsCacheTime = 0
const CACHE_TTL    = 20000

// Failure state for the chat-list refresh. Without it a failing getChats() was
// retried on literally every request, because only the SUCCESS path touched
// chatsCacheTime.
let chatsFailUntil  = 0
let chatsFailStreak = 0
const FAIL_BACKOFF_MS  = 15000
const FAIL_BACKOFF_MAX = 120000

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
        clientId:  WA_CLIENT_ID
      }),
      puppeteer: {
        headless: true,
        // whatsapp-web.js ships no browser of its own and puppeteer looks for a
        // download that does not exist on a server install, so init failed with
        // "Could not find Chrome" on every retry -- that loop is what filled the
        // disk with core dumps. Point it at the system Chrome instead; the env
        // var wins so a different path can be set per machine.
        executablePath: resolveChromePath(),
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--disable-extensions',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
          // NOTE: --single-process and --no-zygote crash Chrome under
          // whatsapp-web.js and were the cause of the random disconnects.
        ]
      },
      takeoverOnConflict: true,
      restartOnAuthFail:  true
    })

    waClient.on('qr', async (qr) => {
      qrData   = await QRCode.toDataURL(qr)
      waStatus = 'qr_pending'
      if (!qrLogged) {
        qrLogged = true
        console.log('[WhatsApp] QR generated — scan ONCE to connect permanently')
      }
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

      reconnectAttempts = 0
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
      startWatchdog()

      // Warm the chat list now that the client says it is ready. This used to be a
      // single shot at 2s, but the WhatsApp Web store that getChats() reaches into
      // is frequently not initialised that early — which is exactly the
      // "refreshChatsCache error: r" that followed every whatsapp:connected in the
      // logs. One failed shot left the cache empty until a user happened to open
      // the WhatsApp page, so retry on a widening delay instead.
      warmChatsCache()
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

      // The owner steers the whole system from this chat: approvals, todos,
      // status. A command is an instruction to us, not an inbound task, so it
      // is answered and then dropped — otherwise every "3 APPROVE" would come
      // back around as its own approval draft.
      try {
        const { handleOwnerCommand, isOwner } = await import('./hitl.js')
        if (isOwner(msg.from)) {
          const reply = await handleOwnerCommand(msg.from, msg.body)
          if (reply) {
            await sendMessage(msg.from, reply)
            chatsCache = null
            broadcast('whatsapp:message', msgData)
            return
          }
        }
      } catch (e) {
        console.error('[WhatsApp] Command handling failed:', e.message)
      }

      createWhatsAppTaskFile(msgData)

      chatsCache = null

      broadcast('whatsapp:message', msgData)
      bus.emit(EVENTS.WA_MESSAGE, msgData)

      notify('info', `WhatsApp: ${contactName}`, msg.body.substring(0, 80))
    })

    // The linked WhatsApp account is the owner's own number, so every approval
    // we send lands in their "Message yourself" chat — and their reply there is
    // an OUTGOING message. whatsapp-web.js never fires 'message' for it, only
    // 'message_create' with fromMe = true, which is why "1 APPROVE" was
    // silently lost. Commands only; nothing here creates a task file.
    waClient.on('message_create', async (msg) => {
      if (!msg.fromMe) return                    // incoming is handled by 'message'
      if (!msg.body?.trim()) return
      if (wasSentByUs(msg.body)) return          // our own reply, not an instruction

      try {
        const { handleOwnerCommand, isOwner } = await import('./hitl.js')
        const chat = msg.to || msg.from
        // Chat id and verdict only — the message body is the owner's own text
        // and there is no reason to write it into a log file.
        console.log(`[WhatsApp] own message in ${chat} — owner=${isOwner(chat)}`)
        if (!isOwner(chat)) return               // only the owner's own chat
        const reply = await handleOwnerCommand(chat, msg.body)
        if (reply) {
          await sendMessage(chat, reply)
          chatsCache = null
        }
      } catch (e) {
        console.error('[WhatsApp] Self-chat command handling failed:', e.message)
      }
    })

    waClient.on('disconnected', (reason) => {
      waStatus = 'disconnected'
      console.warn('[WhatsApp] Disconnected:', reason)
      broadcast('whatsapp:status', { status: 'disconnected', reason })
      notify('warning', 'WhatsApp Disconnected', reason || 'Connection lost')
      scheduleReconnect(reason)
    })

    await killStaleSessionProcess(AUTH_DIR)
    await waClient.initialize()
    console.log('[WhatsApp] Initialized — checking saved session...')

  } catch (err) {
    console.error('[WhatsApp] Init failed:', err.message)
    waStatus = 'error'
    notify('error', 'WhatsApp Init Error', err.message)
    scheduleReconnect('init-failed')
  }
}

// Reconnect with exponential backoff, capped at 5 minutes. Retries forever:
// if the saved session is still valid we come back silently, otherwise the
// client emits a fresh QR — either way the service never stays dead.
function scheduleReconnect(reason) {
  if (reconnectTimer) return
  const delay = Math.min(10000 * Math.pow(2, reconnectAttempts), 300000)
  reconnectAttempts += 1
  console.log(
    `[WhatsApp] Reconnect attempt #${reconnectAttempts} in ${Math.round(delay / 1000)}s` +
    ` (session ${hasSavedSession() ? 'present' : 'missing'}, reason: ${reason || 'n/a'})`
  )
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null
    try {
      if (waClient) { try { await waClient.destroy() } catch {} }
      waClient  = null
      initTried = false
      qrLogged  = false
      await killStaleSessionProcess(AUTH_DIR)
      await initWhatsApp()
    } catch (e) {
      console.error('[WhatsApp] Reconnect failed:', e.message)
      scheduleReconnect('retry')
    }
  }, delay)
}

// Watchdog: whatsapp-web.js sometimes loses the browser without ever emitting
// 'disconnected'. Poll the real client state and force a reconnect if it is gone.
let watchdogStarted = false
function startWatchdog() {
  if (watchdogStarted) return
  watchdogStarted = true
  setInterval(async () => {
    if (waStatus === 'qr_pending' || reconnectTimer) return
    if (!waClient) { scheduleReconnect('no client'); return }
    try {
      const state = await waClient.getState()
      if (state !== 'CONNECTED') {
        console.warn('[WhatsApp] Watchdog saw state:', state)
        waStatus = 'disconnected'
        broadcast('whatsapp:status', { status: 'disconnected', reason: state })
        scheduleReconnect(`watchdog:${state}`)
      } else if (waStatus !== 'connected') {
        waStatus = 'connected'
        broadcast('whatsapp:status', { status: 'connected' })
      }
    } catch (e) {
      console.warn('[WhatsApp] Watchdog probe failed:', e.message)
      scheduleReconnect('watchdog:probe-failed')
    }
  }, 60000).unref?.()
}

function createWhatsAppTaskFile(msg) {
  try {
    // "Ok", "👍" and empty bodies were producing full approval drafts with an
    // empty Message Content block. Nothing under a few characters carries a
    // request, so it never becomes a task.
    const bodyText = String(msg.body || '').trim()
    if (bodyText.length < 4) {
      console.log(`[WhatsApp] Ignoring trivial message from ${msg.contact || msg.from} (${bodyText.length} chars)`)
      return
    }

    const vaultPath = process.env.VAULT_PATH || '.'
    const needsActionDir = path.resolve(vaultPath, 'Needs_Action')
    fs.mkdirSync(needsActionDir, { recursive: true })

    // The trigger filename is keyed on the WhatsApp message id, NOT on the time the
    // file happens to be written. The old name started with `new Date()`, so a
    // message replayed by whatsapp-web.js (history sync after a reconnect, or the
    // message/message_create pair) produced a NEW filename every time and the
    // `existsSync` guard below could never fire. That is how one conversation turned
    // into 10 approval drafts from 7 real messages.
    const msgKey = String(msg.id || '').replace(/[^\w-]/g, '').slice(-16) ||
      // No id (shouldn't happen) — fall back to a hash of sender+body so the name is
      // still stable for the same message instead of being stable for nothing.
      crypto.createHash('sha256').update(`${msg.from}:${msg.body}`).digest('hex').slice(0, 16)
    const dateOnly = new Date().toISOString().substring(0, 10)
    const safeName = (msg.contact || 'whatsapp').replace(/[^\w\s-]/g, '').substring(0, 30)
    const safeBody = msg.body.replace(/[^\w\s-]/g, '_').substring(0, 40)
    const filename = `${dateOnly}_whatsapp_${safeName}_${safeBody}_${msgKey}.md`
    const filePath = path.join(needsActionDir, filename)

    if (fs.existsSync(filePath)) return

    // Already handled on an earlier run: the orchestrator moves processed triggers to
    // Done/, so a name-only check against Needs_Action would let every replayed
    // message back in. Match on the id suffix, which survives the move.
    for (const dir of ['Done', 'Pending_Approval', 'Approved']) {
      const d = path.resolve(vaultPath, dir)
      try {
        if (fs.readdirSync(d).some(f => f.includes(msgKey))) {
          console.log(`[WhatsApp] Skipping ${msgKey} — already processed (found in ${dir}/)`)
          return
        }
      } catch { /* directory may not exist yet */ }
    }

    const content = `---
type: whatsapp
from: ${msg.contact || msg.from}
body: ${msg.body}
received: ${msg.timestamp}
status: pending
is_group: ${msg.isGroup}
msg_id: ${msg.id}
---

# WhatsApp Message from ${msg.contact || msg.from}

| Field | Value |
|-------|-------|
| **From** | ${msg.contact || msg.from} |
| **Received** | ${msg.timestamp} |
| **Type** | ${msg.isGroup ? 'Group' : 'Personal'} |

## Message

${msg.body}

---

*Processed by vault-control WhatsApp service*
`
    fs.writeFileSync(filePath, content, 'utf-8')
    console.log(`[WhatsApp] Task file created: ${filename}`)
  } catch (err) {
    console.error('[WhatsApp] Error creating task file:', err.message)
  }
}

// Everything we send comes back to us as a fromMe 'message_create'. None of our
// replies parse as a command today, but one word added to a reply template
// should not be able to start an echo loop, so remember what we sent.
const recentlySent = new Set()
function rememberSent(text) {
  const key = String(text).slice(0, 200)
  recentlySent.add(key)
  setTimeout(() => recentlySent.delete(key), 60000).unref?.()
}
function wasSentByUs(text) {
  return recentlySent.has(String(text).slice(0, 200))
}

export async function sendMessage(to, text) {
  if (waStatus !== 'connected' || !waClient) {
    throw new Error(`WhatsApp not connected (status: ${waStatus})`)
  }
  const chatId = to.includes('@') ? to : `${to}@c.us`
  rememberSent(text)
  await waClient.sendMessage(chatId, text)
  return { success: true }
}

export async function getLiveChats() {
  if (waStatus !== 'connected' || !waClient) return []

  if (chatsCache && (Date.now() - chatsCacheTime) < CACHE_TTL) {
    return chatsCache
  }

  // Still inside the cooldown from a failed refresh: serve the stale list (or an
  // empty one) rather than spending another Puppeteer round-trip that is very
  // likely to fail the same way.
  if (Date.now() < chatsFailUntil) {
    return chatsCache || []
  }

  await refreshChatsCache()
  return chatsCache || []
}

// Retry the initial warm-up a handful of times, then stop and let the normal
// request path take over. Calls refreshChatsCache directly so it is not blocked
// by the cooldown it sets itself — the attempt count is the bound here.
async function warmChatsCache(attempt = 1) {
  const MAX_ATTEMPTS = 5
  await new Promise(r => setTimeout(r, attempt * 2000))
  if (waStatus !== 'connected' || !waClient) return
  if (await refreshChatsCache()) return
  if (attempt < MAX_ATTEMPTS) warmChatsCache(attempt + 1)
}

// whatsapp-web.js reaches every chat through WWebJS.getChatModel, which calls
// chat.serialize() plus a set of WAWeb* helper modules. Against the WhatsApp Web
// build this account is talking to, that helper throws for almost every chat —
// measured: 21 of 23 — so getChats(), which wraps the lot in a single
// Promise.all, rejects with nothing but the minified identifier "r". It is a
// library-vs-WhatsApp-Web version mismatch, not one malformed chat.
//
// The chat list panel needs six fields. Read them straight off the collection
// model, each behind its own guard, and skip getChatModel entirely. Nothing here
// can reject the batch: a field that is gone yields its default and a chat that
// is unreadable is counted, not thrown.
async function fetchChatSummaries(max) {
  return waClient.pupPage.evaluate((limit) => {
    const pick = (fn, dflt) => {
      try {
        const v = fn()
        return v === undefined || v === null ? dflt : v
      } catch {
        return dflt
      }
    }

    const Collections = window.require('WAWebCollections')
    const chats = Collections.Chat.getModelsArray()
    const out = []
    let failed = 0

    for (const c of chats.slice(0, limit)) {
      const id = pick(() => c.id._serialized, '')
      if (!id) { failed++; continue }

      let body = ''
      let ts = null
      const key = pick(() => c.lastReceivedKey._serialized, null)
      if (key) {
        const m = pick(() => Collections.Msg.get(key), null)
        if (m) {
          body = String(pick(() => m.body, '') || '')
          ts = pick(() => m.t, null)
        }
      }

      out.push({
        id,
        // formattedTitle is what WhatsApp Web itself renders; fall back to the
        // stored name, then the bare number.
        name:    pick(() => c.formattedTitle, '') || pick(() => c.name, '') || pick(() => c.id.user, ''),
        phone:   pick(() => c.id.user, ''),
        // The isGroup getter is one of the things that breaks on a mismatch, so
        // the JID suffix is the authority when it does.
        isGroup: pick(() => c.isGroup, null) ?? id.endsWith('@g.us'),
        unread:  pick(() => c.unreadCount, 0),
        preview: body.substring(0, 80),
        ts,
        pinned:  Boolean(pick(() => c.pinned, false)),
      })
    }

    return { chats: out, failed, total: chats.length }
  }, max)
}

// The page hands back a raw unix `ts`; the UI wants an ISO string. Done here
// rather than in the page so the evaluate payload stays primitives only.
function toChatRow(c) {
  return {
    id:           c.id,
    name:         c.name,
    phone:        c.phone,
    isGroup:      Boolean(c.isGroup),
    unread:       c.unread || 0,
    preview:      c.preview || '',
    time:         c.ts ? new Date(c.ts * 1000).toISOString() : new Date().toISOString(),
    messageCount: c.preview ? 1 : 0,
    pinned:       Boolean(c.pinned),
  }
}

async function refreshChatsCache() {
  if (!waClient || waStatus !== 'connected') return false
  const MAX_CHATS = 60
  try {
    let chats
    try {
      chats = await waClient.getChats()
    } catch (e) {
      const { chats: models, failed, total } = await fetchChatSummaries(MAX_CHATS)
      console.warn(
        `[WhatsApp] getChats() rejected (${e?.message}); recovered ${models.length}` +
        `/${Math.min(total, MAX_CHATS)} chats individually, ${failed} unreadable`
      )
      chatsCache      = models.map(toChatRow)
      chatsCacheTime  = Date.now()
      chatsFailStreak = 0
      chatsFailUntil  = 0
      return true
    }
    chatsCache = await Promise.all(
      chats.slice(0, MAX_CHATS).map(async (chat) => {
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
    chatsCacheTime  = Date.now()
    chatsFailStreak = 0
    chatsFailUntil  = 0
    return true
  } catch (e) {
    chatsFailStreak++
    chatsFailUntil = Date.now() +
      Math.min(FAIL_BACKOFF_MS * chatsFailStreak, FAIL_BACKOFF_MAX)
    // getChats() executes inside the WhatsApp Web page, so a failure there comes
    // back as a minified identifier from their bundle: the old line logged
    // `e.message` and printed the single character "r", which is undiagnosable.
    // Print the stack, and say when the next attempt is due.
    console.error(
      `[WhatsApp] refreshChatsCache failed (attempt ${chatsFailStreak}, retry in ` +
      `${Math.round((chatsFailUntil - Date.now()) / 1000)}s):`,
      e?.stack || e?.message || e
    )
    return false
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

export async function forceQRRegen() {
  console.log('[WhatsApp] Force QR regeneration requested — clearing session...')
  if (waClient) {
    try { waClient.destroy() } catch {}
    waClient = null
  }
  waStatus = 'disconnected'
  qrData = null
  initTried = false

  reconnectAttempts = 0
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }

  // Clear the real LocalAuth folder (session-<clientId>) so a fresh QR is issued.
  if (fs.existsSync(AUTH_DIR)) {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true })
    console.log('[WhatsApp] Cleared auth folder:', AUTH_DIR)
  }

  broadcast('whatsapp:status', { status: 'disconnected', reason: 'qr_regen' })

  // Restart after a brief delay
  setTimeout(() => initWhatsApp(), 1000)
  return { success: true }
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
