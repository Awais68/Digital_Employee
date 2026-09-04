import express from 'express'
import { query } from '../database/connection.js'
import { createNotification } from '../services/notificationService.js'
import { requireAdmin } from '../database/auth.js'
import { reschedule } from '../services/dueScheduler.js'

const router = express.Router()

let todosCache = null
let todosCacheTime = 0

async function loadTodos() {
  if (todosCache && Date.now() - todosCacheTime < 5000) {
    return todosCache
  }
  const result = await query("SELECT * FROM todos WHERE status != 'deleted' ORDER BY created_at DESC")
  todosCache = result.rows.map(r => ({
    id: r.id,
    title: r.title,
    completed: r.status === 'completed',
    priority: r.priority,
    dueDate: r.due_date,
    reminderAt: r.reminder_at,
    notificationSent: r.notification_sent,
    source: r.source,
    description: r.description,
    createdAt: r.created_at,
  }))
  todosCacheTime = Date.now()
  return todosCache
}

// Invalidate todos cache on any write
function invalidateTodosCache() {
  todosCache = null
}

router.get('/', async (req, res) => {
  try {
    const todos = await loadTodos()
    res.json(todos)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch todos', message: err.message })
  }
})

router.post('/', requireAdmin, async (req, res) => {
  try {
    invalidateTodosCache()
    const { title, priority, dueDate, reminderAt, description, recurrence, source, sourceId } = req.body
    if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' })

    const result = await query(`
      INSERT INTO todos(title, description, priority, due_date, reminder_at, recurrence, source, source_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id
    `, [title, description || '', priority || 'medium', dueDate || null, reminderAt || null,
        recurrence || 'none', source || 'manual', sourceId || null])

    const id = result.rows[0].id
    createNotification('info', 'Task Created', `"${title}" added`, { source: 'todo', id })
    reschedule('todo-created').catch(() => {})
    if (global.broadcast) global.broadcast({ type: 'dashboard_update', message: 'New todo created' })
    res.status(201).json({ id, title, completed: false, priority: priority || 'medium', dueDate, reminderAt, description })
  } catch (err) {
    res.status(500).json({ error: 'Failed to create todo', message: err.message })
  }
})

router.put('/:id', requireAdmin, async (req, res) => {
  invalidateTodosCache()
  try {
    const { id } = req.params
    const { title, priority, dueDate, completed, reminderAt, description } = req.body
    const status = completed ? 'completed' : 'pending'
    await query(`
      UPDATE todos SET title=$1, priority=$2, due_date=$3, status=$4, reminder_at=$5, description=$6, updated_at=NOW()
      WHERE id=$7
    `, [title || '', priority || 'medium', dueDate || null, status, reminderAt || null, description || '', id])
    reschedule('todo-updated').catch(() => {})
    if (global.broadcast) global.broadcast({ type: 'dashboard_update', message: `Todo ${id} updated` })
    res.json({ id, title, completed: !!completed, priority, dueDate, reminderAt })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update todo', message: err.message })
  }
})

router.patch('/:id', requireAdmin, async (req, res) => {
  invalidateTodosCache()
  try {
    const { id } = req.params
    const updates = req.body

    // Completing a recurring todo must roll it to the next occurrence rather
    // than close it — the checkbox in the UI and `DONE <id>` on WhatsApp go
    // through the same code so the two can never disagree.
    if (updates.completed === true) {
      const { completeTodo } = await import('../services/taskCapture.js')
      const message = await completeTodo(id)
      invalidateTodosCache()
      reschedule('todo-completed').catch(() => {})
      createNotification('success', 'Task Updated', message, { source: 'todo', id })
      if (global.broadcast) global.broadcast({ type: 'dashboard_update', message })
      return res.json({ id, completed: true, message })
    }

    const fields = []
    const values = []
    let idx = 1
    for (const [k, v] of Object.entries(updates)) {
      const col = k === 'dueDate' ? 'due_date' : k === 'reminderAt' ? 'reminder_at' : k === 'createdAt' ? 'created_at' : k === 'notificationSent' ? 'notification_sent' : k === 'completed' ? 'status' : k
      if (['title', 'priority', 'due_date', 'status', 'reminder_at', 'description', 'notification_sent'].includes(col)) {
        const val = k === 'completed' ? (v ? 'completed' : 'pending') : v
        fields.push(`${col}=$${idx++}`)
        values.push(val)
      }
    }
    if (fields.length > 0) {
      fields.push(`updated_at=NOW()`)
      values.push(id)
      await query(`UPDATE todos SET ${fields.join(',')} WHERE id=$${idx}`, values)
      reschedule('todo-patched').catch(() => {})
    }
    if (updates.completed !== undefined) {
      createNotification(updates.completed ? 'success' : 'warning', 'Task Updated', `Task marked as ${updates.completed ? 'completed' : 'pending'}`, { source: 'todo', id })
    }
    if (global.broadcast) global.broadcast({ type: 'dashboard_update', message: `Todo ${id} updated` })
    res.json({ id, ...updates })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update todo', message: err.message })
  }
})

router.delete('/:id', requireAdmin, async (req, res) => {
  invalidateTodosCache()
  try {
    const { id } = req.params
    await query("UPDATE todos SET status='deleted', updated_at=NOW() WHERE id=$1", [id])
    reschedule('todo-deleted').catch(() => {})
    if (global.broadcast) global.broadcast({ type: 'dashboard_update', message: `Todo ${id} deleted` })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete todo', message: err.message })
  }
})

export default router
