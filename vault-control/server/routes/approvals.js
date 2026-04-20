import express from 'express'
import { readVaultFiles, getVaultPath, moveFile, writeFile, readFile } from '../vault-reader.js'

const router = express.Router()

// GET all pending approvals
router.get('/', (req, res) => {
  const files = readVaultFiles('Pending_Approval')
  
  if (files.length === 0) {
    // Return mock data if vault is empty
    return res.json([
      {
        id: 'pay-001',
        type: 'PAYMENT',
        title: 'Invoice #INV-2024-001',
        description: 'AWS Services - March 2024',
        amount: 1250.00,
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        expiresAt: new Date(Date.now() + 22 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'email-001',
        type: 'EMAIL',
        title: 'Reply to: Project Timeline',
        description: 'Customer inquiry about project deadline',
        createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'post-001',
        type: 'POST',
        title: 'LinkedIn: Q1 Results Announcement',
        description: 'Quarterly earnings post for LinkedIn',
        createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    ])
  }

  const approvals = files.map(file => ({
    id: file.id,
    ...file.frontmatter,
    createdAt: file.createdAt.toISOString(),
    updatedAt: file.updatedAt.toISOString(),
  }))

  res.json(approvals)
})

// GET approved items
router.get('/approved', (req, res) => {
  const files = readVaultFiles('Approved')
  const approvals = files.map(file => ({
    id: file.id,
    ...file.frontmatter,
  }))
  res.json(approvals)
})

// GET rejected items
router.get('/rejected', (req, res) => {
  const files = readVaultFiles('Rejected')
  const approvals = files.map(file => ({
    id: file.id,
    ...file.frontmatter,
  }))
  res.json(approvals)
})

// APPROVE an item
router.post('/:id/approve', (req, res) => {
  const { id } = req.params
  const sourcePath = getVaultPath('Pending_Approval', `${id}.md`)
  const destPath = getVaultPath('Approved', `${id}.md`)

  const success = moveFile(sourcePath, destPath)
  if (success) {
    global.broadcast({ type: 'approval_changed', action: 'approved', id })
    res.json({ success: true, message: 'Approved' })
  } else {
    res.status(500).json({ success: false, message: 'Failed to approve' })
  }
})

// REJECT an item
router.post('/:id/reject', (req, res) => {
  const { id } = req.params
  const sourcePath = getVaultPath('Pending_Approval', `${id}.md`)
  const destPath = getVaultPath('Rejected', `${id}.md`)

  const success = moveFile(sourcePath, destPath)
  if (success) {
    global.broadcast({ type: 'approval_changed', action: 'rejected', id })
    res.json({ success: true, message: 'Rejected' })
  } else {
    res.status(500).json({ success: false, message: 'Failed to reject' })
  }
})

// UPDATE an approval
router.put('/:id', (req, res) => {
  const { id } = req.params
  const { frontmatter, content } = req.body
  const filePath = getVaultPath('Pending_Approval', `${id}.md`)

  const success = writeFile(filePath, frontmatter, content)
  if (success) {
    global.broadcast({ type: 'approval_changed', action: 'updated', id })
    res.json({ success: true, message: 'Updated' })
  } else {
    res.status(500).json({ success: false, message: 'Failed to update' })
  }
})

export default router
