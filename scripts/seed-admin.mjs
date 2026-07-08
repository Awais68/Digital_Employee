#!/usr/bin/env node
/**
 * Standalone idempotent admin seed script.
 *   node scripts/seed-admin.js
 *
 * Upserts one admin user. Credentials come from the environment:
 *   ADMIN_EMAIL, ADMIN_USERNAME, ADMIN_PASSWORD (required).
 * Safe to run multiple times — ON CONFLICT DO NOTHING handles idempotency.
 *
 * Example:
 *   ADMIN_PASSWORD='...' node scripts/seed-admin.mjs
 */

import 'dotenv/config'
import pkg from 'pg'
const { Pool } = pkg

async function main() {
  const connectionString = process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING

  const pool = connectionString
    ? new Pool({ connectionString, ssl: { rejectUnauthorized: false } })
    : new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'vault_control',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
      })

  try {
    await pool.query('SELECT 1')
    console.log('[seed-admin] DB connected')
  } catch (err) {
    console.error('[seed-admin] DB connection failed:', err.message)
    await pool.end()
    process.exit(1)
  }

  const email = process.env.ADMIN_EMAIL || 'awaisniaz@founder.com'
  const username = process.env.ADMIN_USERNAME || 'awaisniaz'
  const password = process.env.ADMIN_PASSWORD
  const role = 'admin'

  if (!password) {
    console.error('[seed-admin] ADMIN_PASSWORD env var is required.')
    await pool.end()
    process.exit(1)
  }

  // Hash with the SAME scheme the login route verifies against
  // (server/database/auth.js hashPassword: pbkdf2 sha512, 100k iters, 64 bytes,
  // stored as "salt:hash"). bcrypt hashes here would NEVER verify at login.
  // crypto is a Node builtin — no dependency to resolve.
  const { pbkdf2Sync, randomBytes } = await import('crypto')
  const salt = randomBytes(16).toString('hex')
  const hash = pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex')
  const passwordHash = `${salt}:${hash}`

  const result = await pool.query(
    `INSERT INTO users (username, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (username) DO UPDATE SET
       email = EXCLUDED.email,
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       updated_at = NOW()
     RETURNING id, username, email, role`,
    [username, email, passwordHash, role]
  )

  console.log(`[seed-admin] Admin user ready:`)
  console.log(`  Username: ${result.rows[0].username}`)
  console.log(`  Email:    ${result.rows[0].email}`)
  console.log(`  Role:     ${result.rows[0].role}`)
  console.log(`  ID:       ${result.rows[0].id}`)

  await pool.end()
  console.log('[seed-admin] Done.')
}

main().catch(err => {
  console.error('[seed-admin] Fatal:', err)
  process.exit(1)
})
