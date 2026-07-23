import { fileURLToPath } from 'url'
import path from 'path'

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

    await new Promise(r => setTimeout(r, 3000))

    console.log('[Instagram] Publishing...')
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
    const publishData = await publishResp.json()
    console.log('[Instagram] Publish response:', JSON.stringify(publishData))

    if (publishData.id) {
      return {
        success: true,
        url: `https://www.instagram.com/p/${publishData.id}`,
        platform: 'instagram',
        hasImage: true
      }
    }
    throw new Error('Instagram publish failed: ' + JSON.stringify(publishData))

  } catch (e) {
    console.error('[Instagram] error:', e)
    throw e
  }
}

// ── LinkedIn (via MCP server) ──

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
    console.warn('[LinkedIn] Falling back — returning skipped')
    return {
      platform: 'linkedin',
      id: 'skipped',
      url: null,
      skipped: true,
      success: false,
      message: `LinkedIn MCP error: ${errMsg}`,
    }
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

export async function publishPost(post) {
  const platform = post.platform?.toLowerCase()
  const text = post.content
  const imageUrl = post.image_url || null

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
