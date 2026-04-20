import express from 'express'
import { readVaultFiles, getVaultPath, moveFile } from '../vault-reader.js'

const router = express.Router()

// GET emails from a specific folder
router.get('/', (req, res) => {
  const folder = req.query.folder || 'Inbox'
  const files = readVaultFiles(folder)
  
  // Filter for emails (files with type: email or starting with EMAIL_)
  const emailFiles = files.filter(f => f.frontmatter.type === 'email' || f.filename.startsWith('EMAIL_') || f.filename.includes('email'))

  const emails = emailFiles.map(file => ({
    id: file.id,
    from: file.frontmatter.from || 'Unknown Sender',
    subject: file.frontmatter.subject || file.filename,
    priority: file.frontmatter.priority || 'medium',
    time: file.updatedAt,
    preview: file.content.substring(0, 150),
    folder: folder,
    type: 'email'
  }))

  res.json(emails)
})

// GET single email details
router.get('/:folder/:id', (req, res) => {
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
    time: email.updatedAt,
    body: email.content,
    folder: folder
  })
})

// MOVE email between folders (Approve/Reject/Archive)
router.post('/move', (req, res) => {
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
})

export default router
