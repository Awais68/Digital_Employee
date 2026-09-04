// Single source of truth: admin-panel key name -> env var the system reads.
// Imported by routes/admin.js, database/connection.js and services/secretsManager.js
// so an override applied in one place is understood everywhere.
export const ENV_MAP = {
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  claude: 'ANTHROPIC_API_KEY',
  groq: 'GROQ_API_KEY',
  facebook: 'META_SYSTEM_USER_TOKEN',
  instagram: 'INSTAGRAM_ACCESS_TOKEN',
  linkedin: 'LINKEDIN_ACCESS_TOKEN',
  twitter_key: 'TWITTER_API_KEY',
  twitter_secret: 'TWITTER_API_SECRET',
  whatsapp: 'WHATSAPP_TOKEN',
  discord: 'DISCORD_BOT_TOKEN',
}

// Prefixed form used as the admin_settings row key: api_gemini -> GEMINI_API_KEY
export const PREFIXED_ENV_MAP = Object.fromEntries(
  Object.entries(ENV_MAP).map(([name, env]) => [`api_${name}`, env])
)

import crypto from 'crypto'

/**
 * AES key used to encrypt admin-supplied keys at rest. Must be identical in
 * every module, otherwise keys stored by the admin panel cannot be read back.
 */
export function getEncryptionKey() {
  return process.env.ENCRYPTION_KEY
    || crypto.createHash('sha256').update(process.env.JWT_SECRET || 'vault-control').digest('hex')
}
