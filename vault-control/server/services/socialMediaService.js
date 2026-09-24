import { fileURLToPath } from 'url'
import path from 'path'
import { execFile } from 'child_process'

// ── Facebook (direct Graph API, no MCP) ──

export async function postToFacebook(content, imageSource = null) {
  const token  = process.env.META_SYSTEM_USER_TOKEN
  const pageId = process.env.FACEBOOK_PAGE_ID

  if (!token || !pageId) {
    throw new Error('Facebook: META_SYSTEM_USER_TOKEN or FACEBOOK_PAGE_ID not set in .env')
  }

  const fetch = (await import('node-fetch')).default
  const { getPublicImageUrl } = await import('./imageHosting.js')

  try {
    if (imageSource) {
      console.log('[Facebook] Getting public URL for image...')
      const publicUrl = await getPublicImageUrl(imageSource, true)

      if (publicUrl) {
        console.log('[Facebook] Uploading photo to page...')

        const photoResp = await fetch(
          `https://graph.facebook.com/v19.0/${pageId}/photos`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: publicUrl,
              published: false,
              access_token: token
            })
          }
        )
        const photoData = await photoResp.json()
        console.log('[Facebook] Photo upload response:', JSON.stringify(photoData))

        if (photoData.id) {
          const postResp = await fetch(
            `https://graph.facebook.com/v19.0/${pageId}/feed`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: content,
                attached_media: [{ media_fbid: photoData.id }],
                access_token: token
              })
            }
          )
          const postData = await postResp.json()
          console.log('[Facebook] Post response:', JSON.stringify(postData))

          if (postData.id) {
            return {
              success: true,
              url: `https://www.facebook.com/${postData.id}`,
              platform: 'facebook',
              hasImage: true
            }
          }
          throw new Error('Facebook post failed: ' + JSON.stringify(postData))
        }

        console.warn('[Facebook] Photo upload failed, falling back to text+link post')
      }
    }

    console.log('[Facebook] Posting text only...')
    const textResp = await fetch(
      `https://graph.facebook.com/v19.0/${pageId}/feed`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, access_token: token })
      }
    )
    const textData = await textResp.json()
    if (textData.id) {
      return { success: true, url: `https://www.facebook.com/${textData.id}`, platform: 'facebook', hasImage: false }
    }
    throw new Error('Facebook text post failed: ' + JSON.stringify(textData))

  } catch (e) {
    console.error('[Facebook] postToFacebook error:', e)
    throw e
  }
}

// ── Instagram (direct Graph API, no MCP) ──

export async function postToInstagram(content, imageSource = null) {
  const token   = process.env.INSTAGRAM_ACCESS_TOKEN || process.env.META_SYSTEM_USER_TOKEN
  const igAccId = process.env.INSTAGRAM_ACCOUNT_ID

  if (!token || !igAccId) {
    throw new Error('Instagram: INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_ACCOUNT_ID not set')
  }
  if (!imageSource) {
    throw new Error('Instagram requires an image. Please provide an image.')
  }

  const fetch = (await import('node-fetch')).default
  const { getPublicImageUrl } = await import('./imageHosting.js')

  try {
    console.log('[Instagram] Getting public URL...')
    const publicUrl = await getPublicImageUrl(imageSource, true)

    if (!publicUrl) throw new Error('Could not get public URL for image')

    console.log('[Instagram] Creating media container...')

    const containerResp = await fetch(
      `https://graph.facebook.com/v19.0/${igAccId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: publicUrl,
          caption: content,
          access_token: token
        })
      }
    )
    const containerData = await containerResp.json()
    console.log('[Instagram] Container response:', JSON.stringify(containerData))

    if (!containerData.id) {
      throw new Error('Instagram container creation failed: ' + JSON.stringify(containerData))
    }

    // Meta has to download the image before the container is publishable.
    // A fixed 3s sleep raced that download and produced random failures;
    // poll status_code instead (up to 60s).
    let ready = false
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 3000))
      const statusResp = await fetch(
        `https://graph.facebook.com/v19.0/${containerData.id}` +
        `?fields=status_code,status&access_token=${encodeURIComponent(token)}`
      )
      const status = await statusResp.json()
      if (status.status_code === 'FINISHED') { ready = true; break }
      if (status.status_code === 'ERROR') {
        throw new Error('Instagram container ERROR: ' + JSON.stringify(status))
      }
      console.log(`[Instagram] Container ${status.status_code || 'PENDING'} (${i + 1}/20)...`)
    }
    if (!ready) throw new Error('Instagram container never reached FINISHED (60s timeout)')

    console.log('[Instagram] Publishing...')
    let publishData = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      const publishResp = await fetch(
        `https://graph.facebook.com/v19.0/${igAccId}/media_publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            creation_id: containerData.id,
            access_token: token
          })
        }
      )
      publishData = await publishResp.json()
      console.log('[Instagram] Publish response:', JSON.stringify(publishData))
      if (publishData.id) break
      if (attempt < 3) await new Promise(r => setTimeout(r, 5000 * attempt))
    }

    if (publishData?.id) {
      // media_publish returns a media id, not a shortcode — ask for the permalink.
      let url = `https://www.instagram.com/p/${publishData.id}`
      try {
        const permaResp = await fetch(
          `https://graph.facebook.com/v19.0/${publishData.id}` +
          `?fields=permalink&access_token=${encodeURIComponent(token)}`
        )
        const perma = await permaResp.json()
        if (perma.permalink) url = perma.permalink
      } catch { /* permalink is cosmetic */ }

      return { success: true, url, platform: 'instagram', hasImage: true }
    }
    throw new Error('Instagram publish failed: ' + JSON.stringify(publishData))

  } catch (e) {
    console.error('[Instagram] error:', e)
    throw e
  }
}

// ── LinkedIn (via API MCP server) ──

export async function postToLinkedIn(content, imageSource = null) {
  const { getPublicImageUrl } = await import('./imageHosting.js')
  const publicUrl = imageSource ? await getPublicImageUrl(imageSource, true) : null

  const { callMcpTool } = await import('./mcpClient.js')
  const result = await callMcpTool('linkedin', 'post_to_linkedin', {
    text: content,
    ...(publicUrl ? { image_url: publicUrl } : {}),
  })

  if (!result.success) {
    const errMsg = result.error?.message || JSON.stringify(result.error)
    console.warn('[LinkedIn] MCP error:', errMsg)
    return { platform: 'linkedin', id: 'skipped', url: null, skipped: true, success: false, message: errMsg }
  }

  return {
    platform: 'linkedin',
    id: result.post_id,
    post_url: result.post_url,
    url: result.post_url,
    success: true,
    hasImage: !!publicUrl,
  }
}

// ── Twitter / X posting (placeholder) ──

export async function postToTwitter(text, imageUrl = null) {
  return {
    platform: 'twitter',
    id: 'skipped',
    post_url: null,
    skipped: true,
    message: 'Twitter posting not configured — skipped',
  }
}

// ── Unified publish dispatcher ──
//
// Every code path that puts something on a social network goes through here
// (dueScheduler, HITL approval, /api/posts approve, chatbot), so this is where
// the project's hard rules live:
//   • DRY_RUN=true          → nothing leaves the building, a simulated result comes back
//   • ≤ N posts/day/platform (MAX_POSTS_PER_DAY_PER_PLATFORM, default 5)
//   • ≥ 60 s between posts on the same platform (MIN_POST_SPACING_SECONDS)
// The limits fail CLOSED: if the DB cannot be asked, the post is refused.

const MAX_POSTS_PER_DAY_PER_PLATFORM = Math.max(1, parseInt(process.env.MAX_POSTS_PER_DAY_PER_PLATFORM || '5', 10) || 5)
const MIN_POST_SPACING_MS = Math.max(0, parseInt(process.env.MIN_POST_SPACING_SECONDS || '60', 10) || 60) * 1000
const lastPublishAt = new Map()   // platform → epoch ms, in-process backstop for the DB check

export class PublishLimitError extends Error {
  constructor(message, code) { super(message); this.name = 'PublishLimitError'; this.code = code }
}

export async function assertPublishAllowed(platform) {
  const { query } = await import('../database/connection.js')
  const r = await query(
    `SELECT COUNT(*)::int AS n, MAX(published_at) AS last
       FROM scheduled_posts
      WHERE platform = $1 AND status = 'published'
        AND published_at >= date_trunc('day', NOW())`,
    [platform]
  )
  const row = r.rows[0] || { n: 0, last: null }
  if (row.n >= MAX_POSTS_PER_DAY_PER_PLATFORM) {
    throw new PublishLimitError(
      `Daily limit reached for ${platform}: ${row.n}/${MAX_POSTS_PER_DAY_PER_PLATFORM} posts already published today`,
      'daily_limit'
    )
  }
  const lastDb  = row.last ? new Date(row.last).getTime() : 0
  const lastMem = lastPublishAt.get(platform) || 0
  const since   = Date.now() - Math.max(lastDb, lastMem)
  if (since < MIN_POST_SPACING_MS) {
    throw new PublishLimitError(
      `Too soon for ${platform}: last post ${Math.round(since / 1000)}s ago, minimum spacing is ${MIN_POST_SPACING_MS / 1000}s`,
      'spacing'
    )
  }
}

export async function publishPost(post) {
  const platform = post.platform?.toLowerCase()
  const text = post.content
  const imageUrl = post.image_url || null

  if (!['facebook', 'linkedin', 'instagram', 'twitter'].includes(platform)) {
    throw new Error(`Unknown platform: ${platform}. Supported: facebook, linkedin, instagram, twitter`)
  }

  if (process.env.DRY_RUN === 'true') {
    console.log(`[DRY RUN] Would publish to ${platform}:`, String(text || '').substring(0, 80))
    return { success: true, dry_run: true, id: 'dry-run', url: null, post_url: null,
             message: `DRY_RUN=true — ${platform} post simulated, nothing published` }
  }

  await assertPublishAllowed(platform)
  lastPublishAt.set(platform, Date.now())

  if (platform === 'facebook') return postToFacebook(text, imageUrl)
  if (platform === 'linkedin') return postToLinkedIn(text, imageUrl)
  if (platform === 'instagram') return postToInstagram(text, imageUrl)
  if (platform === 'twitter') return postToTwitter(text, imageUrl)
  throw new Error(`Unknown platform: ${platform}. Supported: facebook, linkedin, instagram, twitter`)
}

// ── Unified test ──

export async function testAllPlatforms() {
  const testImage = 'https://picsum.photos/1080/1080'
  const testText = 'Test post from AI Employee ' + new Date().toISOString()

  const results = {}

  console.log('=== Testing Facebook ===')
  try {
    const fb = await postToFacebook(testText, testImage)
    console.log('FB result:', JSON.stringify(fb, null, 2))
    results.facebook = fb
  } catch (e) {
    console.log('FB error:', e.message)
    results.facebook = { error: e.message }
  }

  console.log('=== Testing LinkedIn ===')
  try {
    const li = await postToLinkedIn(testText, testImage)
    console.log('LI result:', JSON.stringify(li, null, 2))
    results.linkedin = li
  } catch (e) {
    console.log('LI error:', e.message)
    results.linkedin = { error: e.message }
  }

  console.log('=== Testing Instagram ===')
  try {
    const ig = await postToInstagram(testText, testImage)
    console.log('IG result:', JSON.stringify(ig, null, 2))
    results.instagram = ig
  } catch (e) {
    console.log('IG error:', e.message)
    results.instagram = { error: e.message }
  }

  return results
}

// Run directly: node services/socialMediaService.js
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  testAllPlatforms().then(r => {
    console.log('\n=== FINAL RESULTS ===')
    console.log(JSON.stringify(r, null, 2))
    process.exit(0)
  }).catch(e => {
    console.error('Fatal:', e)
    process.exit(1)
  })
}
