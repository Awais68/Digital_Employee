// ═══════════════════════════════════════════════════════════════════════════
// TASK CAPTURE — one way in, from every channel.
//
// The owner asks for work in three different places (email, WhatsApp, the
// dashboard chatbot) and expects one todo list that tracks all of it, closes
// items when they are done, and re-arms the recurring ones. Every channel funnels
// through here so the parsing, the recurrence maths and the dedup live once.
//
// Dedup is on (source, source_id, title): the same email is re-read on every
// watcher cycle and must not mint a new todo each time.
// ═══════════════════════════════════════════════════════════════════════════

import { query } from '../database/connection.js'

const RECURRENCE_WORDS = {
  daily: 'daily', 'every day': 'daily', 'har roz': 'daily', roz: 'daily',
  weekly: 'weekly', 'every week': 'weekly', 'har hafta': 'weekly',
  monthly: 'monthly', 'every month': 'monthly', 'har mahine': 'monthly',
  yearly: 'yearly', 'every year': 'yearly',
}

// Cheap, deterministic date parsing for the phrasings that actually show up.
// Anything richer is left to the LLM path in extractTasksFromEmail.
function parseWhen(text) {
  const t = String(text).toLowerCase()
  const now = new Date()
  const at = t.match(/\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/)
  const setTime = (d) => {
    if (at) {
      let h = parseInt(at[1], 10) % 12
      if (at[3] === 'pm') h += 12
      d.setHours(h, at[2] ? parseInt(at[2], 10) : 0, 0, 0)
    } else {
      d.setHours(9, 0, 0, 0)
    }
    return d
  }
  if (/\b(today|aaj)\b/.test(t)) return setTime(new Date(now))
  if (/\b(tomorrow|kal)\b/.test(t)) { const d = new Date(now); d.setDate(d.getDate() + 1); return setTime(d) }
  const inDays = t.match(/\bin\s+(\d+)\s+day/)
  if (inDays) { const d = new Date(now); d.setDate(d.getDate() + parseInt(inDays[1], 10)); return setTime(d) }
  const nextWeek = /\bnext week\b|\bagle hafte\b/.test(t)
  if (nextWeek) { const d = new Date(now); d.setDate(d.getDate() + 7); return setTime(d) }
  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (iso) return setTime(new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00`))
  return null
}

function parseRecurrence(text) {
  const t = String(text).toLowerCase()
  for (const [word, value] of Object.entries(RECURRENCE_WORDS)) {
    if (t.includes(word)) return value
  }
  return 'none'
}

function parsePriority(text) {
  const t = String(text).toLowerCase()
  if (/\b(urgent|asap|immediately|foran|jaldi)\b/.test(t)) return 'high'
  if (/\b(whenever|no rush|later)\b/.test(t)) return 'low'
  return 'medium'
}

/**
 * Create a todo from a plain sentence typed by the owner anywhere.
 * @returns {Promise<{id:number,title:string,dueDate:Date|null,recurrence:string}>}
 */
export async function createTodoFromText(text, { source = 'manual', sourceId = null, description = '' } = {}) {
  const title = String(text).trim().replace(/\s+/g, ' ').slice(0, 300)
  const dueDate = parseWhen(text)
  const recurrence = parseRecurrence(text)
  const priority = parsePriority(text)

  const dup = await query(
    `SELECT id, title FROM todos
     WHERE source=$1 AND COALESCE(source_id,'')=COALESCE($2,'') AND lower(title)=lower($3)
       AND status <> 'deleted' LIMIT 1`,
    [source, sourceId, title]
  )
  if (dup.rows[0]) return { ...dup.rows[0], dueDate, recurrence, duplicate: true }

  const r = await query(
    `INSERT INTO todos (title, description, source, source_id, priority, due_date, reminder_at, recurrence)
     VALUES ($1,$2,$3,$4,$5,$6,$6,$7) RETURNING id, title`,
    [title, description || '', source, sourceId, priority, dueDate, recurrence]
  )
  const { reschedule } = await import('./dueScheduler.js')
  reschedule('todo-captured').catch(() => {})
  console.log(`[TaskCapture] Todo #${r.rows[0].id} from ${source}: ${title}`)
  return { ...r.rows[0], dueDate, recurrence }
}

/** Advance a recurring todo to its next occurrence. */
export function nextOccurrence(from, recurrence) {
  const d = new Date(from || Date.now())
  switch (recurrence) {
    case 'daily':   d.setDate(d.getDate() + 1); break
    case 'weekly':  d.setDate(d.getDate() + 7); break
    case 'monthly': d.setMonth(d.getMonth() + 1); break
    case 'yearly':  d.setFullYear(d.getFullYear() + 1); break
    default: return null
  }
  return d
}

/**
 * Complete a todo. A recurring one is not closed — it rolls forward, which is
 * the behaviour the owner asked for ("recurring ho to us ko re-schedule kar do").
 * @returns {Promise<string>} a sentence suitable for a WhatsApp reply
 */
export async function completeTodo(id) {
  const r = await query(`SELECT * FROM todos WHERE id=$1`, [id])
  const todo = r.rows[0]
  if (!todo) return `No todo #${id}.`
  if (todo.status === 'completed') return `#${id} is already done.`

  const recurrence = todo.recurrence || 'none'
  if (recurrence !== 'none') {
    const base = todo.due_date || new Date()
    const next = nextOccurrence(base, recurrence)
    const endsAt = todo.recurrence_end ? new Date(todo.recurrence_end) : null
    if (next && (!endsAt || next <= endsAt)) {
      await query(
        `UPDATE todos SET status='pending', due_date=$1, reminder_at=$1,
           notification_sent=false, updated_at=NOW() WHERE id=$2`,
        [next, id]
      )
      const { reschedule } = await import('./dueScheduler.js')
      reschedule('todo-recurred').catch(() => {})
      return `✅ #${id} done — next ${recurrence} run on ${next.toLocaleString()}.`
    }
  }

  await query(`UPDATE todos SET status='completed', updated_at=NOW() WHERE id=$1`, [id])
  return `✅ #${id} completed: ${todo.title}`
}

/**
 * Pull concrete action items out of an email and file them as todos.
 * Only ever called for emails triage marked actionable — junk never reaches here.
 */
export async function extractTasksFromEmail({ msgId, from, subject, body }) {
  try {
    const { callAI } = await import('./aiProvider.js')
    const raw = await callAI(
      'You extract action items. Reply with raw JSON only.',
      `What does the sender concretely need us to DO? Return [] if nothing.

From: ${from}
Subject: ${subject}
Body: ${String(body).slice(0, 1500)}

{"tasks":[{"title":"<imperative, under 100 chars>","priority":"high|medium|low","due":"<ISO date or null>"}]}`,
      400
    )
    const parsed = JSON.parse(String(raw).replace(/```json|```/g, '').trim())
    const tasks = Array.isArray(parsed.tasks) ? parsed.tasks.slice(0, 5) : []
    const created = []
    for (const t of tasks) {
      if (!t?.title) continue
      const row = await createTodoFromText(t.title, {
        source: 'email',
        sourceId: msgId,
        description: `From ${from} — "${subject}"`,
      })
      if (t.due) {
        await query(`UPDATE todos SET due_date=$1, reminder_at=$1 WHERE id=$2`, [new Date(t.due), row.id])
      }
      if (t.priority) {
        await query(`UPDATE todos SET priority=$1 WHERE id=$2`, [t.priority, row.id])
      }
      created.push(row)
    }
    return created
  } catch (e) {
    console.warn('[TaskCapture] Email task extraction failed:', e.message)
    return []
  }
}

export default { createTodoFromText, completeTodo, extractTasksFromEmail, nextOccurrence }
