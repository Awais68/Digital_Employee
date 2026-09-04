import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Node backend reads vault-control/.env, Python workers read repo-root .env.
// A third-party key must land in both so every process picks it up.
const ENV_FILES = [
  path.join(__dirname, '..', '..', '.env'),
  path.join(__dirname, '..', '..', 'AI_Employee_Vault', '.env'),
]

function quoteIfNeeded(value) {
  return /[\s#"']/.test(value) ? JSON.stringify(value) : value
}

function readValue(content, key) {
  const m = content.match(new RegExp(`^${key}=(.*)$`, 'm'))
  if (!m) return null
  return m[1].trim().replace(/^["'](.*)["']$/, '$1')
}

/**
 * Upsert KEY=value in one .env file. Returns the previous value (or null).
 */
export function updateEnvFile(filePath, key, value) {
  if (!fs.existsSync(filePath)) return null
  const content = fs.readFileSync(filePath, 'utf-8')
  const previous = readValue(content, key)
  const line = `${key}=${quoteIfNeeded(value)}`
  const re = new RegExp(`^${key}=.*$`, 'm')
  const next = re.test(content)
    ? content.replace(re, line)
    : content.replace(/\n*$/, `\n${line}\n`)
  fs.writeFileSync(filePath, next, 'utf-8')
  return previous
}

/**
 * Write KEY=value into every known .env file and into the live process env.
 * Returns the backend value that was overwritten (first file that had one).
 */
export function setEnvEverywhere(key, value) {
  let previous = null
  for (const file of ENV_FILES) {
    try {
      const prev = updateEnvFile(file, key, value)
      if (previous === null && prev) previous = prev
    } catch (e) {
      console.warn(`[envWriter] Could not update ${file}: ${e.message}`)
    }
  }
  process.env[key] = value
  return previous
}

export function getEnvFiles() {
  return ENV_FILES.filter(f => fs.existsSync(f))
}
