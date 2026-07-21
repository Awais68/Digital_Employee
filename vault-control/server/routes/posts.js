import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { query } from '../database/connection.js'
import { generateDailyPosts, DEFAULT_TOPICS } from '../services/postGenerator.js'
import { publishPost } from '../services/socialMediaService.js'
import { createNotification } from '../services/notificationService.js'
import { requireAdmin } from '../database/auth.js'

const uploadsDir = path.resolve('public/uploads')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `post_${Date.now()}${path.extname(file.originalname)}`),
})
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } })

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
})

const router = express.Router()

// STRICT SOCIAL MEDIA RULES
const STRICT_RULES = {
  requireImage: true,
  requireHashtags: true,
  requireEmojis: true,
  requireMentions: true,
  minHashtags: 1,
  maxHashtags: 5,
  blockWithoutImage: true,
  mandatoryMentions: ['Ameen Alam', 'Zia Khan', 'Asharib Ali'],
  spamKeywords: ['buy now', 'click here', 'limited time', 'act fast', '100% free', 'act now', 'free money'],
  platforms: {
    linkedin: { minWords: 50, maxWords: 500, minHashtags: 1, maxHashtags: 5 },
    facebook: { minWords: 50, maxWords: 500, minHashtags: 1, maxHashtags: 5 },
    instagram: { minWords: 50, maxWords: 500, minHashtags: 3, maxHashtags: 15 },
    twitter: { minWords: 5, maxWords: 50, minHashtags: 1, maxHashtags: 3, disabled: true },
  }
}

// Insert missing @mentions inline instead of dumping at the end
function insertMentionsInline(content, mentions) {
  const missingMentions = mentions.filter(m => !content.toLowerCase().includes(m.toLowerCase()))
  if (!missingMentions.length) return content

  // Find the last paragraph break before hashtags start, or use last sentence end
  const hashtagIndex = content.search(/#\w/)
  const insertionPoint = hashtagIndex > 50 ? hashtagIndex : content.length

  const mentionText = missingMentions.map(m => `@${m}`).join(', ')
  const inlineSentence = `\n\nShoutout to ${mentionText} for their incredible work in this space!`

  return content.slice(0, insertionPoint).trimEnd() + inlineSentence + '\n\n' + content.slice(insertionPoint).trimStart()
}

// STRICT VALIDATION FUNCTION
function validatePostStrict(content, platforms, hasImage) {
  const errors = []
  
  // Image validation (MANDATORY)
  if (STRICT_RULES.blockWithoutImage && !hasImage) {
    errors.push('BLOCKED: Image is MANDATORY - every post must have an image')
  }
  
  // Content validation
  if (!content || content.trim().length === 0) {
    errors.push('Content cannot be empty')
    return errors
  }
  
  const words = content.split(/\s+/).filter(w => w.length > 0)
  
  // Global minimum word count (reduced for flexibility)
  if (words.length < 50) {
    errors.push(`Minimum 50 words required (current: ${words.length})`)
  }
  
  // Word count per platform
  platforms.forEach(platformId => {
    const platformRules = STRICT_RULES.platforms[platformId]
    if (platformRules) {
      if (words.length < platformRules.minWords) {
        errors.push(`${platformId}: Too few words (${words.length}/${platformRules.minWords} minimum)`)
      }
      if (words.length > platformRules.maxWords) {
        errors.push(`${platformId}: Too many words (${words.length}/${platformRules.maxWords} maximum)`)
      }
    }
  })
  
  // Hashtag validation (auto-suggest if missing, only block if 0)
  if (STRICT_RULES.requireHashtags) {
    const hashtags = content.match(/#\w+/g) || []
    if (hashtags.length < 1) {
      errors.push(`No hashtags found - add at least 1 (e.g. #AI #Automation #DigitalTransformation)`)
    }
  }
  
  // Mandatory mentions validation (case-insensitive)
  if (STRICT_RULES.requireMentions) {
    const contentLower = content.toLowerCase()
    const missingMentions = STRICT_RULES.mandatoryMentions.filter(m => !contentLower.includes(m.toLowerCase()))
    if (missingMentions.length > 0) {
      // Auto-add missing mentions instead of blocking
      console.log(`[Validation] Auto-adding ${missingMentions.length} missing mentions`)
    }
  }
  
  // Emoji validation (reduced to 1 minimum)
  if (STRICT_RULES.requireEmojis) {
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}]/gu
    const emojis = (content.match(emojiRegex) || []).filter(m => m.codePointAt(0) !== 0xFE0F)
    if (emojis.length < 1) {
      errors.push(`No emojis found - add at least 1 for engagement`)
    }
  }
  
  // Spam detection
  const lowerContent = content.toLowerCase()
  STRICT_RULES.spamKeywords.forEach(spam => {
    if (lowerContent.includes(spam.toLowerCase())) {
      errors.push(`Spam keyword detected: "${spam}"`)
    }
  })
  
  return errors
}

router.get('/topics', (req, res) => {
  res.json({ topics: DEFAULT_TOPICS })
})

// POST /generate-image - Auto-generate image for post
router.post('/generate-image', requireAdmin, async (req, res) => {
  try {
    const { topic, style } = req.body
    
    if (!topic) {
      return res.status(400).json({ error: 'Topic is required for image generation' })
    }
    
    console.log('[ImageGen] Generating image for topic:', topic)
    
    const { generatePostImage } = await import('../services/imageGenerator.js')
    const imageUrl = await generatePostImage(topic, style || 'professional')
    
    console.log('[ImageGen] Generated image URL:', imageUrl)
    
    res.json({ success: true, imageUrl })
  } catch (e) {
    console.error('[ImageGen] Failed:', e.message)
    res.status(500).json({ error: 'Image generation failed: ' + e.message })
  }
})

router.post('/generate', requireAdmin, async (req, res) => {
  console.log('[PostGen] Request received:', { topic: req.body?.topic, platforms: req.body?.platforms })
  try {
    const { topic, platforms } = req.body
    console.log('[PostGen] Calling generateDailyPosts with topic:', topic, 'platforms:', platforms)
    const result = await generateDailyPosts(topic, platforms)
    console.log('[PostGen] Success:', result.posts?.length, 'posts generated')

    for (const post of result.posts) {
      await query(`
        INSERT INTO scheduled_posts
          (topic, platform, content, image_url, scheduled_for, status, hashtags, mentions)
        VALUES ($1,$2,$3,$4,$5,'scheduled',$6,$7)
      `, [
        result.topic, post.platform, post.content, post.imageUrl,
        post.scheduledFor,
        JSON.stringify(post.hashtags || []),
        JSON.stringify(post.mentions || []),
      ])
    }

    const grouped = {}
    for (const post of result.posts) {
      if (!grouped[post.platform]) grouped[post.platform] = []
      grouped[post.platform].push(post)
    }
    res.json({ success: true, topic: result.topic, posts: grouped })
  } catch (e) {
    console.error('[PostGen] FULL ERROR:', e)
    res.status(500).json({ error: e.message, stack: e.stack })
  }
})

router.get('/scheduled', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM scheduled_posts WHERE status='scheduled' AND scheduled_for > NOW() ORDER BY scheduled_for ASC`
    )
    res.json(result.rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.get('/pending-approval', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM scheduled_posts WHERE status='pending_approval' ORDER BY created_at DESC`
    )
    res.json(result.rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/:id/approve-publish', requireAdmin, async (req, res) => {
  try {
    const postResult = await query('SELECT * FROM scheduled_posts WHERE id=$1', [req.params.id])
    if (!postResult.rows[0]) return res.status(404).json({ error: 'Post not found' })
    const post = postResult.rows[0]

    console.log('[Approval] Publishing immediately to', post.platform)
    const publishResult = await publishPost(post)

    const postUrl = publishResult.url || publishResult.post_url || ''
    await query(
      `UPDATE scheduled_posts SET status='published', published_at=NOW(), post_url=$1 WHERE id=$2`,
      [postUrl, post.id]
    )

    createNotification('success', 'Post Published!', `${post.platform} post published successfully`, { source: 'post', id: post.id, url: publishResult.url })

    if (global.broadcast) {
      global.broadcast({
        type: 'notification',
        category: 'success',
        title: 'Post Published!',
        message: `${post.platform} post published successfully`,
        url: publishResult.url
      })
    }

    res.json({ success: true, published: true, url: postUrl, platform: post.platform })
  } catch (e) {
    console.error('[Approval] Publish error:', e)
    await query(`UPDATE scheduled_posts SET status='failed' WHERE id=$1`, [req.params.id]).catch(() => {})
    createNotification('error', 'Post Failed', `Failed to publish on ${req.params.id}`, { source: 'post', id: req.params.id })
    res.status(500).json({ error: e.message })
  }
})

router.get('/queue', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM scheduled_posts WHERE status='scheduled' AND scheduled_for > NOW() ORDER BY scheduled_for ASC`
    )
    res.json(result.rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /compose — create a manual post directly in the DB
router.post('/compose', requireAdmin, async (req, res) => {
  try {
    const { content, platforms, imageUrl, scheduleTime, topic, publishNow } = req.body
    if (!content || !platforms || platforms.length === 0) {
      return res.status(400).json({ error: 'Content and platforms required' })
    }

    const created = []
    const now = new Date()
    const scheduledFor = scheduleTime ? new Date(scheduleTime) : new Date(now.getTime() + 86400000)
    const status = publishNow ? 'pending' : 'pending_approval'

    for (const platform of platforms) {
      const result = await query(`
        INSERT INTO scheduled_posts
          (topic, platform, content, image_url, scheduled_for, status, hashtags, mentions, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
        RETURNING id
      `, [
        topic || 'Manual post',
        platform.toLowerCase(),
        content,
        imageUrl || null,
        scheduledFor.toISOString(),
        status,
        JSON.stringify([]),
        JSON.stringify([]),
      ])
      created.push({ id: result.rows[0].id, platform })
    }

    if (publishNow) {
      const results = []
      for (const post of created) {
        try {
          const postData = await query('SELECT * FROM scheduled_posts WHERE id=$1', [post.id])
          if (postData.rows[0]) {
            const result = await publishPost(postData.rows[0])
            if (result?.skipped) {
              results.push({ id: post.id, platform: post.platform, success: true, skipped: true })
            } else {
              await query(`UPDATE scheduled_posts SET status='published', published_at=NOW() WHERE id=$1`, [post.id])
              results.push({ id: post.id, platform: post.platform, success: true })
            }
          }
        } catch (e) {
          console.error(`[Compose] PublishNow error for post ${post.id}:`, e.message)
          await query(`UPDATE scheduled_posts SET status='failed' WHERE id=$1`, [post.id]).catch(() => {})
          results.push({ id: post.id, platform: post.platform, success: false, error: e.message })
        }
      }
      const succeeded = results.filter(r => r.success).length
      const failed = results.filter(r => !r.success).length
      if (succeeded > 0) {
        createNotification('success', 'Posts Published', `${succeeded} post(s) published`, { source: 'post', posts: results })
      }
      if (failed > 0) {
        createNotification('error', 'Some Posts Failed', `${failed} post(s) failed: ${results.filter(r => !r.success).map(r => r.platform).join(', ')}`, { source: 'post', posts: results })
      }
      res.json({ success: succeeded > 0, posts: results, published: true, succeeded, failed })
      return // already sent response
    } else {
      createNotification('info', 'Posts Pending Approval', `${created.length} post(s) created for ${platforms.join(', ')}`, { source: 'post', posts: created })
    }

    if (global.broadcast) {
      global.broadcast({ type: publishNow ? 'post_published' : 'approval_needed', count: created.length })
    }

    res.json({ success: true, posts: created, published: !!publishNow })
  } catch (e) {
    console.error('[Compose] Error:', e)
    res.status(500).json({ error: e.message })
  }
})

// DELETE /:id — delete a scheduled/pending post
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM scheduled_posts WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /upload-image — upload image for social posts
router.post('/upload-image', requireAdmin, upload.single('image'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    const url = `/uploads/${req.file.filename}`
    res.json({ url, filename: req.file.filename })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /publish-now — immediate post to social platforms with image
router.post('/publish-now', requireAdmin, memoryUpload.single('image'), async (req, res) => {
  try {
    let { content, platforms } = req.body
    const platformList = JSON.parse(platforms || '["linkedin","facebook","instagram"]')
    const imageBuffer  = req.file?.buffer || null

    console.log('[PublishNow] Platforms:', platformList)
    console.log('[PublishNow] Has image:', !!imageBuffer, imageBuffer ? req.file.size + ' bytes' : '')

    // AUTO-ADD MENTIONS inline if missing (case-insensitive check)
    const contentLower = (content || '').toLowerCase()
    const hasMentions = STRICT_RULES.mandatoryMentions.some(m => contentLower.includes(m.toLowerCase()))
    if (!hasMentions && content) {
      content = insertMentionsInline(content, STRICT_RULES.mandatoryMentions)
      console.log('[PublishNow] Auto-added mandatory mentions inline')
    }

    // STRICT VALIDATION
    const validationErrors = validatePostStrict(content, platformList, !!imageBuffer)
    if (validationErrors.length > 0) {
      console.log('[PublishNow] BLOCKED:', validationErrors)
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        validationErrors,
        results: platformList.map(p => ({ platform: p, success: false, error: 'Validation failed: ' + validationErrors[0] }))
      })
    }

    const { postToFacebook, postToLinkedIn, postToInstagram, postToTwitter } =
      await import('../services/socialMediaService.js')
    const { getPublicImageUrl, hostImageLocally } =
      await import('../services/imageHosting.js')

    let imageUrl = null
    if (imageBuffer) {
      try {
        imageUrl = await getPublicImageUrl(imageBuffer, true)
        console.log('[PublishNow] Image URL:', imageUrl?.substring(0, 80))
      } catch (e) {
        console.warn('[PublishNow] Image hosting failed:', e.message)
      }
    }

    const results = []

    for (const platform of platformList) {
      if (process.env.DRY_RUN === 'true') {
        console.log(`[DRY RUN] Would post to ${platform}:`, content.substring(0, 50))
        results.push({ platform, success: true, dry_run: true, url: null })
        continue
      }

      try {
        let result
        if (platform === 'facebook')  result = await postToFacebook(content, imageUrl)
        if (platform === 'linkedin')  result = await postToLinkedIn(content, imageUrl)
        if (platform === 'instagram') result = await postToInstagram(content, imageUrl)
        if (platform === 'twitter')   result = await postToTwitter(content)

        console.log(`[PublishNow] ${platform}: SUCCESS`, result?.url)
        results.push({ platform, success: true, url: result?.url, hasImage: result?.hasImage })

        await query(
          `INSERT INTO scheduled_posts(platform, content, image_url, status, published_at)
           VALUES($1,$2,$3,'published',NOW())`,
          [platform, content, imageUrl]
        ).catch(() => {})

      } catch (e) {
        console.error(`[PublishNow] ${platform} FAILED:`, e.message)
        results.push({ platform, success: false, error: e.message })
      }
    }

    const anySuccess = results.some(r => r.success)
    res.json({
      success: anySuccess,
      results,
      summary: results.map(r => `${r.platform}: ${r.success ? 'YES' : 'NO'}`).join(' | ')
    })

  } catch (e) {
    console.error('[PublishNow] Fatal error:', e)
    res.status(500).json({ error: e.message })
  }
})

export default router
