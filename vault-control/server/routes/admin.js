import express from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { query } from '../database/connection.js'
import { JWT_SECRET } from '../database/auth.js'

const router = express.Router()

const ENCRYPT_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex')

function encryptKey(value) {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPT_KEY, 'hex').slice(0, 32), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

function decryptKey(encrypted) {
  const [ivHex, encHex] = encrypted.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPT_KEY, 'hex').slice(0, 32), iv)
  return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString()
}

function maskKey(value) {
  if (!value || value.length < 8) return '****'
  return '*'.repeat(Math.min(value.length - 4, 20)) + value.slice(-4)
}

function requireAdmin(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Admin auth required' })

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err || decoded.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
    req.admin = decoded
    next()
  })
}

// POST /admin/login
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body
    const result = await query("SELECT value FROM admin_settings WHERE key='admin_password'")

    if (!result.rows[0]) {
      const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Haris@123', 12)
      await query(
        `INSERT INTO admin_settings(key, value) VALUES('admin_password', $1) ON CONFLICT(key) DO UPDATE SET value=$1`,
        [hash]
      )
      result.rows = [{ value: hash }]
    }

    const valid = await bcrypt.compare(password, result.rows[0]?.value || '')
    if (!valid) return res.status(401).json({ error: 'Invalid password' })

    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '8h' })
    res.json({ token })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /admin/keys — returns masked values
router.get('/keys', requireAdmin, async (req, res) => {
  try {
    const result = await query("SELECT key, value, last_updated FROM admin_settings WHERE key LIKE 'api_%'")
    const masked = result.rows.map(r => ({
      key: r.key,
      maskedValue: r.value ? maskKey(decryptKey(r.value)) : null,
      isSet: true,
      lastUpdated: r.last_updated,
    }))
    res.json(masked)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PUT /admin/keys/:keyName
router.put('/keys/:keyName', requireAdmin, async (req, res) => {
  try {
    const { value } = req.body
    const encrypted = encryptKey(value)
    await query(`
      INSERT INTO admin_settings(key, value, encrypted, last_updated)
      VALUES($1, $2, true, NOW())
      ON CONFLICT(key) DO UPDATE SET value=$2, last_updated=NOW()
    `, [`api_${req.params.keyName}`, encrypted])

    const envMap = {
      gemini: 'GEMINI_API_KEY',
      openai: 'OPENAI_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
      claude: 'ANTHROPIC_API_KEY',
      facebook: 'META_SYSTEM_USER_TOKEN',
      instagram: 'INSTAGRAM_ACCESS_TOKEN',
      linkedin: 'LINKEDIN_ACCESS_TOKEN',
      twitter_key: 'TWITTER_API_KEY',
      twitter_secret: 'TWITTER_API_SECRET',
      whatsapp: 'WHATSAPP_API_KEY',
      discord: 'DISCORD_BOT_TOKEN',
    }
    if (envMap[req.params.keyName]) {
      process.env[envMap[req.params.keyName]] = value
    }

    // Also save to encrypted secrets file
    try {
      const { saveSecret } = await import('../services/secretsManager.js')
      saveSecret(`api_${req.params.keyName}`, value)
    } catch {}

    res.json({ success: true, masked: maskKey(value) })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
