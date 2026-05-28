import { bus, EVENTS } from './eventBus.js'
import { query } from '../database/connection.js'

const store = []
const MAX   = 200

export function notify(type, title, message, data = {}) {
  const notif = {
    id:        `n_${Date.now()}_${Math.random().toString(36).substr(2,4)}`,
    type,
    title,
    message,
    data,
    read:      false,
    createdAt: new Date().toISOString()
  }

  store.unshift(notif)
  if (store.length > MAX) store.pop()

  query(
    `INSERT INTO notifications(id, type, title, message, data, created_at)
     VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT DO NOTHING`,
    [notif.id, type, title, message, JSON.stringify(data)]
  ).catch(() => {})

  if (global.wsBroadcast) {
    global.wsBroadcast({ type: 'notification', notification: notif })
  }

  bus.emit(EVENTS.NOTIFY, notif)

  return notif
}

export function getNotifications(limit = 50) {
  return store.slice(0, limit)
}

export function markRead(id) {
  const n = store.find(x => x.id === id)
  if (n) {
    n.read = true
    query('UPDATE notifications SET read=true WHERE id=$1', [id]).catch(() => {})
  }
  return n
}

export function markAllRead() {
  store.forEach(n => { n.read = true })
  query('UPDATE notifications SET read=true').catch(() => {})
}

export function getUnreadCount() {
  return store.filter(n => !n.read).length
}

export async function initNotificationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id VARCHAR(50) PRIMARY KEY,
      type VARCHAR(20),
      title VARCHAR(200),
      message TEXT,
      data JSONB DEFAULT '{}',
      read BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  await query(`ALTER TABLE notifications ALTER COLUMN id TYPE VARCHAR(50)`).catch(() => {})
  await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}'`).catch(() => {})
  await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read BOOLEAN DEFAULT false`).catch(() => {})
  await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`).catch(() => {})

  try {
    const result = await query(
      'SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100'
    )
    store.push(...result.rows.map(r => ({
      id:        r.id,
      type:      r.type,
      title:     r.title,
      message:   r.message,
      data:      r.data || {},
      read:      r.read,
      createdAt: r.created_at
    })))
    console.log(`[Notifications] Loaded ${result.rows.length} from DB`)
  } catch (e) {
    console.warn('[Notifications] Could not load from DB:', e.message)
  }
}

export { notify as createNotification }
