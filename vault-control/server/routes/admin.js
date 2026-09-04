import express from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { query } from '../database/connection.js'
import { JWT_SECRET } from '../database/auth.js'
import { setEnvEverywhere } from '../services/envWriter.js'
import { ENV_MAP, getEncryptionKey } from '../services/apiKeyMap.js'

const router = express.Router()

// Read at call time, never at module load — process.env may not be populated
// yet when this module is first evaluated.
const configuredPassword = () => process.env.ADMIN_PASSWORD || 'Haris123'


function encryptKey(value) {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(getEncryptionKey(), 'hex').slice(0, 32), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

function decryptKey(encrypted) {
  try {
    const [ivHex, encHex] = encrypted.split(':')
    const iv = Buffer.from(ivHex, 'hex')
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(getEncryptionKey(), 'hex').slice(0, 32), iv)
    return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString()
  } catch {
    return null
  }
}

function maskKey(value) {
  if (!value) return null
  if (value.length < 8) return '****'
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

async function setSetting(key, value, encrypted = false) {
  await query(`
    INSERT INTO admin_settings(key, value, encrypted, last_updated)
    VALUES($1, $2, $3, NOW())
    ON CONFLICT(key) DO UPDATE SET value=$2, encrypted=$3, last_updated=NOW()
  `, [key, value, encrypted])
}

// POST /admin/login
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body || {}
    if (!password) return res.status(400).json({ error: 'Password required' })

    const result = await query("SELECT value FROM admin_settings WHERE key='admin_password'")
    const stored = result.rows[0]?.value

    let valid = stored ? await bcrypt.compare(password, stored) : false

    // No stored hash yet, or the configured password was rotated in .env —
    // accept the configured password and (re)seed the hash.
    if (!valid && password === configuredPassword()) {
      await setSetting('admin_password', await bcrypt.hash(password, 12))
      valid = true
    }

    if (!valid) return res.status(401).json({ error: 'Invalid password' })

    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '8h' })
    res.json({ token })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /admin/keys — one row per supported provider, masked
router.get('/keys', requireAdmin, async (req, res) => {
  try {
    const result = await query("SELECT key, value, last_updated FROM admin_settings WHERE key LIKE 'api_%'")
    const overrides = new Map(result.rows.map(r => [r.key, r]))

    const keys = Object.entries(ENV_MAP).map(([name, envVar]) => {
      const row = overrides.get(`api_${name}`)
      const overrideValue = row ? decryptKey(row.value) : null
      const activeValue = overrideValue || process.env[envVar] || null
      return {
        key: `api_${name}`,
        name,
        envVar,
        // 'thirdparty' = admin-supplied key is live and has overwritten the backend one
        source: overrideValue ? 'thirdparty' : (process.env[envVar] ? 'backend' : 'none'),
        isSet: Boolean(activeValue),
        maskedValue: maskKey(activeValue),
        lastUpdated: row?.last_updated || null,
      }
    })
    res.json(keys)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PUT /admin/keys/:keyName — third-party key overwrites the backend key everywhere
router.put('/keys/:keyName', requireAdmin, async (req, res) => {
  try {
    const keyName = req.params.keyName
    const value = (req.body?.value || '').trim()
    const envVar = ENV_MAP[keyName]

    if (!envVar) return res.status(400).json({ error: `Unknown key: ${keyName}` })
    if (!value) return res.status(400).json({ error: 'Value required' })

    await setSetting(`api_${keyName}`, encryptKey(value), true)

    // Live process + both .env files (Node backend and Python workers)
    const previousBackendValue = setEnvEverywhere(envVar, value)

    // Keep the very first backend value so the override can be reverted
    if (previousBackendValue && previousBackendValue !== value) {
      const existing = await query("SELECT 1 FROM admin_settings WHERE key=$1", [`backend_${keyName}`])
      if (!existing.rows[0]) {
        await setSetting(`backend_${keyName}`, encryptKey(previousBackendValue), true)
      }
    }

    try {
      const { saveSecret } = await import('../services/secretsManager.js')
      saveSecret(`api_${keyName}`, value)
    } catch { /* secrets mirror is best-effort */ }

    console.log(`[Admin] ${envVar} switched to third-party key (${maskKey(value)})`)
    global.wsBroadcast?.({ type: 'api_key_updated', key: keyName, envVar, source: 'thirdparty' })

    res.json({ success: true, key: keyName, envVar, source: 'thirdparty', masked: maskKey(value) })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /admin/keys/:keyName — revert to the original backend key
router.delete('/keys/:keyName', requireAdmin, async (req, res) => {
  try {
    const keyName = req.params.keyName
    const envVar = ENV_MAP[keyName]
    if (!envVar) return res.status(400).json({ error: `Unknown key: ${keyName}` })

    const backup = await query("SELECT value FROM admin_settings WHERE key=$1", [`backend_${keyName}`])
    const original = backup.rows[0] ? decryptKey(backup.rows[0].value) : null

    // Drop the backup too, so a future override snapshots the then-current backend key
    await query("DELETE FROM admin_settings WHERE key = ANY($1)", [[`api_${keyName}`, `backend_${keyName}`]])

    if (original) setEnvEverywhere(envVar, original)
    else delete process.env[envVar]

    try {
      const { deleteSecret } = await import('../services/secretsManager.js')
      deleteSecret?.(`api_${keyName}`)
    } catch { /* best-effort */ }

    global.wsBroadcast?.({ type: 'api_key_updated', key: keyName, envVar, source: original ? 'backend' : 'none' })
    res.json({ success: true, key: keyName, source: original ? 'backend' : 'none', masked: maskKey(original) })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
