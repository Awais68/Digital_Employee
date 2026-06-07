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
      const buffer = await downloadImageBuffer(source)
      fs.writeFileSync(destPath, buffer)
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
 * getPublicImageUrl — 2-level fallback chain
 * 1. Ngrok/Server URL (fastest, local)
 * 2. Cloudinary (best quality, production)
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
        const fs = await import('fs')
        if (fs.default.existsSync(source)) {
          imageBuffer = fs.default.readFileSync(source)
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

  // ══════════════════════════════════════════════════
  // FALLBACK 1 — Ngrok / SERVER_PUBLIC_URL
  // ══════════════════════════════════════════════════
  const serverUrl = process.env.SERVER_PUBLIC_URL || ''
  const isLocalUrl = serverUrl.includes('localhost') || serverUrl.includes('127.0.0.1')

  if (serverUrl && !isLocalUrl) {
    try {
      console.log('[ImageHost] Trying #1 Ngrok/Server...')
      const buf = await getBuffer()
      if (!buf) throw new Error('Could not get image buffer')

      const crypto   = await import('crypto')
      const fs       = await import('fs')
      const path     = await import('path')

      const PUBLIC_DIR = path.default.resolve('vault-control/public/uploads')
      fs.default.mkdirSync(PUBLIC_DIR, { recursive: true })

      const filename = `img_${Date.now()}_${crypto.default.randomBytes(4).toString('hex')}.jpg`
      const destPath = path.default.join(PUBLIC_DIR, filename)
      fs.default.writeFileSync(destPath, buf)

      const url = `${serverUrl.replace(/\/$/, '')}/uploads/${filename}`
      console.log('[ImageHost] #1 Ngrok SUCCESS:', url.substring(0, 80))
      return url

    } catch (e) {
      const msg = `#1 Ngrok failed: ${e.message}`
      errors.push(msg)
      console.warn('[ImageHost]', msg)
    }
  } else {
    console.log('[ImageHost] #1 Ngrok skipped —', serverUrl ? 'URL is localhost' : 'SERVER_PUBLIC_URL not set')
  }

  // ══════════════════════════════════════════════════
  // FALLBACK 2 — Cloudinary
  // ══════════════════════════════════════════════════
  if (process.env.CLOUDINARY_URL || process.env.CLOUDINARY_CLOUD_NAME) {
    try {
      console.log('[ImageHost] Trying #2 Cloudinary...')
      const buf = await getBuffer()
      if (!buf) throw new Error('Could not get image buffer')

      const { createRequire } = await import('module')
      const require = createRequire(import.meta.url)
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

      console.log('[ImageHost] #2 Cloudinary SUCCESS:', url.substring(0, 80))
      return url

    } catch (e) {
      const msg = `#2 Cloudinary failed: ${e.message}`
      errors.push(msg)
      console.warn('[ImageHost]', msg)
    }
  } else {
    console.log('[ImageHost] #2 Cloudinary skipped — CLOUDINARY_URL not set')
  }

  // ══════════════════════════════════════════════════
  // ALL FAILED — Return null (caller posts text-only)
  // ══════════════════════════════════════════════════
  console.error('[ImageHost] ALL methods failed:')
  errors.forEach((e, i) => console.error(`  ${i+1}. ${e}`))
  console.warn('[ImageHost] Returning null — post will be text-only')
  return null
}
