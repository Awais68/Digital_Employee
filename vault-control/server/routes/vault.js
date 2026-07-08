import express from 'express'
import { readVaultFiles, getVaultPath, writeFile, readFile } from '../vault-reader.js'
import fs from 'fs'
import path from 'path'
import { requireAdmin } from '../database/auth.js'

const router = express.Router()

// GET all files in a vault folder
router.get('/:folder', (req, res) => {
  try {
    const { folder } = req.params
    const files = readVaultFiles(folder)
    
    const result = files.map(file => ({
      id: file.id,
      filename: file.filename,
      folder,
      frontmatter: file.frontmatter,
      preview: file.content.substring(0, 200),
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
    }))

    res.json(result)
  } catch (err) {
    console.error('Error fetching vault files:', err)
    res.status(500).json({ error: 'Failed to fetch files', message: err.message })
  }
})

// GET single file details
router.get('/:folder/:id', (req, res) => {
  try {
    const { folder, id } = req.params
    const files = readVaultFiles(folder)
    const file = files.find(f => f.id === id)

    if (!file) {
      return res.status(404).json({ error: 'File not found' })
    }

    res.json({
      id: file.id,
      filename: file.filename,
      folder,
      frontmatter: file.frontmatter,
      content: file.content,
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
    })
  } catch (err) {
    console.error('Error fetching file:', err)
    res.status(500).json({ error: 'Failed to fetch file', message: err.message })
  }
})

// CREATE new file
router.post('/:folder', requireAdmin, (req, res) => {
  try {
    const { folder } = req.params
    const { id, frontmatter = {}, content = '' } = req.body

    const folderPath = getVaultPath(folder)
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true })
    }

    const filePath = path.join(folderPath, `${id}.md`)
    const success = writeFile(filePath, frontmatter, content)

    if (success) {
      if (global.broadcast) {
        global.broadcast({ type: 'vault_changed', action: 'created', folder, id })
      }
      res.json({ success: true, message: 'File created', id })
    } else {
      res.status(500).json({ success: false, message: 'Failed to create file' })
    }
  } catch (err) {
    console.error('Error creating file:', err)
    res.status(500).json({ error: 'Failed to create file', message: err.message })
  }
})

// UPDATE file
router.put('/:folder/:id', requireAdmin, (req, res) => {
  try {
    const { folder, id } = req.params
    const { frontmatter, content } = req.body

    const filePath = path.join(getVaultPath(folder), `${id}.md`)
    const success = writeFile(filePath, frontmatter, content)

    if (success) {
      if (global.broadcast) {
        global.broadcast({ type: 'vault_changed', action: 'updated', folder, id })
      }
      res.json({ success: true, message: 'File updated' })
    } else {
      res.status(500).json({ success: false, message: 'Failed to update file' })
    }
  } catch (err) {
    console.error('Error updating file:', err)
    res.status(500).json({ error: 'Failed to update file', message: err.message })
  }
})

// DELETE file
router.delete('/:folder/:id', requireAdmin, (req, res) => {
  try {
    const { folder, id } = req.params
    const filePath = path.join(getVaultPath(folder), `${id}.md`)

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      if (global.broadcast) {
        global.broadcast({ type: 'vault_changed', action: 'deleted', folder, id })
      }
      res.json({ success: true, message: 'File deleted' })
    } else {
      res.status(404).json({ success: false, message: 'File not found' })
    }
  } catch (err) {
    console.error('Error deleting file:', err)
    res.status(500).json({ error: 'Failed to delete file', message: err.message })
  }
})

export default router
