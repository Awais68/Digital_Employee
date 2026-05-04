import express from 'express'
import { readVaultFiles, getVaultPath, writeFile } from '../vault-reader.js'
import fs from 'fs'
import path from 'path'

const router = express.Router()

// GET all social data (drafts + history)
router.get('/', (req, res) => {
  try {
    const draftsFiles = readVaultFiles('Pending_Approval')
    const drafts = draftsFiles
      .filter(f => f.frontmatter.type === 'post' || f.filename.includes('POST') || f.filename.includes('SOCIAL'))
      .map(file => ({
        id: file.id,
        ...file.frontmatter,
        preview: file.content.substring(0, 150),
        content: file.content,
        createdAt: file.createdAt.toISOString(),
        status: 'pending_approval',
      }))

    const postedFiles = readVaultFiles('Done')
    const posted = postedFiles
      .filter(f => f.frontmatter.type === 'post' || f.filename.includes('POST') || f.filename.includes('SOCIAL'))
      .map(file => ({
        id: file.id,
        ...file.frontmatter,
        date: file.updatedAt.toISOString(),
        preview: file.content.substring(0, 150),
        status: 'posted',
      }))

    res.json({ drafts, posted })
  } catch (err) {
    console.error('Error fetching social data:', err)
    res.status(500).json({ error: 'Failed to fetch social data', message: err.message })
  }
})

// GET all social posts (drafts + queued)
router.get('/drafts', (req, res) => {
  try {
    const files = readVaultFiles('Pending_Approval')
    const drafts = files
      .filter(f => f.frontmatter.type === 'post' || f.filename.includes('POST') || f.filename.includes('SOCIAL'))
      .map(file => ({
        id: file.id,
        ...file.frontmatter,
        preview: file.content.substring(0, 150),
        createdAt: file.createdAt.toISOString(),
        status: 'pending_approval'
      }))

    res.json(drafts)
  } catch (err) {
    console.error('Error fetching social drafts:', err)
    res.status(500).json({ error: 'Failed to fetch social drafts', message: err.message })
  }
})

// GET posted history
router.get('/history', (req, res) => {
  try {
    const files = readVaultFiles('Done')
    const history = files
      .filter(f => f.frontmatter.type === 'post' || f.filename.includes('POST') || f.filename.includes('SOCIAL'))
      .map(file => ({
        id: file.id,
        title: file.frontmatter.title || file.filename,
        date: file.updatedAt.toISOString(),
        platforms: file.frontmatter.platforms ? file.frontmatter.platforms.split(',') : ['social'],
        status: 'posted',
        preview: file.content.substring(0, 200),
        content: file.content,
      }))

    res.json(history)
  } catch (err) {
    console.error('Error fetching social history:', err)
    res.status(500).json({ error: 'Failed to fetch social history', message: err.message })
  }
})

// CREATE new post (creates approval files)
router.post('/post', (req, res) => {
  try {
    const { content, platforms, scheduleTime } = req.body
    const timestamp = new Date().toISOString().replace(/[:.]/g, '')
    const id = `POST_${timestamp}`

    const targetPlatforms = platforms || ['social']
    
    targetPlatforms.forEach(platform => {
      const fileName = `${id}_${platform.toUpperCase()}.md`
      const filePath = getVaultPath('Pending_Approval', fileName)
      const frontmatter = {
        type: 'post',
        platform,
        scheduled: !!scheduleTime,
        scheduleTime: scheduleTime || null,
        createdAt: new Date().toISOString(),
        status: 'pending_approval'
      }

      writeFile(filePath, frontmatter, content)
    })

    if (global.broadcast) {
      global.broadcast({ type: 'dashboard_update', message: 'New social post created for approval' })
    }
    
    res.json({ success: true, id, platforms: targetPlatforms, message: 'Posts created for approval' })
  } catch (err) {
    console.error('Error creating social post:', err)
    res.status(500).json({ error: 'Failed to create social post', message: err.message })
  }
})

export default router
