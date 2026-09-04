import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { PREFIXED_ENV_MAP as KEY_MAP } from './apiKeyMap.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SECRETS_FILE = path.join(__dirname, '..', '.secrets.enc')

function getMachineKey() {
  const seed = [
    process.env.MACHINE_ID || '',
    process.env.HOSTNAME || '',
    process.env.ENCRYPTION_KEY || '',
    fs.existsSync('/etc/machine-id') ? fs.readFileSync('/etc/machine-id', 'utf-8').trim() : '',
    'vault-control-default-seed-2026',
  ].filter(Boolean).join('|')
  return crypto.createHash('sha256').update(seed).digest().slice(0, 32)
}

const KEY = getMachineKey()

function encrypt(text) {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', KEY, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

function decrypt(text) {
  try {
    const [ivHex, encHex] = text.split(':')
    const iv = Buffer.from(ivHex, 'hex')
    const decipher = crypto.createDecipheriv('aes-256-cbc', KEY, iv)
    return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString()
  } catch {
    return null
  }
}

// ENV key mapping — shared with routes/admin.js and database/connection.js

export function loadSecrets() {
  try {
    if (!fs.existsSync(SECRETS_FILE)) return {}
    const raw = fs.readFileSync(SECRETS_FILE, 'utf-8')
    const decrypted = decrypt(raw)
    if (!decrypted) return {}
    const data = JSON.parse(decrypted)
    for (const [key, value] of Object.entries(data)) {
      const envKey = KEY_MAP[key] || key
      // Admin-supplied keys take precedence over the backend .env values
      if (value) process.env[envKey] = value
    }
    return data
  } catch {
    return {}
  }
}

export function saveSecret(key, value) {
  try {
    let secrets = {}
    if (fs.existsSync(SECRETS_FILE)) {
      const raw = fs.readFileSync(SECRETS_FILE, 'utf-8')
      const decrypted = decrypt(raw)
      if (decrypted) secrets = JSON.parse(decrypted)
    }
    secrets[key] = value
    const encrypted = encrypt(JSON.stringify(secrets))
    fs.writeFileSync(SECRETS_FILE, encrypted, { mode: 0o600 })
    // Also set in process.env
    const envKey = KEY_MAP[key] || key
    process.env[envKey] = value
    return true
  } catch (e) {
    console.error('[Secrets] Failed to save:', e.message)
    return false
  }
}

export function deleteSecret(key) {
  try {
    if (!fs.existsSync(SECRETS_FILE)) return false
    const raw = fs.readFileSync(SECRETS_FILE, 'utf-8')
    const decrypted = decrypt(raw)
    if (!decrypted) return false
    const secrets = JSON.parse(decrypted)
    delete secrets[key]
    const encrypted = encrypt(JSON.stringify(secrets))
    fs.writeFileSync(SECRETS_FILE, encrypted, { mode: 0o600 })
    return true
  } catch {
    return false
  }
}
