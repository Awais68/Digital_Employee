import express from 'express'
import { readVaultFiles, getVaultPath, writeFile, moveFile } from '../vault-reader.js'
import { query } from '../database/connection.js'
import fs from 'fs'
import path from 'path'
import { requireAdmin } from '../database/auth.js'

const router = express.Router()

// GET /status — WhatsApp connection status
router.get('/status', (req, res) => {
  import('../services/whatsappService.js').then(ws => {
    res.json({ status: ws.getStatus(), qr: ws.getQR() })
  }).catch(e => res.json({ status: 'disconnected', qr: null }))
})

// POST /send — send WhatsApp message via web.js
router.post('/send', requireAdmin, async (req, res) => {
  const { to, message } = req.body
  try {
    const { sendMessage } = await import('../services/whatsappService.js')
    const result = await sendMessage(to, message)
    // Save outgoing message to DB
    const chatId = to.includes('@') ? to : `${to}@c.us`
    await query(`
      INSERT INTO whatsapp_messages(msg_id, from_number, to_number, body, timestamp, is_group, direction, type, is_read)
      VALUES($1,$2,$3,$4,NOW(),false,'outgoing','outgoing',true)
    `, [`out_${Date.now()}`, 'Me', chatId, message]).catch(() => {})
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /messages — DB-backed message list
router.get('/messages', async (req, res) => {
  try {
    const result = await query('SELECT * FROM whatsapp_messages ORDER BY timestamp DESC LIMIT 50')
    res.json(result.rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /db-conversations — real WhatsApp conversations from DB
router.get('/db-conversations', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        COALESCE(NULLIF(contact_name,''), from_number) AS name,
        from_number AS id,
        from_number AS phone,
        COUNT(*) AS message_count,
        MAX(timestamp) AS last_time,
        SUM(CASE WHEN is_read=false OR is_read IS NULL THEN 1 ELSE 0 END) AS unread,
        (SELECT body FROM whatsapp_messages w2
         WHERE w2.from_number = w1.from_number
         ORDER BY timestamp DESC LIMIT 1) AS preview
      FROM whatsapp_messages w1
      WHERE is_group=false
      GROUP BY contact_name, from_number
      ORDER BY last_time DESC
    `)
    const conversations = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      messageCount: parseInt(row.message_count),
      unread: parseInt(row.unread),
      time: row.last_time,
      preview: (row.preview || '').substring(0, 100),
    }))
    res.json(conversations)
  } catch (e) {
    console.error('[WhatsApp DB conversations]', e.message)
    res.json([])
  }
})

// GET /db-conversation/:phone — messages for a specific phone number from DB
router.get('/db-conversation/:phone', async (req, res) => {
  try {
    const { phone } = req.params
    const result = await query(
      `SELECT * FROM whatsapp_messages WHERE from_number=$1 OR to_number=$1 ORDER BY timestamp ASC`,
      [phone]
    )
    const messages = result.rows.map(row => ({
      id: row.msg_id || `msg_${row.id}`,
      text: row.body,
      time: row.timestamp,
      sender: row.direction === 'outgoing' ? 'Me' : row.from_number,
      type: row.direction || 'incoming',
    }))
    res.json({
      id: phone,
      name: phone,
      phone,
      messages,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

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
router.post('/reply', requireAdmin, (req, res) => {
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
router.post('/:id/read', requireAdmin, (req, res) => {
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

// POST /restart — restart WhatsApp service (generates new QR)
router.post('/restart', requireAdmin, async (req, res) => {
  try {
    const ws = await import('../services/whatsappService.js')
    await ws.initWhatsApp()
    res.json({ success: true, message: 'WhatsApp service restarted', status: ws.getStatus() })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── ADD before: export default router ─────────────────────────

// GET /live-chats — fetch from live WA session OR DB fallback
router.get('/live-chats', async (req, res) => {
  try {
    const { cacheGet, cacheSet } = await import('../services/cache.js')

    const cached = cacheGet('wa_live_chats')
    if (cached) return res.json(cached)

    const { getLiveChats, getStatus } = await import('../services/whatsappService.js')
    const status = getStatus()

    if (status !== 'connected') {
      // DB fallback when WA not connected — single query with preview
      const result = await query(`
        SELECT
          COALESCE(NULLIF(contact_name,''), from_number) AS name,
          from_number AS id,
          from_number AS phone,
          COUNT(*)    AS message_count,
          MAX(timestamp) AS last_time,
          SUM(CASE WHEN is_read = false OR is_read IS NULL THEN 1 ELSE 0 END) AS unread,
          (SELECT body FROM whatsapp_messages w2
           WHERE w2.from_number = w1.from_number
           ORDER BY timestamp DESC LIMIT 1) AS preview
        FROM whatsapp_messages w1
        GROUP BY contact_name, from_number
        ORDER BY last_time DESC LIMIT 30
      `).catch(() => ({ rows: [] }))

      const chats = result.rows.map(row => ({
        id: row.id, name: row.name, phone: row.phone,
        messageCount: parseInt(row.message_count),
        unread: parseInt(row.unread), time: row.last_time,
        preview: (row.preview || '').substring(0, 80),
        isGroup: false,
      }))
      const response = { source: 'database', status, chats }
      cacheSet('wa_live_chats', response, 10)
      return res.json(response)
    }

    let chats = await getLiveChats()

    // Fallback to DB when live returns empty
    if (!chats || chats.length === 0) {
      const result = await query(`
        SELECT
          COALESCE(NULLIF(contact_name,''), from_number) AS name,
          from_number AS id,
          from_number AS phone,
          COUNT(*)    AS message_count,
          MAX(timestamp) AS last_time,
          SUM(CASE WHEN is_read = false OR is_read IS NULL THEN 1 ELSE 0 END) AS unread,
          (SELECT body FROM whatsapp_messages w2
           WHERE w2.from_number = w1.from_number
           ORDER BY timestamp DESC LIMIT 1) AS preview
        FROM whatsapp_messages w1
        GROUP BY contact_name, from_number
        ORDER BY last_time DESC LIMIT 30
      `).catch(() => ({ rows: [] }))

      chats = result.rows.map(row => ({
        id: row.id, name: row.name, phone: row.phone,
        messageCount: parseInt(row.message_count),
        unread: parseInt(row.unread), time: row.last_time,
        preview: (row.preview || '').substring(0, 80),
        isGroup: false,
      }))
    } else {
      // Sort: pinned first, then by unread, then by time
      chats.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1
        if (b.unread !== a.unread) return b.unread - a.unread
        return new Date(b.time) - new Date(a.time)
      })
    }

    const response = { source: chats.length ? 'live' : 'database', status, chats }
    cacheSet('wa_live_chats', response, 10)
    res.json(response)
  } catch (e) {
    console.error('[WA] /live-chats error:', e.message)
    res.json({ source: 'error', status: 'error', chats: [], error: e.message })
  }
})

// GET /live-messages/:chatId — messages for a specific chat
router.get('/live-messages/:chatId', async (req, res) => {
  const chatId = decodeURIComponent(req.params.chatId)
  try {
    const { getLiveChatMessages, getStatus } = await import('../services/whatsappService.js')

    if (getStatus() !== 'connected') {
      // DB fallback
      const phone = chatId.replace(/@c\.us|@g\.us/g, '')
      const result = await query(
        `SELECT * FROM whatsapp_messages
         WHERE from_number=$1 OR to_number=$1
         ORDER BY timestamp ASC LIMIT 50`,
        [phone]
      ).catch(() => ({ rows: [] }))
      return res.json({
        messages: result.rows.map(r => ({
          id:     r.msg_id || `db_${r.id}`,
          text:   r.body,
          time:   r.timestamp,
          sender: r.direction === 'outgoing' ? 'Me' : r.from_number,
          type:   r.direction || 'incoming',
          fromMe: r.direction === 'outgoing',
        }))
      })
    }

    let messages = await getLiveChatMessages(chatId)

    // Fallback to DB when live returns empty
    if (!messages || messages.length === 0) {
      const phone = chatId.replace(/@c\.us|@g\.us|@lid/g, '')
      const result = await query(
        `SELECT * FROM whatsapp_messages
         WHERE from_number LIKE $1 OR to_number LIKE $1
         ORDER BY timestamp ASC LIMIT 50`,
        [`%${phone}%`]
      ).catch(() => ({ rows: [] }))
      messages = result.rows.map(r => ({
        id:     r.msg_id || `db_${r.id}`,
        text:   r.body,
        time:   r.timestamp,
        sender: r.direction === 'outgoing' ? 'Me' : r.from_number,
        type:   r.direction || 'incoming',
        fromMe: r.direction === 'outgoing',
      }))
    }

    // Save to DB in background (don't await)
    messages.forEach(msg => {
      const phone = msg.fromMe ? chatId : msg.sender
      query(`
        INSERT INTO whatsapp_messages
          (msg_id, from_number, body, timestamp, is_group, direction, type, is_read)
        VALUES ($1,$2,$3,$4,false,$5,$5,true)
        ON CONFLICT (msg_id) DO NOTHING
      `, [msg.id, msg.fromMe ? 'Me' : phone, msg.text, msg.time,
          msg.fromMe ? 'outgoing' : 'incoming']).catch(() => {})
    })

    res.json({ messages })
  } catch (e) {
    console.error('[WA] /live-messages error:', e.message)
    res.status(500).json({ error: e.message, messages: [] })
  }
}) 

export default router
