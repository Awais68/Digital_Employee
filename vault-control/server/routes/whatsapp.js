import express from 'express'
import { readVaultFiles, getVaultPath, writeFile, moveFile } from '../vault-reader.js'
import fs from 'fs'
import path from 'path'

const router = express.Router()

// GET WhatsApp conversations from Inbox
router.get('/', (req, res) => {
  try {
    const files = readVaultFiles('Inbox')
    
    // Filter for WhatsApp messages
    const whatsappFiles = files.filter(f => 
      f.frontmatter.type === 'whatsapp' || 
      f.filename.includes('WHATSAPP') ||
      f.filename.includes('whatsapp') ||
      f.filename.includes('WA_')
    )

    // Group by sender/contact
    const conversations = {}
    whatsappFiles.forEach(file => {
      const sender = file.frontmatter.from || file.frontmatter.sender || 'Unknown'
      if (!conversations[sender]) {
        conversations[sender] = {
          id: sender.replace(/[^a-zA-Z0-9]/g, '_'),
          name: sender,
          messages: [],
          unread: 0,
          lastMessage: file.updatedAt,
        }
      }
      conversations[sender].messages.push({
        id: file.id,
        text: file.content.substring(0, 200),
        fullText: file.content,
        time: file.updatedAt.toISOString(),
        sender: sender,
        isRead: file.frontmatter.isRead || false,
        ...file.frontmatter,
      })
      if (!file.frontmatter.isRead) {
        conversations[sender].unread++
      }
    })

    // Convert to array and sort by last message
    const conversationsArray = Object.values(conversations)
      .map(conv => ({
        ...conv,
        preview: conv.messages[0]?.text || '',
        time: conv.lastMessage.toISOString(),
        messageCount: conv.messages.length,
      }))
      .sort((a, b) => new Date(b.time) - new Date(a.time))

    res.json(conversationsArray)
  } catch (err) {
    console.error('Error fetching WhatsApp conversations:', err)
    res.status(500).json({ error: 'Failed to fetch WhatsApp conversations', message: err.message })
  }
})

// GET single conversation messages
router.get('/conversation/:id', (req, res) => {
  try {
    const { id } = req.params
    const files = readVaultFiles('Inbox')
    
    const whatsappFiles = files.filter(f => 
      f.frontmatter.type === 'whatsapp' || 
      f.filename.includes('WHATSAPP') ||
      f.filename.includes('whatsapp')
    )

    // Find messages for this conversation
    const messages = whatsappFiles
      .filter(f => {
        const sender = f.frontmatter.from || f.frontmatter.sender || 'Unknown'
        return sender.replace(/[^a-zA-Z0-9]/g, '_') === id
      })
      .map(f => ({
        id: f.id,
        text: f.content,
        time: f.updatedAt.toISOString(),
        sender: f.frontmatter.from || f.frontmatter.sender || 'Unknown',
        isRead: f.frontmatter.isRead || false,
        ...f.frontmatter,
      }))
      .sort((a, b) => new Date(a.time) - new Date(b.time))

    if (messages.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' })
    }

    res.json({
      id,
      name: messages[0].sender,
      messages,
    })
  } catch (err) {
    console.error('Error fetching WhatsApp conversation:', err)
    res.status(500).json({ error: 'Failed to fetch WhatsApp conversation', message: err.message })
  }
})

// SEND reply (creates approval file)
router.post('/reply', (req, res) => {
  try {
    const { to, content } = req.body
    const timestamp = new Date().toISOString().replace(/[:.]/g, '')
    const id = `SEND_WHATSAPP_${timestamp}`
    const filePath = getVaultPath('Pending_Approval', `${id}.md`)

    const frontmatter = {
      type: 'whatsapp',
      to,
      createdAt: new Date().toISOString(),
      status: 'pending_approval'
    }

    const success = writeFile(filePath, frontmatter, content)
    if (success) {
      if (global.broadcast) {
        global.broadcast({ type: 'dashboard_update', message: 'New WhatsApp reply created for approval' })
      }
      res.json({ success: true, id, message: 'Reply created for approval' })
    } else {
      res.status(500).json({ success: false, message: 'Failed to create reply' })
    }
  } catch (err) {
    console.error('Error sending WhatsApp reply:', err)
    res.status(500).json({ error: 'Failed to send WhatsApp reply', message: err.message })
  }
})

// MARK as read
router.post('/:id/read', (req, res) => {
  try {
    const { id } = req.params
    const sourcePath = getVaultPath('Inbox', `${id}.md`)
    
    // Read current content and update
    if (fs.existsSync(sourcePath)) {
      const content = fs.readFileSync(sourcePath, 'utf-8')
      const updated = content.replace(/isRead:.*\n/g, 'isRead: true\n')
      fs.writeFileSync(sourcePath, updated)
      
      res.json({ success: true, message: 'Marked as read' })
    } else {
      res.status(404).json({ success: false, message: 'Message not found' })
    }
  } catch (err) {
    console.error('Error marking message as read:', err)
    res.status(500).json({ error: 'Failed to mark as read', message: err.message })
  }
})

export default router
