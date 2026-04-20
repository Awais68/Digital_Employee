import express from 'express'
import { readVaultFiles, getVaultPath, writeFile } from '../vault-reader.js'
import fs from 'fs'
import path from 'path'

const router = express.Router()

// GET all social data (drafts + history)
router.get('/', (req, res) => {
  const draftsFiles = readVaultFiles('Pending_Approval')
  const drafts = draftsFiles.filter(f => f.frontmatter.type === 'post' || f.filename.includes('POST')).map(file => ({
    id: file.id,
    ...file.frontmatter,
    preview: file.content.substring(0, 150),
  }))

  const postedFiles = readVaultFiles('Done')
  const posted = postedFiles.filter(f => f.frontmatter.type === 'post' || f.filename.includes('POST')).map(file => ({
    id: file.id,
    ...file.frontmatter,
    date: file.updatedAt,
    preview: file.content.substring(0, 150),
    status: 'posted',
  }))

  res.json({ drafts, posted })
})

// GET all social posts (drafts + queued)
router.get('/drafts', (req, res) => {
  const files = readVaultFiles('Pending_Approval')
  const drafts = files.filter(f => f.frontmatter.type === 'post' || f.filename.includes('POST')).map(file => ({
    id: file.id,
    ...file.frontmatter,
    preview: file.content.substring(0, 150),
    createdAt: file.createdAt,
    status: 'pending_approval'
  }))

  res.json(drafts)
})

// GET posted history
router.get('/history', (req, res) => {
  const files = readVaultFiles('Done')
  const history = files.filter(f => f.frontmatter.type === 'post' || f.filename.includes('POST')).map(file => ({
    id: file.id,
    title: file.frontmatter.title || file.filename,
    date: file.updatedAt,
    platforms: file.frontmatter.platforms ? file.frontmatter.platforms.split(',') : ['social'],
    status: 'posted',
    preview: file.content.substring(0, 200),
    engagement: {
      likes: Math.floor(Math.random() * 500),
      comments: Math.floor(Math.random() * 50)
    }
  }))

  res.json(history)
})

// CREATE new post (creates approval files)
router.post('/post', (req, res) => {
  const { content, platforms, scheduleTime } = req.body
  const timestamp = new Date().toISOString().replace(/[:.]/g, '')
  const id = `POST_${timestamp}`

  platforms.forEach(platform => {
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
  
  res.json({ success: true, id, platforms, message: 'Posts created for approval' })
})

export default router
