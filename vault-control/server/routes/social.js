import express from 'express'
import { readVaultFiles, getVaultPath, writeFile } from '../vault-reader.js'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

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
        preview: file.content.substring(0, 200),
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
    const { content, platforms, scheduleTime, draftId } = req.body
    
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
router.post('/draft', (req, res) => {
  try {
    const { content, platforms, scheduleTime } = req.body
    
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Content is required' })
    }
    
    const timestamp = Date.now()
    const id = `DRAFT_${timestamp}`

    const filePath = getVaultPath('Pending_Approval', `${id}.md`)
    const frontmatter = {
      type: 'post',
      platforms: platforms?.join(',') || 'draft',
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
router.delete('/draft/:id', (req, res) => {
  try {
    const { id } = req.params
    const filePath = getVaultPath('Pending_Approval', `${id}.md`)
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      if (global.broadcast) {
        global.broadcast({ type: 'approval_changed', action: 'deleted', id })
      }
      res.json({ success: true, message: 'Draft deleted' })
    } else {
      res.status(404).json({ error: 'Draft not found' })
    }
  } catch (err) {
    console.error('Error deleting draft:', err)
    res.status(500).json({ error: 'Failed to delete draft', message: err.message })
  }
})

// PUBLISH draft now - ACTUALLY POSTS TO PLATFORMS
router.post('/draft/:id/publish', (req, res) => {
  try {
    const { id } = req.params
    const pendingPath = getVaultPath('Pending_Approval')
    const donePath = getVaultPath('Done')
    
    const sourcePath = path.join(pendingPath, `${id}.md`)
    if (!fs.existsSync(sourcePath)) {
      return res.status(404).json({ error: 'Draft not found' })
    }
    
    // Read file content and frontmatter
    const fileContent = fs.readFileSync(sourcePath, 'utf-8')
    let platforms = []
    let content = fileContent.replace(/^---\n[\s\S]*?\n---/, '').trim()
    
    const fmMatch = fileContent.match(/^---\n([\s\S]*?)\n---/)
    if (fmMatch) {
      const fm = fmMatch[1]
      const platformsMatch = fm.match(/platforms?:\s*(.+)/)
      if (platformsMatch) {
        platforms = platformsMatch[1].split(',').map(p => p.trim().toLowerCase())
      }
    }
    
    if (platforms.length === 0) {
      platforms = ['linkedin']
    }
    
    console.log(`[Publish] Posting to platforms: ${platforms.join(', ')}`)
    console.log(`[Publish] Content: ${content.substring(0, 100)}...`)
    
    const results = {}
    const VAULT_PARENT = path.resolve(process.cwd(), '../..')
    
    // Post to each platform using Python scripts
    for (const platform of platforms) {
      try {
        if (platform === 'linkedin') {
          console.log(`[Publish] Running LinkedIn post...`)
          const escapedContent = content.replace(/"/g, '\\"').replace(/\n/g, '\\n')
          const cmd = `cd "${VAULT_PARENT}" && python3 -c "from Agent_Skills.SKILL_LInkedin_Playwright_MCP import post_to_linkedin; import json; res = post_to_linkedin('${escapedContent}'); print(json.dumps(res))"`
          
          const output = execSync(cmd, { timeout: 120000 }).toString()
          const jsonMatch = output.match(/\{.*\}/s)
          const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { success: false, message: 'No output' }
          results.linkedin = result
          console.log(`[Publish] LinkedIn result:`, result)
          
        } else if (platform === 'facebook') {
          console.log(`[Publish] Running Facebook post...`)
          const escapedContent = content.replace(/"/g, '\\"').replace(/\n/g, '\\n')
          const cmd = `cd "${VAULT_PARENT}" && python3 -c "from Agent_Skills.SKILL_Facebook_Instagram_Post import post_to_facebook; import json; res = post_to_facebook('${escapedContent}'); print(json.dumps(res))"`
          
          const output = execSync(cmd, { timeout: 120000 }).toString()
          const jsonMatch = output.match(/\{.*\}/s)
          const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { success: false, message: 'No output' }
          results.facebook = result
          console.log(`[Publish] Facebook result:`, result)
          
        } else if (platform === 'instagram') {
          console.log(`[Publish] Running Instagram post...`)
          const imagePath = path.join(VAULT_PARENT, 'instagram_post_20260420.jpg')
          const escapedContent = content.replace(/"/g, '\\"').replace(/\n/g, '\\n')
          const escapedImagePath = imagePath.replace(/"/g, '\\"')
          const cmd = `cd "${VAULT_PARENT}" && python3 -c "from Agent_Skills.SKILL_Facebook_Instagram_Post import post_to_instagram; import json; res = post_to_instagram('${escapedContent}', '${escapedImagePath}'); print(json.dumps(res))"`
          
          const output = execSync(cmd, { timeout: 120000 }).toString()
          const jsonMatch = output.match(/\{.*\}/s)
          const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { success: false, message: 'No output' }
          results.instagram = result
          console.log(`[Publish] Instagram result:`, result)
        }
      } catch (err) {
        console.error(`[Publish] Error posting to ${platform}:`, err.message)
        results[platform] = { success: false, message: err.message }
      }
    }
    
    // Move to Done folder
    const destPath = path.join(donePath, `${id}.md`)
    fs.mkdirSync(donePath, { recursive: true })
    fs.renameSync(sourcePath, destPath)
    
    if (global.broadcast) {
      global.broadcast({ type: 'approval_changed', action: 'published', id, results })
    }
    
    const allSuccess = Object.values(results).every(r => r.success)
    res.json({ 
      success: allSuccess, 
      message: allSuccess ? 'Successfully posted!' : 'Some posts failed',
      results 
    })
  } catch (err) {
    console.error('Error publishing draft:', err)
    res.status(500).json({ error: 'Failed to publish', message: err.message })
  }
})

export default router
