import webpush from 'web-push'

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:' + (process.env.ADMIN_EMAIL || 'admin@aiemployee.com'),
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
}

const subscriptions = new Map()
const notifications = []
const MAX_NOTIFICATIONS = 100

export function getSubscriptions() {
  return subscriptions
}

export async function sendNotification(subscription, payload) {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload))
  } catch (e) {
    console.error('Push notification failed:', e)
  }
}

export function createNotification(type, title, message, data = {}) {
  const notif = {
    id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    type,
    title,
    message,
    data,
    read: false,
    createdAt: new Date().toISOString(),
  }
  notifications.unshift(notif)
  if (notifications.length > MAX_NOTIFICATIONS) notifications.pop()

  if (global.broadcast) {
    global.broadcast({ type: 'notification', notification: notif })
  }

  console.log(`[NOTIF] ${type.toUpperCase()}: ${title} — ${message}`)
  return notif
}

export function getNotifications(limit = 50) {
  return notifications.slice(0, limit)
}

export function markRead(id) {
  const n = notifications.find(n => n.id === id)
  if (n) n.read = true
  return n
}

export function markAllRead() {
  notifications.forEach(n => n.read = true)
}

export function getUnreadCount() {
  return notifications.filter(n => !n.read).length
}

export function scheduleReminder(todo) {
  const delay = new Date(todo.reminder_at) - new Date()
  if (delay <= 0) return

  setTimeout(async () => {
    for (const [, sub] of subscriptions) {
      await sendNotification(sub, {
        title: `Reminder: ${todo.title}`,
        body: todo.description || 'Task due soon',
        icon: '/logo.png',
        badge: '/badge.png',
        data: { todoId: todo.id, url: '/todos' },
      })
    }

    createNotification('warning', `⏰ Reminder: ${todo.title}`, todo.description || 'Task due now', { todoId: todo.id })

    const wa = await import('./whatsappService.js').catch(() => null)
    const ownerPhone = process.env.OWNER_PHONE
    if (wa) {
      try {
        if (wa.getStatus() === 'connected' && ownerPhone) {
          await wa.sendMessage(ownerPhone,
            `⏰ *Task Reminder*\n\n*${todo.title}*\n${todo.description || ''}\n\nPriority: ${todo.priority?.toUpperCase() || 'MEDIUM'}`
          )
        }
      } catch (e) {
        console.error('[Notif] WA reminder failed:', e.message)
      }
    }

    const { query } = await import('../database/connection.js')
    await query('UPDATE todos SET notification_sent=true WHERE id=$1', [todo.id]).catch(e => console.error('[Notif] DB update failed:', e.message))
  }, delay)
}
