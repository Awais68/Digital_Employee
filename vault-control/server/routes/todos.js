import express from 'express'
import { readVaultFiles, getVaultPath, writeFile, moveFile, deleteFile } from '../vault-reader.js'
import fs from 'fs'
import path from 'path'

const router = express.Router()

// GET all todos
router.get('/', (req, res) => {
  try {
    const files = readVaultFiles('Todos')
    
    const todos = files.map(file => ({
      id: file.id,
      title: file.frontmatter.title || file.filename.replace('.md', '').replace(/_/g, ' '),
      completed: file.frontmatter.completed === true || file.frontmatter.completed === 'true',
      priority: file.frontmatter.priority || 'medium',
      dueDate: file.frontmatter.dueDate || null,
      date: file.frontmatter.date || file.createdAt.toISOString().split('T')[0],
      order: file.frontmatter.order || 0,
      content: file.content,
    }))

    res.json(todos)
  } catch (err) {
    console.error('Error fetching todos:', err)
    res.status(500).json({ error: 'Failed to fetch todos', message: err.message })
  }
})

// CREATE new todo
router.post('/', (req, res) => {
  try {
    const { title, priority, dueDate } = req.body
    
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' })
    }
    
    const id = `TODO_${Date.now()}`
    const filePath = getVaultPath('Todos', `${id}.md`)
    
    const frontmatter = {
      type: 'todo',
      title,
      completed: false,
      priority: priority || 'medium',
      dueDate: dueDate || null,
      date: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      order: 0,
    }
    
    const success = writeFile(filePath, frontmatter, title)
    
    if (!success) {
      return res.status(500).json({ error: 'Failed to create todo' })
    }
    
    if (global.broadcast) {
      global.broadcast({ type: 'dashboard_update', message: 'New todo created' })
    }
    
    res.status(201).json({
      id,
      ...frontmatter,
    })
  } catch (err) {
    console.error('Error creating todo:', err)
    res.status(500).json({ error: 'Failed to create todo', message: err.message })
  }
})

// UPDATE todo
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params
    const { title, priority, dueDate, completed, order } = req.body
    
    const filePath = getVaultPath('Todos', `${id}.md`)
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Todo not found' })
    }
    
    const existingContent = fs.readFileSync(filePath, 'utf-8')
    const bodyContent = existingContent.split('---\n\n').slice(1).join('---\n\n') || title || ''
    
    const frontmatter = {
      type: 'todo',
      title: title || `Todo ${id}`,
      completed: completed !== undefined ? completed : false,
      priority: priority || 'medium',
      dueDate: dueDate || null,
      order: order !== undefined ? order : 0,
      updatedAt: new Date().toISOString(),
    }
    
    const success = writeFile(filePath, frontmatter, bodyContent)
    
    if (!success) {
      return res.status(500).json({ error: 'Failed to update todo' })
    }
    
    if (global.broadcast) {
      global.broadcast({ type: 'dashboard_update', message: `Todo ${id} updated` })
    }
    
    res.json({ id, ...frontmatter })
  } catch (err) {
    console.error('Error updating todo:', err)
    res.status(500).json({ error: 'Failed to update todo', message: err.message })
  }
})

// PATCH todo (partial update - e.g., toggle completed)
router.patch('/:id', (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body
    
    const filePath = getVaultPath('Todos', `${id}.md`)
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Todo not found' })
    }
    
    const existingContent = fs.readFileSync(filePath, 'utf-8')
    const parts = existingContent.split('---\n\n')
    const bodyContent = parts.slice(1).join('---\n\n') || id
    
    // Read current frontmatter
    const files = readVaultFiles('Todos')
    const existing = files.find(f => f.id === id)
    
    const frontmatter = {
      type: 'todo',
      title: existing?.frontmatter?.title || id,
      completed: updates.completed !== undefined ? updates.completed : (existing?.frontmatter?.completed || false),
      priority: updates.priority || existing?.frontmatter?.priority || 'medium',
      dueDate: updates.dueDate !== undefined ? updates.dueDate : (existing?.frontmatter?.dueDate || null),
      order: updates.order !== undefined ? updates.order : (existing?.frontmatter?.order || 0),
      updatedAt: new Date().toISOString(),
    }
    
    const success = writeFile(filePath, frontmatter, bodyContent)
    
    if (!success) {
      return res.status(500).json({ error: 'Failed to update todo' })
    }
    
    if (global.broadcast) {
      global.broadcast({ type: 'dashboard_update', message: `Todo ${id} updated` })
    }
    
    res.json({ id, ...frontmatter })
  } catch (err) {
    console.error('Error patching todo:', err)
    res.status(500).json({ error: 'Failed to update todo', message: err.message })
  }
})

// DELETE todo
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params
    const filePath = getVaultPath('Todos', `${id}.md`)
    
    const success = deleteFile(filePath)
    
    if (!success) {
      return res.status(404).json({ error: 'Todo not found' })
    }
    
    if (global.broadcast) {
      global.broadcast({ type: 'dashboard_update', message: `Todo ${id} deleted` })
    }
    
    res.json({ success: true, message: 'Todo deleted' })
  } catch (err) {
    console.error('Error deleting todo:', err)
    res.status(500).json({ error: 'Failed to delete todo', message: err.message })
  }
})

export default router
