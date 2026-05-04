import express from 'express'
import { readVaultFiles, getVaultPath, moveFile, writeFile } from '../vault-reader.js'
import fs from 'fs'
import path from 'path'

const router = express.Router()

// GET emails from a specific folder
router.get('/', (req, res) => {
  try {
    const folder = req.query.folder || 'Inbox'
    const files = readVaultFiles(folder)
    
    // Filter for emails (files with type: email or starting with EMAIL_)
    const emailFiles = files.filter(f => 
      f.frontmatter.type === 'email' || 
      f.filename.startsWith('EMAIL_') || 
      f.filename.includes('email') ||
      f.filename.includes('REPLY_')
    )

    const emails = emailFiles.map(file => ({
      id: file.id,
      from: file.frontmatter.from || 'Unknown Sender',
      subject: file.frontmatter.subject || file.filename.replace('.md', '').replace(/_/g, ' '),
      priority: file.frontmatter.priority || 'medium',
      time: file.updatedAt.toISOString(),
      preview: file.content.substring(0, 150),
      folder: folder,
      type: 'email',
      content: file.content,
    }))

    res.json(emails)
  } catch (err) {
    console.error('Error fetching emails:', err)
    res.status(500).json({ error: 'Failed to fetch emails', message: err.message })
  }
})

// GET single email details
router.get('/:folder/:id', (req, res) => {
  try {
    const { folder, id } = req.params
    const files = readVaultFiles(folder)
    const email = files.find(f => f.id === id)

    if (!email) {
      return res.status(404).json({ error: 'Email not found in folder ' + folder })
    }

    res.json({
      id: email.id,
      from: email.frontmatter.from || 'Unknown Sender',
      subject: email.frontmatter.subject || email.filename,
      priority: email.frontmatter.priority || 'medium',
      time: email.updatedAt.toISOString(),
      body: email.content,
      folder: folder,
      ...email.frontmatter,
    })
  } catch (err) {
    console.error('Error fetching email:', err)
    res.status(500).json({ error: 'Failed to fetch email', message: err.message })
  }
})

// MOVE email between folders (Approve/Reject/Archive)
router.post('/move', (req, res) => {
  try {
    const { id, fromFolder, toFolder } = req.body
    const sourcePath = getVaultPath(fromFolder, `${id}.md`)
    const destPath = getVaultPath(toFolder, `${id}.md`)

    const success = moveFile(sourcePath, destPath)
    if (success) {
      if (global.broadcast) {
          global.broadcast({ type: 'dashboard_update', message: `Email ${id} moved to ${toFolder}` })
      }
      res.json({ success: true, message: `Email moved to ${toFolder}` })
    } else {
      res.status(500).json({ success: false, message: 'Failed to move email' })
    }
  } catch (err) {
    console.error('Error moving email:', err)
    res.status(500).json({ error: 'Failed to move email', message: err.message })
  }
})

// SAVE reply as approval
router.post('/reply', (req, res) => {
  try {
    const { originalId, originalFrom, originalSubject, replySubject, replyBody, template } = req.body

    const id = `REPLY_${Date.now()}`
    const pendingPath = getVaultPath('Pending_Approval')
    
    if (!fs.existsSync(pendingPath)) {
      fs.mkdirSync(pendingPath, { recursive: true })
    }

    const frontmatter = {
      title: replySubject,
      type: 'EMAIL_REPLY',
      to: originalFrom,
      originalSubject,
      originalId,
      template: template || 'custom',
      priority: 'medium',
      createdAt: new Date().toISOString(),
    }

    const filePath = path.join(pendingPath, `${id}.md`)
    const success = writeFile(filePath, frontmatter, replyBody)

    if (success) {
      if (global.broadcast) {
        global.broadcast({ type: 'approval_changed', action: 'added', id })
      }
      res.json({ success: true, message: 'Reply saved to Pending_Approval', id })
    } else {
      res.status(500).json({ success: false, message: 'Failed to save reply' })
    }
  } catch (err) {
    console.error('Error saving email reply:', err)
    res.status(500).json({ error: 'Failed to save reply', message: err.message })
  }
})

export default router
