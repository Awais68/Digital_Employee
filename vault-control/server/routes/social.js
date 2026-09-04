import express from 'express'
import { readVaultFiles, getVaultPath, writeFile } from '../vault-reader.js'
import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
const execFileAsync = promisify(execFile)
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { createNotification } from '../services/notificationService.js'
import { requireAdmin } from '../database/auth.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const router = express.Router()

// --- Publish dedup guard (60s window, in-memory) ---
const recentPublishes = new Map()
const DEDUP_WINDOW_MS = 60000

function checkDuplicatePublish(key) {
  const now = Date.now()
  const last = recentPublishes.get(key)
  if (last && (now - last) < DEDUP_WINDOW_MS) {
    return true
  }
  recentPublishes.set(key, now)
  return false
}
// --- end dedup guard ---

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
        preview: file.content.substring(0, 200),
        status: 'posted',
      }))

    res.json({ drafts, posted })
  } catch (err) {
    console.error('Error fetching social data:', err)
    res.status(500).json({ error: 'Failed to fetch social data', message: err.message })
  }
})

// GET all social posts (drafts + queued + approved)
router.get('/drafts', (req, res) => {
  try {
    const isSocialPost = f => f.frontmatter.type === 'post' || f.filename.includes('POST') || f.filename.includes('SOCIAL')

    const pendingFiles = readVaultFiles('Pending_Approval')
    const pendingDrafts = pendingFiles
      .filter(isSocialPost)
      .map(file => ({
        id: file.id,
        ...file.frontmatter,
        preview: file.content.substring(0, 150),
        createdAt: file.createdAt.toISOString(),
        status: 'pending_approval',
      }))

    const approvedFiles = readVaultFiles('Approved')
    const approvedDrafts = approvedFiles
      .filter(isSocialPost)
      .map(file => ({
        id: file.id,
        ...file.frontmatter,
        preview: file.content.substring(0, 150),
        createdAt: file.createdAt.toISOString(),
        status: 'approved',
      }))

    res.json([...pendingDrafts, ...approvedDrafts])
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
router.post('/post', requireAdmin, (req, res) => {
  try {
    const { content, platforms, scheduleTime, draftId, imageUrl, pageName } = req.body
    
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Content is required' })
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '')
    const id = draftId || `POST_${timestamp}`

    const targetPlatforms = platforms || ['social']
    
    // If draftId provided, update existing file
    if (draftId) {
      const filePath = getVaultPath('Pending_Approval', `${draftId}.md`)
      if (fs.existsSync(filePath)) {
        const frontmatter = {
          type: 'post',
          platforms: targetPlatforms.join(','),
          scheduled: !!scheduleTime,
          scheduleTime: scheduleTime || null,
          imageUrl: imageUrl || null,
          pageName: pageName || null,
          createdAt: new Date().toISOString(),
          status: 'pending_approval',
          updatedAt: new Date().toISOString(),
        }
        const success = writeFile(filePath, frontmatter, content)
        if (!success) {
          return res.status(500).json({ success: false, message: 'Failed to update draft' })
        }
        if (global.broadcast) {
          global.broadcast({ type: 'approval_changed', action: 'updated', id: draftId })
        }
        return res.json({ success: true, id, platforms: targetPlatforms, message: 'Draft updated' })
      }
    }
    
    // Create new files
    let createdCount = 0
    targetPlatforms.forEach(platform => {
      const fileName = `${id}_${platform.toUpperCase()}.md`
      const filePath = getVaultPath('Pending_Approval', fileName)
      const frontmatter = {
        type: 'post',
        platform,
        platforms: targetPlatforms.join(','),
        scheduled: !!scheduleTime,
        scheduleTime: scheduleTime || null,
        imageUrl: imageUrl || null,
        pageName: pageName || null,
        createdAt: new Date().toISOString(),
        status: 'pending_approval'
      }
      const success = writeFile(filePath, frontmatter, content)
      if (success) createdCount++
    })

    if (createdCount === 0) {
      return res.status(500).json({ success: false, message: 'Failed to create post files' })
    }

    if (global.broadcast) {
      global.broadcast({ type: 'dashboard_update', message: 'New social post created for approval' })
    }
    
    res.json({ success: true, id, platforms: targetPlatforms, message: `Posts created for approval (${createdCount}/${targetPlatforms.length})` })
  } catch (err) {
    console.error('Error creating social post:', err)
    res.status(500).json({ success: false, error: 'Failed to create social post', message: err.message })
  }
})

// SAVE draft
router.post('/draft', requireAdmin, (req, res) => {
  try {
    const { content, platforms, scheduleTime, pageName } = req.body
    
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Content is required' })
    }
    
    const timestamp = Date.now()
    const id = `DRAFT_${timestamp}`

    const filePath = getVaultPath('Pending_Approval', `${id}.md`)
    const frontmatter = {
      type: 'post',
      platforms: platforms?.join(',') || 'draft',
      pageName: pageName || null,
      scheduled: !!scheduleTime,
      scheduleTime: scheduleTime || null,
      createdAt: new Date().toISOString(),
      status: 'draft',
    }
    const success = writeFile(filePath, frontmatter, content)
    
    if (!success) {
      return res.status(500).json({ success: false, message: 'Failed to save draft' })
    }

    res.json({ success: true, id, message: 'Draft saved' })
  } catch (err) {
    console.error('Error saving draft:', err)
    res.status(500).json({ success: false, error: 'Failed to save draft', message: err.message })
  }
})

// DELETE draft
router.delete('/draft/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params
    const folders = ['Pending_Approval', 'Approved', 'Done']
    let deleted = false
    let deletedFolder = null
    
    for (const folder of folders) {
      const filePath = path.join(getVaultPath(folder), `${id}.md`)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        deleted = true
        deletedFolder = folder
        break
      }
    }
    
    if (!deleted) {
      // Also try with timestamp-based filename format
      const allFolders = ['Pending_Approval', 'Approved', 'Done']
      for (const folder of allFolders) {
        const dirPath = getVaultPath(folder)
        if (fs.existsSync(dirPath)) {
          const files = fs.readdirSync(dirPath)
          const match = files.find(f => f.includes(id) || f === `${id}.md`)
          if (match) {
            fs.unlinkSync(path.join(dirPath, match))
            deleted = true
            deletedFolder = folder
            break
          }
        }
      }
    }
    
    if (!deleted) {
      return res.status(404).json({ 
        success: false, 
        message: `File not found for id: ${id}` 
      })
    }
    
    if (global.broadcast) {
      global.broadcast({ type: 'draft_deleted', id, folder: deletedFolder })
    }
    
    res.json({ success: true, message: 'Draft deleted' })
  } catch (err) {
    console.error('[Delete] Error:', err)
    res.status(500).json({ success: false, message: err.message })
  }
})

// PUBLISH draft now - ACTUALLY POSTS TO PLATFORMS
router.post('/draft/:id/publish', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const folders = ['Approved', 'Pending_Approval']
    let sourcePath = null
    let sourceFolder = null
  
    for (const folder of folders) {
      const candidate = path.join(getVaultPath(folder), `${id}.md`)
      if (fs.existsSync(candidate)) {
        sourcePath = candidate
        sourceFolder = folder
        break
      }
    }
  
    // Also try finding by partial id match
    if (!sourcePath) {
      for (const folder of folders) {
        const dirPath = getVaultPath(folder)
        if (!fs.existsSync(dirPath)) continue
        const files = fs.readdirSync(dirPath)
        const match = files.find(f => f.includes(id))
        if (match) {
          sourcePath = path.join(dirPath, match)
          sourceFolder = folder
          break
        }
      }
    }
  
    if (!sourcePath) {
      console.error('[Publish] File not found for id:', id)
      return res.status(404).json({ 
        success: false, 
        message: `Post not found. ID: ${id}` 
      })
    }
  
    console.log('[Publish] Found file at:', sourcePath)

    if (checkDuplicatePublish(sourcePath)) {
      console.warn('[Publish] Duplicate publish blocked for:', sourcePath)
      return res.status(429).json({
        success: false,
        message: 'Duplicate publish request blocked - this post was already published/attempted in the last 60 seconds.'
      })
    }

    const donePath = getVaultPath('Done')
    
    // Read file content and frontmatter
    const fileContent = fs.readFileSync(sourcePath, 'utf-8')
    let platforms = []
    let content = fileContent.replace(/^---\n[\s\S]*?\n---/, '').trim()
    
     const fmMatch = fileContent.match(/^---\n([\s\S]*?)\n---/)
     if (fmMatch) {
       const fm = fmMatch[1]
       const platformsMatch = fm.match(/platforms?:\s*(.+)/)
       if (platformsMatch) {
         platforms = platformsMatch[1]
           .replace(/["'\[\]]/g, '') // strip quotes and brackets
           .split(',')
           .map(p => p.trim().toLowerCase())
           .filter(Boolean)
       }
     }
    
    if (platforms.length === 0) {
      platforms = ['linkedin']
    }
    
    console.log(`[Publish] Posting to platforms: ${platforms.join(', ')}`)
    console.log(`[Publish] Content: ${content.substring(0, 100)}...`)
    
    const VAULT_PARENT = path.resolve(__dirname, '../../..')
    const publishScript = path.join(VAULT_PARENT, 'publish_post.py')
    
    if (!fs.existsSync(publishScript)) {
      return res.status(500).json({ 
        success: false, 
        message: 'Publish script not found. Please ensure publish_post.py exists in the vault root.' 
      })
    }
    
    const results = {}
    let allSucceeded = true

    // Post to each platform using the unified publish script (async, parallel)
    const publishPromises = platforms.map(async (platform) => {
      try {
        console.log(`[Publish] Running ${platform} post...`)

        const { stdout, stderr } = await execFileAsync('python3', ['publish_post.py', sourcePath, platform], {
          cwd: VAULT_PARENT,
          maxBuffer: 10 * 1024 * 1024,
          timeout: 120000,
        })

        if (stderr) {
          console.error(`[Publish] ${platform} stderr:`, stderr)
        }

        // Find JSON output in stdout
        const lines = (stdout || '').trim().split('\n')
        let lastJson = null
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            lastJson = JSON.parse(lines[i])
            break
          } catch {}
        }

        return { platform, success: true, details: lastJson?.results || {}, stderr: stderr?.trim() || null }
      } catch (err) {
        console.error(`[Publish] error for ${platform}:`, err.message)
        return { platform, success: false, message: err.message, stderr: err.stderr?.trim() || '' }
      }
    })

    const publishResults = await Promise.all(publishPromises)
    for (const r of publishResults) {
      results[r.platform] = r
      if (!r.success) allSucceeded = false
    }

    // Move to Done folder ONLY if ALL platforms succeeded
    const destPath = path.join(donePath, `${id}.md`)
    fs.mkdirSync(donePath, { recursive: true })

    if (allSucceeded) {
      fs.renameSync(sourcePath, destPath)
      createNotification('success', 'Post Published', `Post published on ${Object.keys(results).join(', ')}`, { source: 'social', id, results })
      if (global.broadcast) {
        global.broadcast({ type: 'approval_changed', action: 'published', id, results })
      }
    } else {
      // Update frontmatter with error status, keep in Pending_Approval
      try {
        const fileContent = fs.readFileSync(sourcePath, 'utf-8')
        const updated = fileContent.replace(
          /(status:\s*)pending_approval/,
          '$1publish_failed'
        )
        fs.writeFileSync(sourcePath, updated, 'utf-8')
      } catch (writeErr) {
        console.error('[Publish] Failed to update status:', writeErr.message)
      }
      createNotification('error', 'Post Failed', `Failed to post on ${Object.keys(results).filter(p => !results[p].success).join(', ')}`, { source: 'social', id, results })
      if (global.broadcast) {
        global.broadcast({ type: 'approval_changed', action: 'publish_failed', id, results })
      }
    }

    const failedPlatforms = Object.entries(results)
      .filter(([, r]) => !r.success)
      .map(([p]) => p)

    res.status(allSucceeded ? 200 : 500).json({
      success: allSucceeded,
      message: allSucceeded
        ? 'Successfully posted to all platforms!'
        : `Failed to post to: ${failedPlatforms.join(', ')}`,
      results,
    })
  } catch (err) {
    console.error('Error publishing draft:', err)
    res.status(500).json({ error: 'Failed to publish', message: err.message })
  }
})

// AUTO-APPROVE AND PUBLISH ALL pending posts
router.post('/auto-publish', requireAdmin, async (req, res) => {
  try {
    const files = readVaultFiles('Pending_Approval')
    const socialPosts = files.filter(f => 
      f.frontmatter.type === 'post' || 
      f.filename.includes('POST') || 
      f.filename.includes('SOCIAL')
    )
    
    if (socialPosts.length === 0) {
      return res.json({ success: false, message: 'No pending social posts to publish' })
    }
    
    const publishResults = []
    
    for (const post of socialPosts) {
      try {
        const postPath = getVaultPath('Pending_Approval', post.filename)

        if (checkDuplicatePublish(postPath)) {
          console.warn('[Auto-Publish] Duplicate publish blocked for:', postPath)
          publishResults.push({
            filename: post.filename,
            success: false,
            message: 'Duplicate publish blocked (already attempted within 60s)'
          })
          continue
        }

        const fileContent = fs.readFileSync(postPath, 'utf-8')
        
        let platforms = []
        const fmMatch = fileContent.match(/^---\n([\s\S]*?)\n---/)
        if (fmMatch) {
          const fm = fmMatch[1]
          const platformsMatch = fm.match(/platforms?:\s*(.+)/)
          if (platformsMatch) {
            platforms = platformsMatch[1].split(',').map(p => p.trim().toLowerCase())
          }
        }
        
        if (platforms.length === 0) platforms = ['linkedin']
        
        const VAULT_PARENT = path.resolve(__dirname, '../../..')

        const { stdout, stderr } = await execFileAsync('python3', ['publish_post.py', postPath, ...platforms], {
          cwd: VAULT_PARENT,
          maxBuffer: 10 * 1024 * 1024,
          timeout: 120000,
        })

        if (stderr) {
          console.error(`[Auto-Publish] ${post.filename} stderr:`, stderr)
        }

        const lines = (stdout || '').trim().split('\n')
        let lastJson = null
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            lastJson = JSON.parse(lines[i])
            break
          } catch {}
        }

        const allSucceeded = lastJson && lastJson.success

        if (allSucceeded) {
          const donePath = getVaultPath('Done')
          fs.mkdirSync(donePath, { recursive: true })
          const destPath = path.join(donePath, post.filename)
          fs.renameSync(postPath, destPath)
        }

        publishResults.push({
          id: post.id,
          filename: post.filename,
          platforms,
          success: allSucceeded,
          details: lastJson?.results || {},
          stderr: stderr?.trim() || null,
        })
        
      } catch (err) {
        console.error(`[Auto-Publish] Error for ${post.filename}:`, err.message)
        publishResults.push({
          id: post.id,
          filename: post.filename,
          success: false,
          error: err.message
        })
      }
    }
    
    if (global.broadcast) {
      global.broadcast({ type: 'dashboard_update', message: `Auto-published ${publishResults.filter(r => r.success).length} posts` })
    }
    
    const successCount = publishResults.filter(r => r.success).length
    res.json({
      success: successCount > 0,
      total: publishResults.length,
      published: successCount,
      results: publishResults
    })
    
  } catch (err) {
    console.error('Error in auto-publish:', err)
    res.status(500).json({ error: 'Failed to auto-publish', message: err.message })
  }
})

export default router
