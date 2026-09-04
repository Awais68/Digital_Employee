import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { query } from '../database/connection.js'
import { reschedule } from '../services/dueScheduler.js'
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

// The image generator returns an absolute URL on this server's own origin
// (localhost). The browser usually reaches us through a different host — the
// Vite dev proxy or the deployed domain — so hand it a same-origin relative
// path instead of a hostname that only resolves inside this process.
function toClientImageUrl(url) {
  if (typeof url !== 'string') return url
  const m = url.match(/^https?:\/\/[^/]+(\/(?:generated|uploads)\/.+)$/)
  return m ? m[1] : url
}

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
})

const router = express.Router()

// ── Post quality rules ────────────────────────────────────────────────────
//
// Previous behaviour forced every post through one template: 50+ words on every
// platform, mandatory hashtags, and a hardcoded "Shoutout to @X, @Y, @Z for
// their incredible work in this space!" sentence appended to all of them. That
// sentence alone is the strongest AI/spam tell in the whole pipeline, and the
// uniform 50-word floor padded short-form platforms with filler. Both suppress
// reach. Rules below are per-platform, and mentions are opt-in.

// Mentions are opt-in via env (comma separated). Empty by default: a forced
// mention block on unrelated posts reads as engagement bait.
const MANDATORY_MENTIONS = (process.env.MANDATORY_MENTIONS || '')
  .split(',')
  .map(m => m.trim())
  .filter(Boolean)

const STRICT_RULES = {
  requireImage: true,
  requireHashtags: true,
  requireEmojis: false,
  requireMentions: MANDATORY_MENTIONS.length > 0,
  minHashtags: 1,
  maxHashtags: 5,
  blockWithoutImage: true,
  mandatoryMentions: MANDATORY_MENTIONS,
  spamKeywords: [
    'buy now', 'click here', 'limited time', 'act fast',
    '100% free', 'act now', 'free money'
  ],
  // Phrases that make a post read as machine-written. Warnings, not hard blocks,
  // so a human can still ship a post that legitimately contains one.
  aiTells: [
    "in today's fast-paced world", 'in today\u2019s fast-paced world',
    'in the ever-evolving', 'game-changer', 'game changer',
    'unlock the power', 'unlocking the power', 'harness the power',
    'delve into', 'dive deep into', 'revolutionize the way',
    'take it to the next level', 'the future is here',
    'excited to announce that i am', 'thrilled to share that',
    'buckle up', 'let that sink in', "it's not just", 'is not just about',
    'stay tuned for more', 'the possibilities are endless',
    'for their incredible work in this space'
  ],
  platforms: {
    linkedin:  { minWords: 40, maxWords: 500,  minHashtags: 3, maxHashtags: 5  },
    facebook:  { minWords: 20, maxWords: 500,  minHashtags: 2, maxHashtags: 5  },
    instagram: { minWords: 15, maxWords: 2200, minHashtags: 5, maxHashtags: 15 },
    twitter:   { minWords: 5,  maxWords: 50,   minHashtags: 1, maxHashtags: 3, disabled: true },
  }
}

// Varied, human-sounding ways to work a mention in. Rotating the phrasing keeps
// a repeated mention from turning into a recognisable signature across posts.
const MENTION_TEMPLATES = [
  (names) => `Credit where it's due — ${names}.`,
  (names) => `${names}, this one's in your lane.`,
  (names) => `Curious what ${names} make of this.`,
  (names) => `Been learning a lot from ${names} on this.`,
  (names) => `${names} — would value your take.`,
]

function joinNames(list) {
  const tagged = list.map(m => `@${m}`)
  if (tagged.length === 1) return tagged[0]
  return tagged.slice(0, -1).join(', ') + ' and ' + tagged[tagged.length - 1]
}

// Insert missing @mentions above the hashtag block, in varied phrasing.
function insertMentionsInline(content, mentions) {
  if (!mentions || !mentions.length) return content
  const missing = mentions.filter(m => !content.toLowerCase().includes(m.toLowerCase()))
  if (!missing.length) return content

  const hashtagIndex = content.search(/#\w/)
  const insertionPoint = hashtagIndex > 50 ? hashtagIndex : content.length

  const template = MENTION_TEMPLATES[Math.floor(Math.random() * MENTION_TEMPLATES.length)]
  const sentence = `\n\n${template(joinNames(missing))}`

  return content.slice(0, insertionPoint).trimEnd() +
         sentence + '\n\n' +
         content.slice(insertionPoint).trimStart()
}

// Returns hard errors that block publishing.
function validatePostStrict(content, platforms, hasImage, allowNoImage = false) {
  const errors = []

  // `allowNoImage` is set when the rotation policy has chosen a text-only slot.
  // A hard "every post must have an image" is itself a detectable pattern.
  if (STRICT_RULES.blockWithoutImage && !hasImage && !allowNoImage) {
    errors.push('BLOCKED: Image is MANDATORY - every post must have an image')
  }

  if (!content || content.trim().length === 0) {
    errors.push('Content cannot be empty')
    return errors
  }

  const words = content.split(/\s+/).filter(w => w.length > 0)
  const list  = Array.isArray(platforms) ? platforms : [platforms].filter(Boolean)

  // Per-platform only. The old global 50-word floor forced filler onto
  // Instagram and Twitter, where short copy actually performs better.
  list.forEach(platformId => {
    const rules = STRICT_RULES.platforms[platformId]
    if (!rules) return
    if (words.length < rules.minWords) {
      errors.push(`${platformId}: Too few words (${words.length}/${rules.minWords} minimum)`)
    }
    if (words.length > rules.maxWords) {
      errors.push(`${platformId}: Too many words (${words.length}/${rules.maxWords} maximum)`)
    }
    // Hashtag overflow is NOT an error. Callers run clampForPlatforms() first,
    // so anything still over the limit is a bug on our side — blocking the
    // publish made the human fix a count the machine can trim itself, which is
    // how "LinkedIn: Too many hashtags (8/5 maximum)" ended up in front of the
    // owner instead of five clean hashtags going out.
  })

  if (STRICT_RULES.requireHashtags) {
    const hashtags = content.match(/#\w+/g) || []
    if (hashtags.length < 1) {
      errors.push('No hashtags found - add at least 1 (e.g. #AI #Automation)')
    }
  }

  const lowerContent = content.toLowerCase()
  STRICT_RULES.spamKeywords.forEach(spam => {
    if (lowerContent.includes(spam.toLowerCase())) {
      errors.push(`Spam keyword detected: "${spam}"`)
    }
  })

  return errors
}

// Non-blocking quality signals surfaced to the UI so a human can tighten copy
// before it ships.
function reviewPostQuality(content, platforms) {
  const warnings = []
  if (!content) return warnings
  const lower = content.toLowerCase()

  STRICT_RULES.aiTells.forEach(tell => {
    if (lower.includes(tell)) warnings.push(`Reads as AI-written: "${tell}"`)
  })

  const emojis = (content.match(/\p{Extended_Pictographic}/gu) || []).length
  if (emojis > 8) warnings.push(`${emojis} emojis — heavy emoji use suppresses reach`)

  const tags = content.match(/#\w+/g) || []
  const list = Array.isArray(platforms) ? platforms : [platforms].filter(Boolean)
  list.forEach(id => {
    const rules = STRICT_RULES.platforms[id]
    if (rules && tags.length < rules.minHashtags) {
      warnings.push(`${id}: ${tags.length} hashtags — ${rules.minHashtags}+ reaches further`)
    }
  })

  // A hook in the first line is what decides whether the post is expanded.
  const firstLine = content.split('\n')[0].trim()
  if (firstLine.length > 140) {
    warnings.push('First line is long — platforms truncate it, so put the hook up front')
  }
  if (!/[?!]/.test(content)) {
    warnings.push('No question or call to action — replies drive distribution')
  }

  return warnings
}

// Topics = the built-in list plus whatever the owner has added from the UI.
// Custom ones live in admin_settings so they survive a deploy.
const CUSTOM_TOPICS_KEY = 'custom_post_topics'

async function loadCustomTopics() {
  try {
    const r = await query(`SELECT value FROM admin_settings WHERE key=$1`, [CUSTOM_TOPICS_KEY])
    const parsed = JSON.parse(r.rows[0]?.value || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

router.get('/topics', async (req, res) => {
  const custom = await loadCustomTopics()
  res.json({ topics: [...custom, ...DEFAULT_TOPICS], custom, defaults: DEFAULT_TOPICS })
})

router.post('/topics', requireAdmin, async (req, res) => {
  try {
    const topic = String(req.body.topic || '').trim()
    if (!topic) return res.status(400).json({ error: 'Topic is required' })

    const custom = await loadCustomTopics()
    const exists = [...custom, ...DEFAULT_TOPICS].some(t => t.toLowerCase() === topic.toLowerCase())
    if (exists) return res.json({ success: true, topics: [...custom, ...DEFAULT_TOPICS], duplicate: true })

    const next = [topic, ...custom].slice(0, 100)
    await query(
      `INSERT INTO admin_settings(key, value, last_updated) VALUES($1,$2,NOW())
       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, last_updated=NOW()`,
      [CUSTOM_TOPICS_KEY, JSON.stringify(next)]
    )
    res.json({ success: true, topics: [...next, ...DEFAULT_TOPICS], custom: next })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.delete('/topics/:topic', requireAdmin, async (req, res) => {
  try {
    const custom = await loadCustomTopics()
    const next = custom.filter(t => t.toLowerCase() !== String(req.params.topic).toLowerCase())
    await query(
      `INSERT INTO admin_settings(key, value, last_updated) VALUES($1,$2,NOW())
       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, last_updated=NOW()`,
      [CUSTOM_TOPICS_KEY, JSON.stringify(next)]
    )
    res.json({ success: true, custom: next, topics: [...next, ...DEFAULT_TOPICS] })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /generate-image - Auto-generate image for post
router.post('/generate-image', requireAdmin, async (req, res) => {
  try {
    const { topic, style, content } = req.body
    
    if (!topic) {
      return res.status(400).json({ error: 'Topic is required for image generation' })
    }
    
    console.log('[ImageGen] Generating image for topic:', topic)
    
    const { generatePostImage } = await import('../services/imageGenerator.js')
    const imageUrl = await generatePostImage(topic, style || 'professional', '4:5', content || '')
    
    console.log('[ImageGen] Generated image URL:', imageUrl)

    res.json({ success: true, imageUrl: toClientImageUrl(imageUrl) })
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
      // status='scheduled' — re-arm the exact-time publish timer
      reschedule('post-scheduled').catch(() => {})
    }

    const grouped = {}
    for (const post of result.posts) {
      if (!grouped[post.platform]) grouped[post.platform] = []
      grouped[post.platform].push({ ...post, imageUrl: toClientImageUrl(post.imageUrl) })
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

    if (publishResult?.success) {
      const postUrl = publishResult.url || publishResult.post_url || ''
      await query(
        `UPDATE scheduled_posts SET status='published', published_at=NOW(), post_url=$1 WHERE id=$2`,
        [postUrl, post.id]
      )

      createNotification('success', 'Post Published!', `${post.platform} post published successfully`, { source: 'post', id: post.id, url: publishResult.url })

      if (global.broadcast) {
        global.broadcast({
          type: 'notification',
          notification: {
            id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            category: 'success',
            title: 'Post Published!',
            message: `${post.platform} post published successfully`,
            read: false,
            timestamp: new Date().toISOString(),
            data: { url: publishResult.url }
          }
        })
      }

      res.json({ success: true, published: true, url: postUrl, platform: post.platform })
    } else {
      const errMsg = publishResult?.message || publishResult?.error || 'Publish failed'
      console.error('[Approval] Publish failed:', errMsg)
      await query(`UPDATE scheduled_posts SET status='failed' WHERE id=$1`, [post.id]).catch(() => {})
      createNotification('error', 'Post Failed', `Failed to publish on ${post.platform}: ${errMsg}`, { source: 'post', id: post.id })
      res.status(500).json({ success: false, published: false, error: errMsg, platform: post.platform })
    }
  } catch (e) {
    console.error('[Approval] Publish error:', e)
    await query(`UPDATE scheduled_posts SET status='failed' WHERE id=$1`, [req.params.id]).catch(() => {})
    // `req.params.id` is a post id, not a platform — the old copy read
    // "Failed to publish on 96" and dropped e.message, so the notification told
    // the user nothing about what actually broke.
    createNotification('error', 'Post Failed', `Post #${req.params.id} failed to publish: ${e.message}`, { source: 'post', id: req.params.id })
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

    const { clampForPlatforms } = await import('../services/postPolicy.js')
    const finalContent = clampForPlatforms(content, platforms)

    const created = []
    const now = new Date()
    const scheduledFor = scheduleTime ? new Date(scheduleTime) : new Date(now.getTime() + 86400000)
    // A scheduled post is published by the due scheduler at its time and needs
    // no second approval — the owner approves it once, when it is composed.
    const status = publishNow ? 'pending' : (scheduleTime ? 'scheduled' : 'pending_approval')

    for (const platform of platforms) {
      const result = await query(`
        INSERT INTO scheduled_posts
          (topic, platform, content, image_url, scheduled_for, status, hashtags, mentions, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
        RETURNING id
      `, [
        topic || 'Manual post',
        platform.toLowerCase(),
        finalContent,
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

    // Mentions are opt-in (MANDATORY_MENTIONS env). No-op when unset.
    if (content && STRICT_RULES.mandatoryMentions.length) {
      const before = content
      content = insertMentionsInline(content, STRICT_RULES.mandatoryMentions)
      if (content !== before) console.log('[PublishNow] Added missing mentions inline')
    }

    // Trim hashtags to the strictest platform in the set before anything else
    // looks at the caption.
    const { clampForPlatforms } = await import('../services/postPolicy.js')
    const clamped = clampForPlatforms(content, platformList)
    if (clamped !== content) {
      console.log('[PublishNow] Hashtags clamped to platform limit')
      content = clamped
    }

    const qualityWarnings = reviewPostQuality(content, platformList)
    if (qualityWarnings.length) {
      console.log('[PublishNow] Quality warnings:', qualityWarnings)
    }

    // STRICT VALIDATION
    // An explicit `textOnly` from the caller, or an image-free post that the
    // rotation says is due, publishes without an image.
    const allowNoImage = req.body.textOnly === 'true' || req.body.textOnly === true
    const validationErrors = validatePostStrict(content, platformList, !!imageBuffer, allowNoImage)
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

      // Instagram cannot post without an image; say so plainly rather than
      // surfacing a raw throw from the Graph API layer.
      if (platform === 'instagram' && !imageUrl) {
        results.push({
          platform,
          success: false,
          error: 'Instagram requires a publicly reachable image; image hosting returned nothing.'
        })
        continue
      }

      try {
        let result
        if (platform === 'facebook')  result = await postToFacebook(content, imageUrl)
        if (platform === 'linkedin')  result = await postToLinkedIn(content, imageUrl)
        if (platform === 'instagram') result = await postToInstagram(content, imageUrl)
        if (platform === 'twitter')   result = await postToTwitter(content)

        if (result?.success) {
          console.log(`[PublishNow] ${platform}: SUCCESS`, result?.url)
          results.push({ platform, success: true, url: result?.url, hasImage: result?.hasImage })
          await query(
            `INSERT INTO scheduled_posts(platform, content, image_url, status, published_at)
             VALUES($1,$2,$3,'published',NOW())`,
            [platform, content, imageUrl]
          ).catch(() => {})
        } else {
          console.warn(`[PublishNow] ${platform}: FAILED`, result?.message || result?.error)
          results.push({ platform, success: false, error: result?.message || 'Unknown error' })
        }

      } catch (e) {
        console.error(`[PublishNow] ${platform} FAILED:`, e.message)
        results.push({ platform, success: false, error: e.message })
      }
    }

    const anySuccess = results.some(r => r.success)
    res.json({
      success: anySuccess,
      results,
      qualityWarnings,
      summary: results.map(r => `${r.platform}: ${r.success ? 'YES' : 'NO'}`).join(' | ')
    })

  } catch (e) {
    console.error('[PublishNow] Fatal error:', e)
    res.status(500).json({ error: e.message })
  }
})

export default router
