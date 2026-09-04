import { config } from 'dotenv'
config({ path: './.env' })
import pkg from 'pg'
import bcrypt from 'bcryptjs'
import { pbkdf2Sync, randomBytes } from 'crypto'
const { Pool } = pkg
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const password = process.env.ADMIN_PASSWORD
const username = process.env.ADMIN_USERNAME || 'admin'
const email = process.env.ADMIN_EMAIL || 'admin@gmail.com'
if (!password) { console.error('ADMIN_PASSWORD missing'); process.exit(1) }

const salt = randomBytes(16).toString('hex')
const hash = pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex')

const u = await pool.query(
  `INSERT INTO users (username, email, password_hash, role, is_active)
   VALUES ($1,$2,$3,'admin',true)
   ON CONFLICT (username) DO UPDATE SET
     email=EXCLUDED.email, password_hash=EXCLUDED.password_hash,
     role='admin', is_active=true, updated_at=NOW()
   RETURNING id, username, email, role`,
  [username, email, `${salt}:${hash}`]
)
console.log('users row:', u.rows[0])

const bh = await bcrypt.hash(password, 12)
await pool.query(
  `INSERT INTO admin_settings (key, value, encrypted) VALUES ('admin_password',$1,false)
   ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, last_updated=NOW()`, [bh]
)
console.log('admin_settings.admin_password: bcrypt set')
await pool.end()
