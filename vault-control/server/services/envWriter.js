import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const VAULT_DIR = path.join(__dirname, '..', '..')
const REPO_ROOT = path.join(VAULT_DIR, '..')

// The repo-root .env is what every Python worker and the token-renewal scripts
// read; vault-control/.env is what this Node server's dotenv loads. They are two
// real files, and the root one used to be missing from this list — so a key saved
// from the admin panel never reached the Python side at all, and the two files
// drifted (they were already holding different LINKEDIN_ACCESS_TOKEN values).
//
// realpath-deduped because vault-control/server/.env is a symlink to the root
// file: writing "both" would otherwise mean writing the same file twice, and a
// naive writeFileSync would replace the symlink with a regular file.
const CANDIDATE_ENV_FILES = [
  path.join(REPO_ROOT, '.env'),
  path.join(VAULT_DIR, '.env'),
]

function uniqueExisting(paths) {
  const seen = new Set()
  const out = []
  for (const p of paths) {
    if (!fs.existsSync(p)) continue
    const real = fs.realpathSync(p)
    if (seen.has(real)) continue
    seen.add(real)
    out.push(real)
  }
  return out
}

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
 * Writes through a temp file + rename so a crash mid-write cannot leave the
 * env truncated — every process on this box reads these files at boot.
 */
export function updateEnvFile(filePath, key, value) {
  if (!fs.existsSync(filePath)) return null
  const real = fs.realpathSync(filePath)
  const content = fs.readFileSync(real, 'utf-8')
  const previous = readValue(content, key)
  const line = `${key}=${quoteIfNeeded(value)}`
  const re = new RegExp(`^${key}=.*$`, 'm')
  const next = re.test(content)
    ? content.replace(re, line)
    : content.replace(/\n*$/, `\n${line}\n`)
  if (next === content) return previous
  const tmp = path.join(path.dirname(real), `.${path.basename(real)}.tmp.${process.pid}`)
  fs.writeFileSync(tmp, next, { encoding: 'utf-8', mode: 0o600 })
  fs.renameSync(tmp, real)
  return previous
}

/**
 * Write KEY=value into every known .env file and into the live process env.
 * Returns the backend value that was overwritten (first file that had one).
 */
export function setEnvEverywhere(key, value) {
  let previous = null
  for (const file of uniqueExisting(CANDIDATE_ENV_FILES)) {
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

/**
 * Pull the current on-disk values of `keys` back into process.env, overwriting
 * what this process booted with.
 *
 * dotenv deliberately never overwrites an existing process.env entry, and PM2
 * caches the environment a process started with — so when an external renewal
 * script rewrites .env, this server keeps posting with the dead token until it
 * is restarted. Anything that renews a credential out-of-process must call this.
 *
 * Returns { KEY: 'changed' | 'unchanged' | 'absent' } for the keys asked about.
 */
export function reloadEnvIntoProcess(keys) {
  const merged = {}
  // Later files win, matching the read order the processes themselves use.
  for (const file of uniqueExisting(CANDIDATE_ENV_FILES).reverse()) {
    let content
    try {
      content = fs.readFileSync(file, 'utf-8')
    } catch {
      continue
    }
    for (const key of keys) {
      const value = readValue(content, key)
      if (value) merged[key] = value
    }
  }

  const report = {}
  for (const key of keys) {
    if (!(key in merged)) { report[key] = 'absent'; continue }
    report[key] = merged[key] === process.env[key] ? 'unchanged' : 'changed'
    process.env[key] = merged[key]
  }
  return report
}

export function getEnvFiles() {
  return uniqueExisting(CANDIDATE_ENV_FILES)
}
