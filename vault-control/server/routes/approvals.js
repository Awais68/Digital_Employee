import express from 'express'
import { readVaultFiles, getVaultPath, moveFile, writeFile, readFile } from '../vault-reader.js'
import fs from 'fs'
import path from 'path'

const router = express.Router()

// GET all pending approvals
router.get('/', (req, res) => {
  try {
    const files = readVaultFiles('Pending_Approval')
    
    const approvals = files.map(file => ({
      id: file.id,
      type: file.frontmatter.type || (file.filename.includes('PAYMENT') || file.frontmatter.amount ? 'PAYMENT' : file.filename.includes('EMAIL') || file.filename.startsWith('REPLY_') ? 'EMAIL' : file.filename.includes('POST') || file.filename.includes('LINKEDIN') ? 'POST' : 'OTHER'),
      title: file.frontmatter.title || file.frontmatter.subject || file.filename.replace('.md', '').replace(/_/g, ' '),
      description: file.content.substring(0, 200),
      amount: file.frontmatter.amount || null,
      subject: file.frontmatter.subject || null,
      from: file.frontmatter.from || null,
      platform: file.frontmatter.platform || null,
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
      expiresAt: file.frontmatter.expiresAt || null,
      content: file.content,
      fullPath: file.path,
    }))

    res.json(approvals)
  } catch (err) {
    console.error('Error fetching approvals:', err)
    res.status(500).json({ error: 'Failed to fetch approvals', message: err.message })
  }
})

// GET approved items
router.get('/approved', (req, res) => {
  try {
    const files = readVaultFiles('Approved')
    const approvals = files.map(file => ({
      id: file.id,
      ...file.frontmatter,
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
      content: file.content,
    }))
    res.json(approvals)
  } catch (err) {
    console.error('Error fetching approved items:', err)
    res.status(500).json({ error: 'Failed to fetch approved items', message: err.message })
  }
})

// GET rejected items
router.get('/rejected', (req, res) => {
  try {
    const files = readVaultFiles('Rejected')
    const approvals = files.map(file => ({
      id: file.id,
      ...file.frontmatter,
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
      content: file.content,
    }))
    res.json(approvals)
  } catch (err) {
    console.error('Error fetching rejected items:', err)
    res.status(500).json({ error: 'Failed to fetch rejected items', message: err.message })
  }
})

// Find file in Pending_Approval (including subdirectories)
function findFileInPendingApproval(id) {
  const pendingPath = getVaultPath('Pending_Approval')
  if (!fs.existsSync(pendingPath)) return null
  
  const entries = fs.readdirSync(pendingPath, { withFileTypes: true })
  
  for (const entry of entries) {
    const fullPath = path.join(pendingPath, entry.name)
    
    if (entry.isDirectory()) {
      // Search subdirectory
      const subEntries = fs.readdirSync(fullPath, { withFileTypes: true })
      for (const sub of subEntries) {
        if (sub.isFile() && sub.name === `${id}.md`) {
          return path.join(fullPath, sub.name)
        }
      }
    } else if (entry.isFile() && entry.name === `${id}.md`) {
      return fullPath
    }
  }
  return null
}

// APPROVE an item
router.post('/:id/approve', (req, res) => {
  try {
    const { id } = req.params
    const pendingPath = getVaultPath('Pending_Approval')
    const approvedPath = getVaultPath('Approved')
    
    // Ensure Approved directory exists
    if (!fs.existsSync(approvedPath)) {
      fs.mkdirSync(approvedPath, { recursive: true })
    }
    
    // Find the source file
    const sourcePath = findFileInPendingApproval(id)
    
    if (!sourcePath) {
      console.error(`File not found: ${id}.md in Pending_Approval`)
      return res.status(404).json({ success: false, message: `File ${id}.md not found in Pending_Approval` })
    }
    
    const destPath = path.join(approvedPath, `${id}.md`)
    
    // Move the file
    fs.renameSync(sourcePath, destPath)
    
    if (global.broadcast) {
      global.broadcast({ type: 'approval_changed', action: 'approved', id })
    }
    
    res.json({ success: true, message: 'Approved' })
  } catch (err) {
    console.error('Error approving item:', err)
    res.status(500).json({ success: false, message: err.message })
  }
})

// REJECT an item
router.post('/:id/reject', (req, res) => {
  try {
    const { id } = req.params
    const pendingPath = getVaultPath('Pending_Approval')
    const rejectedPath = getVaultPath('Rejected')
    
    // Ensure Rejected directory exists
    if (!fs.existsSync(rejectedPath)) {
      fs.mkdirSync(rejectedPath, { recursive: true })
    }
    
    // Find the source file
    const sourcePath = findFileInPendingApproval(id)
    
    if (!sourcePath) {
      console.error(`File not found: ${id}.md in Pending_Approval`)
      return res.status(404).json({ success: false, message: `File ${id}.md not found in Pending_Approval` })
    }
    
    const destPath = path.join(rejectedPath, `${id}.md`)
    
    // Move the file
    fs.renameSync(sourcePath, destPath)
    
    if (global.broadcast) {
      global.broadcast({ type: 'approval_changed', action: 'rejected', id })
    }
    
    res.json({ success: true, message: 'Rejected' })
  } catch (err) {
    console.error('Error rejecting item:', err)
    res.status(500).json({ success: false, message: err.message })
  }
})

// UPDATE an approval
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params
    const { frontmatter, content } = req.body
    const filePath = getVaultPath('Pending_Approval', `${id}.md`)

    const success = writeFile(filePath, frontmatter, content)
    if (success) {
      if (global.broadcast) {
        global.broadcast({ type: 'approval_changed', action: 'updated', id })
      }
      res.json({ success: true, message: 'Updated' })
    } else {
      res.status(500).json({ success: false, message: 'Failed to update' })
    }
  } catch (err) {
    console.error('Error updating approval:', err)
    res.status(500).json({ error: 'Failed to update approval', message: err.message })
  }
})

// UNDO an action (move from Approved/Rejected back to Pending_Approval)
router.post('/:id/undo', (req, res) => {
  try {
    const { id } = req.params
    const pendingPath = getVaultPath('Pending_Approval')
    const approvedPath = getVaultPath('Approved')
    const rejectedPath = getVaultPath('Rejected')
    
    if (!fs.existsSync(pendingPath)) {
      fs.mkdirSync(pendingPath, { recursive: true })
    }
    
    // Find the source file in Approved or Rejected
    let sourcePath = path.join(approvedPath, `${id}.md`)
    let previousFolder = 'Approved'
    
    if (!fs.existsSync(sourcePath)) {
      sourcePath = path.join(rejectedPath, `${id}.md`)
      previousFolder = 'Rejected'
    }
    
    if (!fs.existsSync(sourcePath)) {
      return res.status(404).json({ success: false, message: `File ${id}.md not found in Approved or Rejected` })
    }
    
    const destPath = path.join(pendingPath, `${id}.md`)
    
    // Move the file back
    fs.renameSync(sourcePath, destPath)
    
    if (global.broadcast) {
      global.broadcast({ type: 'approval_changed', action: 'undone', id, previousFolder })
    }
    
    res.json({ success: true, message: `Undone. Moved from ${previousFolder} back to Pending_Approval` })
  } catch (err) {
    console.error('Error undoing action:', err)
    res.status(500).json({ success: false, message: err.message })
  }
})

export default router
