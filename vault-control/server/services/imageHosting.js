import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// PUBLIC_DIR: always relative to vault-control/ root
const PUBLIC_DIR = path.resolve(__dirname, '../../public/uploads')
fs.mkdirSync(PUBLIC_DIR, { recursive: true })

// Our own /uploads and /generated paths are served straight off this process's
// disk, but a stored URL can name a DIFFERENT host: drafts written before
// imageGenerator switched to SELF_BASE_URL carry
// https://api.digitalfte.online/generated/<file>, and that box has never had
// those files — so publishing an older draft died on
// "Download failed: 404 https://api.digitalfte.online/generated/...".
// Map any such URL back to the local file. Same bytes, no round-trip, and no
// dependency on which host happened to write the draft.
const LOCAL_SERVE_DIRS = {
  '/uploads/':   path.resolve(__dirname, '../../public/uploads'),
  '/generated/': path.resolve(__dirname, '../../public/generated'),
}

function resolveLocalFile(source) {
  if (typeof source !== 'string' || !/^https?:\/\//.test(source)) return null
  let pathname
  try {
    pathname = new URL(source).pathname
  } catch {
    return null
  }
  for (const [prefix, dir] of Object.entries(LOCAL_SERVE_DIRS)) {
    if (!pathname.startsWith(prefix)) continue
    // basename only: a stored URL is untrusted input and must not be able to
    // walk out of the directory it claims to be in.
    const file = path.join(dir, path.basename(decodeURIComponent(pathname)))
    if (fs.existsSync(file)) return file
  }
  return null
}

function getServerBaseUrl() {
  return (
    process.env.SERVER_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    `http://localhost:${process.env.PORT || 3000}`
  )
}

export async function hostImageLocally(source) {
  try {
    const filename = `img_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.jpg`
    const destPath = path.join(PUBLIC_DIR, filename)

    if (Buffer.isBuffer(source)) {
      fs.writeFileSync(destPath, source)
    } else if (typeof source === 'string' && source.startsWith('data:')) {
      const base64Data = source.replace(/^data:image\/\w+;base64,/, '')
      fs.writeFileSync(destPath, Buffer.from(base64Data, 'base64'))
    } else if (typeof source === 'string' && (source.startsWith('http://') || source.startsWith('https://'))) {
      const local = resolveLocalFile(source)
      if (local) {
        fs.copyFileSync(local, destPath)
      } else {
        const buffer = await downloadImageBuffer(source)
        fs.writeFileSync(destPath, buffer)
      }
    } else if (typeof source === 'string' && fs.existsSync(source)) {
      fs.copyFileSync(source, destPath)
    } else {
      throw new Error('Unknown source type: ' + typeof source)
    }

    const url = `${getServerBaseUrl()}/uploads/${filename}`
    console.log('[ImageHost] Saved locally:', url)
    return url
  } catch (e) {
    console.error('[ImageHost] Local save failed:', e.message)
    throw e
  }
}

export async function downloadImageBuffer(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const resp = await fetch(url, { signal: AbortSignal.timeout(30000) })
    if (!resp.ok) throw new Error(`Download failed: ${resp.status} ${url}`)
    const buffer = Buffer.from(await resp.arrayBuffer())
    if (buffer.length > 0) return buffer
    console.warn(`[ImageHost] Empty response (attempt ${attempt}/${retries}), retrying...`)
    if (attempt < retries) await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error(`Download failed: empty response after ${retries} retries`)
}

export async function uploadToCloudinary(imageBuffer) {
  if (!process.env.CLOUDINARY_URL && !process.env.CLOUDINARY_CLOUD_NAME) {
    throw new Error('Cloudinary not configured')
  }
  try {
    const cloudinary = require('cloudinary').v2
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'ai-employee', resource_type: 'image' },
        (error, result) => {
          if (error) reject(error)
          else resolve(result.secure_url)
        }
      )
      stream.end(imageBuffer)
    })
  } catch (e) {
    throw new Error('Cloudinary upload failed: ' + e.message)
  }
}

/**
 * getPublicImageUrl — 3-level fallback chain, every result verified reachable.
 * 1. Cloudinary   (durable CDN, no tunnel required — the default)
 * 2. SERVER_PUBLIC_URL / ngrok, only if the resulting URL actually resolves
 * 3. The original source URL, only if it actually resolves
 * Returns null when nothing works, so the caller can post text-only.
 */
export async function getPublicImageUrl(source, needsPublicUrl = false) {

  // If platform NEEDS a real image file (Facebook/Instagram/LinkedIn),
  // ALWAYS download and re-host — raw Pollinations URLs won't work.
  if (needsPublicUrl) {
    // But skip re-hosting for URLs that are ALREADY real image hosts
    if (
      typeof source === 'string' &&
      source.startsWith('https://res.cloudinary.com/')
    ) {
      console.log('[ImageHost] Already hosted on Cloudinary, using as-is:', source.substring(0, 70))
      return source
    }
    console.log('[ImageHost] needsPublicUrl=true — bypassing shortcut, will re-host')
  }

  // Already a working public URL — use directly (skip when needsPublicUrl)
  if (
    !needsPublicUrl &&
    typeof source === 'string' &&
    source.startsWith('http') &&
    !source.includes('localhost') &&
    !source.includes('127.0.0.1')
  ) {
    console.log('[ImageHost] Using existing URL:', source.substring(0, 70))
    return source
  }

  // Get image buffer once — reused by all methods
  let imageBuffer = null

  const getBuffer = async () => {
    if (imageBuffer) return imageBuffer
    try {
      if (Buffer.isBuffer(source)) {
        imageBuffer = source
      } else if (typeof source === 'string' && source.startsWith('data:')) {
        imageBuffer = Buffer.from(
          source.replace(/^data:image\/\w+;base64,/, ''), 'base64'
        )
      } else if (typeof source === 'string') {
        // `fs` is imported at the top of this module; the dynamic import that
        // used to be here shadowed it for no reason.
        const local = resolveLocalFile(source)
        if (local) {
          imageBuffer = fs.readFileSync(local)
        } else if (fs.existsSync(source)) {
          imageBuffer = fs.readFileSync(source)
        } else if (source.startsWith('http')) {
          imageBuffer = await downloadImageBuffer(source, 3)
        }
      }
    } catch (e) {
      console.error('[ImageHost] Buffer error:', e.message)
    }
    return imageBuffer
  }

  const errors = []

  // Verify a URL is actually fetchable from the public internet before we hand
  // it to Meta/LinkedIn. Returning an unreachable URL is what made posting
  // "work sometimes": the dead ngrok tunnel never threw, so Cloudinary was
  // never reached and the platform silently failed to fetch the image.
  const isReachable = async (url) => {
    for (const method of ['HEAD', 'GET']) {
      try {
        const resp = await fetch(url, {
          method,
          redirect: 'follow',
          signal: AbortSignal.timeout(8000)
        })
        if (resp.ok && (resp.headers.get('content-type') || '').startsWith('image/')) {
          return true
        }
      } catch { /* try next method */ }
    }
    return false
  }

  // ══════════════════════════════════════════════════
  // FALLBACK 1 — Cloudinary (durable, no tunnel required)
  // ══════════════════════════════════════════════════
  if (process.env.CLOUDINARY_URL || process.env.CLOUDINARY_CLOUD_NAME) {
    try {
      console.log('[ImageHost] Trying #1 Cloudinary...')
      const buf = await getBuffer()
      if (!buf) throw new Error('Could not get image buffer')

      const cloudinary = require('cloudinary').v2

      const url = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder:        'ai-employee',
            resource_type: 'image',
            format:        'jpg',
            quality:       'auto:good',
            transformation: [{ width: 1200, crop: 'limit' }]
          },
          (error, result) => {
            if (error) reject(error)
            else resolve(result.secure_url)
          }
        )
        stream.end(buf)
      })

      console.log('[ImageHost] #1 Cloudinary SUCCESS:', url.substring(0, 80))
      return url

    } catch (e) {
      const msg = `#1 Cloudinary failed: ${e.message}`
      errors.push(msg)
      console.warn('[ImageHost]', msg)
    }
  } else {
    console.log('[ImageHost] #1 Cloudinary skipped — CLOUDINARY_URL not set')
  }

  // ══════════════════════════════════════════════════
  // FALLBACK 2 — SERVER_PUBLIC_URL / ngrok tunnel (verified)
  // ══════════════════════════════════════════════════
  const serverUrl  = (process.env.SERVER_PUBLIC_URL || '').replace(/\/$/, '')
  const isLocalUrl = serverUrl.includes('localhost') || serverUrl.includes('127.0.0.1')

  if (serverUrl && !isLocalUrl) {
    try {
      console.log('[ImageHost] Trying #2 SERVER_PUBLIC_URL...')
      const buf = await getBuffer()
      if (!buf) throw new Error('Could not get image buffer')

      // PUBLIC_DIR is module-anchored; the old cwd-relative resolve wrote files
      // outside the directory Express actually serves whenever cwd != repo root.
      const filename = `img_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.jpg`
      fs.writeFileSync(path.join(PUBLIC_DIR, filename), buf)

      const url = `${serverUrl}/uploads/${filename}`
      if (!(await isReachable(url))) {
        throw new Error(`URL not publicly reachable: ${url}`)
      }

      console.log('[ImageHost] #2 SERVER_PUBLIC_URL SUCCESS:', url.substring(0, 80))
      return url

    } catch (e) {
      const msg = `#2 SERVER_PUBLIC_URL failed: ${e.message}`
      errors.push(msg)
      console.warn('[ImageHost]', msg)
    }
  } else {
    console.log('[ImageHost] #2 SERVER_PUBLIC_URL skipped —', serverUrl ? 'URL is local' : 'not set')
  }

  // ══════════════════════════════════════════════════
  // FALLBACK 3 — the original source, if it is already reachable
  // ══════════════════════════════════════════════════
  if (typeof source === 'string' && source.startsWith('http') && !source.includes('localhost')) {
    if (await isReachable(source)) {
      console.log('[ImageHost] #3 Using original source URL (verified reachable)')
      return source
    }
    errors.push('#3 original source URL not reachable')
  }

  // ══════════════════════════════════════════════════
  // ALL FAILED — Return null (caller posts text-only)
  // ══════════════════════════════════════════════════
  console.error('[ImageHost] ALL methods failed:')
  errors.forEach((e, i) => console.error(`  ${i + 1}. ${e}`))
  console.warn('[ImageHost] Returning null — post will be text-only')
  return null
}
