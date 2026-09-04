// ═══════════════════════════════════════════════════════════════════════════
// DUE SCHEDULER — exact-time wakeups instead of interval polling.
//
// WHY: Neon scales the compute to zero only after ~5 minutes with NO queries.
// The old design polled `scheduled_posts` every 30s and `todos` every 60s, so
// the compute never suspended → ~730 compute-hours/month against a ~192h quota.
//
// HOW: ask the DB ONCE for the earliest due timestamp across todos + posts,
// then sleep with a single setTimeout until that exact instant. Between wakeups
// the DB is untouched and Neon suspends. Any write that can change the next due
// time calls reschedule() so latency stays the same as the old 1-minute poll.
// ═══════════════════════════════════════════════════════════════════════════
import { query } from '../database/connection.js'
import { createNotification } from './notificationService.js'
// whatsapp-web.js drags puppeteer into the module graph — keep it out of the
// startup path since routes import this module at boot.
async function wa() { return import('./whatsappService.js') }

// Resolved per send, not at import time: this module is imported at boot,
// before the DB-backed settings load, and the literal placeholder that used to
// sit here meant every reminder was addressed to a number that does not exist.

// Ceiling on a single timer. Nothing due for days still costs only 4 short
// wakeups/day, and it re-syncs the wall clock after a laptop suspend.
const MAX_DELAY_MS = 6 * 60 * 60 * 1000
const MIN_DELAY_MS = 1000
const ERROR_RETRY_MS = 10 * 60 * 1000

let timer = null
let targetAt = null
let running = false
let started = false
let apiPort = parseInt(process.env.PORT || '3000')

export function setApiPort(port) {
  apiPort = port
}

function clearTimer() {
  if (timer) clearTimeout(timer)
  timer = null
  targetAt = null
}

function armTimer(delayMs, fn) {
  clearTimer()
  targetAt = Date.now() + delayMs
  timer = setTimeout(fn, delayMs)
  timer.unref?.()
}

/**
 * Recompute the next due instant and arm a single timer for it.
 * Safe to call from any write path — it is one cheap query, debounced by the
 * fact that it only ever replaces the existing timer.
 */
export async function reschedule(reason = 'change') {
  if (!started) return

  let nextAt = null
  try {
    const r = await query(`
      SELECT LEAST(
        (SELECT MIN(reminder_at) FROM todos
          WHERE status = 'pending'
            AND reminder_at IS NOT NULL
            AND (notification_sent = false OR notification_sent IS NULL)
            AND reminder_at > NOW() - INTERVAL '24 hours'),
        (SELECT MIN(scheduled_for) FROM scheduled_posts
          WHERE status = 'scheduled' AND scheduled_for IS NOT NULL)
      ) AS next_at
    `)
    nextAt = r.rows[0]?.next_at || null
  } catch (e) {
    console.warn(`[DueScheduler] next-wake query failed (${reason}):`, e.message)
    armTimer(ERROR_RETRY_MS, () => reschedule('retry'))
    return
  }

  if (!nextAt) {
    clearTimer()
    console.log(`[DueScheduler] nothing due — DB left idle (${reason})`)
    return
  }

  const dueMs = new Date(nextAt).getTime() - Date.now()
  if (dueMs <= MAX_DELAY_MS) {
    const delay = Math.max(MIN_DELAY_MS, dueMs)
    armTimer(delay, runDue)
    console.log(`[DueScheduler] next wake in ${Math.round(delay / 1000)}s at ${new Date(nextAt).toISOString()} (${reason})`)
  } else {
    // Too far out to trust one timer — re-check later without touching the DB in between.
    armTimer(MAX_DELAY_MS, () => reschedule('long-sleep'))
    console.log(`[DueScheduler] next due ${new Date(nextAt).toISOString()} — sleeping ${MAX_DELAY_MS / 3600000}h first (${reason})`)
  }
}

async function runDue() {
  // A suspended laptop can fire a timer early/late; if we woke early, re-arm
  // rather than burning a DB wakeup on nothing.
  if (targetAt && Date.now() < targetAt - 2000) {
    armTimer(targetAt - Date.now(), runDue)
    return
  }
  if (running) return
  running = true
  try {
    await processDueTodos()
    await processDuePosts()
  } catch (e) {
    console.error('[DueScheduler] run error:', e.message)
  } finally {
    running = false
    await reschedule('after-run')
  }
}

// ─── Todo reminders (was: cron '* * * * *') ────────────────────────────────
async function processDueTodos() {
  const result = await query(`
    SELECT * FROM todos
    WHERE reminder_at <= NOW()
      AND reminder_at > NOW() - INTERVAL '24 hours'
      AND status = 'pending'
      AND (notification_sent = false OR notification_sent IS NULL)
  `)

  for (const todo of result.rows) {
    createNotification(
      'warning',
      `⏰ Reminder: ${todo.title}`,
      todo.description || 'Task due now',
      { todoId: todo.id }
    )

    const { sendToOwner } = await import('./hitl.js')
    await sendToOwner(
      `⏰ *Task Reminder*\n\n*#${todo.id} ${todo.title}*\n${todo.description || ''}\n\n` +
      `Priority: ${(todo.priority || 'medium').toUpperCase()}\n\nReply *DONE ${todo.id}* when it's finished.`
    ).catch(e => console.error('WA reminder failed:', e.message))

    await query(`UPDATE todos SET notification_sent=true WHERE id=$1`, [todo.id])

    if (todo.recurrence && todo.recurrence !== 'none') {
      const nextDate = getNextRecurrence(todo.recurrence, new Date(todo.reminder_at))
      await query(
        `UPDATE todos SET reminder_at=$1, notification_sent=false WHERE id=$2`,
        [nextDate, todo.id]
      )
    }
  }
}

function getNextRecurrence(type, fromDate) {
  const next = new Date(fromDate)
  switch (type) {
    case 'daily':   next.setDate(next.getDate() + 1); break
    case 'weekly':  next.setDate(next.getDate() + 7); break
    case 'monthly': next.setMonth(next.getMonth() + 1); break
  }
  return next
}

// ─── Scheduled post publishing (was: setInterval 30s in index.js) ──────────
async function processDuePosts() {
  const due = await query(
    `SELECT * FROM scheduled_posts WHERE status='scheduled' AND scheduled_for <= NOW() LIMIT 5`
  )
  for (const post of due.rows) {
    try {
      await query(`UPDATE scheduled_posts SET status='publishing' WHERE id=$1`, [post.id])
      console.log(`[DueScheduler] Publishing scheduled post ${post.id} (${post.platform})...`)

      // Publish in-process. The old code POSTed to /api/social/draft/:id/publish,
      // which could never work for a scheduled post: that route is behind
      // requireAdmin (no token here → 401 once ENABLE_AUTH went on) and it
      // resolves :id against markdown files in Approved/, not against a
      // scheduled_posts row (→ 404). Every auto-scheduled post therefore landed
      // in status='failed', which is why nothing ever posted on its own.
      const { publishPost } = await import('./socialMediaService.js')
      const result = await publishPost(post)

      await query(
        `UPDATE scheduled_posts SET status='published', published_at=NOW(), post_url=$2 WHERE id=$1`,
        [post.id, result?.url || result?.postUrl || result?.id || null]
      )
      console.log(`[DueScheduler] Published ${post.id} → ${result?.url || 'ok'}`)
      createNotification('success', 'Post Published',
        `${post.platform}: ${String(post.content || '').substring(0, 60)}`,
        { postId: post.id, url: result?.url || null })
    } catch (err) {
      console.error(`[DueScheduler] Failed post ${post.id}:`, err.message)
      await query(`UPDATE scheduled_posts SET status='failed' WHERE id=$1`, [post.id]).catch(() => {})
      createNotification('error', 'Post Failed',
        `${post.platform} post #${post.id}: ${err.message}`.substring(0, 200), { postId: post.id })
    }
  }
}

export function startDueScheduler(port) {
  if (started) return
  if (port) apiPort = port
  started = true
  // Catch anything that came due while the process was down, then go idle.
  runDue()
  console.log('[DueScheduler] started (event-driven, no polling)')
}

export function stopDueScheduler() {
  started = false
  clearTimer()
}

export default { startDueScheduler, stopDueScheduler, reschedule, setApiPort }
