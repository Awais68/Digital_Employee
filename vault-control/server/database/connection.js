import pkg from 'pg';
import crypto from 'crypto';
import { PREFIXED_ENV_MAP, getEncryptionKey } from '../services/apiKeyMap.js';
const { Pool } = pkg;

let pool = null;

export function getPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING;
  if (connectionString) {
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 30000, // Neon cold-start can take 10-25s
      statement_timeout: 30000,
    });
  } else {
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'vault_control',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      statement_timeout: 30000,
    });
  }

  pool.on('error', (err) => {
    console.error('[PostgreSQL] Unexpected error on idle client:', err);
  });

  return pool;
}

// A suspended Neon compute takes 10-25s to wake, and the first connect after a
// suspend often errors outright rather than merely being slow. With a single
// attempt that one error drops the process into file-based mode for its whole
// lifetime — the database is fine thirty seconds later and nothing retries.
export async function testConnection(attempts = 4, delayMs = 6000) {
  const pool = getPool();
  let lastErr = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      const client = await pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      markDbHealthy(true);
      console.log(`[PostgreSQL] Connected successfully${i > 1 ? ` (attempt ${i})` : ''}`);
      return true;
    } catch (err) {
      lastErr = err;
      console.warn(`[PostgreSQL] Connect attempt ${i}/${attempts} failed: ${err.message || err.code || err}`);
      if (i < attempts) await new Promise(r => setTimeout(r, delayMs));
    }
  }
  markDbHealthy(false, lastErr?.message || 'connect failed');
  console.warn('[PostgreSQL] Falling back to file-based mode');
  return false;
}

export async function initializeSchema() {
  try {
    const pool = getPool();

    // NOTE: Tables are NOT dropped here — that would delete all production data on every restart.
    // CREATE TABLE IF NOT EXISTS handles idempotent schema initialization safely.
    // If you need to reset the database, do it manually via psql or a migration script.

    // Use gen_random_uuid() instead of uuid-ossp extension for Neon compatibility
    const tables = [
      `CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'readonly',
        is_active BOOLEAN DEFAULT true,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS api_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        key_hash VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(100),
        permissions JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        expires_at TIMESTAMP,
        last_used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(50) NOT NULL,
        resource_type VARCHAR(50),
        resource_id VARCHAR(255),
        old_value JSONB,
        new_value JSONB,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS approval_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        file_id VARCHAR(255) NOT NULL,
        filename VARCHAR(255) NOT NULL,
        action VARCHAR(20) NOT NULL,
        performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        previous_status VARCHAR(20),
        notes TEXT,
        can_undo BOOLEAN DEFAULT true,
        undone_at TIMESTAMP,
        undone_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) UNIQUE NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        expires_at TIMESTAMP NOT NULL,
        is_revoked BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      // Two notification code paths coexist and must both work against one table:
      //   services/notificationService.js  -> VARCHAR ids ("n_<ts>_<rand>"), `read`, `data`
      //   database/audit.js + chatbotContext.js -> `user_id`, `is_read`, `link`
      // The old UUID/NOT NULL definition here silently broke every notify() on a
      // fresh database, so this is deliberately the SUPERSET of both. Nothing is
      // NOT NULL except the id — notify() does not send a user_id or a link.
      `CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(50) PRIMARY KEY,
        user_id UUID,
        title VARCHAR(200),
        message TEXT,
        type VARCHAR(20) DEFAULT 'info',
        data JSONB DEFAULT '{}',
        read BOOLEAN DEFAULT false,
        is_read BOOLEAN DEFAULT false,
        link VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS rate_limits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        identifier VARCHAR(255) NOT NULL,
        endpoint VARCHAR(255) NOT NULL,
        request_count INTEGER DEFAULT 1,
        window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(identifier, endpoint, window_start)
      )`,
    ];

    let allTablesOk = true
    for (const sql of tables) {
      try {
        await pool.query(sql);
      } catch (tableErr) {
        allTablesOk = false
        console.error(`[Schema] Table creation error: ${tableErr.message.substring(0, 150)}`);
      }
    }
    if (!allTablesOk) return false

    // ─── Remaining tables (using SERIAL, no FK dependencies on main tables) ──
    const extraTables = [
      `CREATE TABLE IF NOT EXISTS email_templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        shortcut VARCHAR(20) UNIQUE,
        body TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS scheduled_posts (
        id SERIAL PRIMARY KEY,
        topic VARCHAR(200),
        platform VARCHAR(30) NOT NULL,
        content TEXT NOT NULL,
        image_url TEXT,
        user_image_url TEXT,
        scheduled_for TIMESTAMP,
        published_at TIMESTAMP,
        status VARCHAR(20) DEFAULT 'scheduled',
        hashtags JSONB,
        mentions JSONB,
        post_url TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS whatsapp_messages (
        id SERIAL PRIMARY KEY,
        msg_id VARCHAR(100) UNIQUE,
        from_number VARCHAR(50),
        to_number VARCHAR(50),
        body TEXT,
        timestamp TIMESTAMP,
        is_group BOOLEAN DEFAULT false,
        contact_name VARCHAR(100),
        direction VARCHAR(10) DEFAULT 'incoming',
        type VARCHAR(20) DEFAULT 'incoming',
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS todos (
        id SERIAL PRIMARY KEY,
        title VARCHAR(300) NOT NULL,
        description TEXT,
        source VARCHAR(20) DEFAULT 'manual',
        source_id VARCHAR(100),
        status VARCHAR(20) DEFAULT 'pending',
        priority VARCHAR(10) DEFAULT 'medium',
        due_date TIMESTAMP,
        reminder_at TIMESTAMP,
        recurrence VARCHAR(20) DEFAULT 'none',
        recurrence_end TIMESTAMP,
        notification_sent BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS admin_settings (
        id SERIAL PRIMARY KEY,
        key VARCHAR(100) UNIQUE NOT NULL,
        value TEXT NOT NULL,
        encrypted BOOLEAN DEFAULT false,
        last_updated TIMESTAMP DEFAULT NOW()
      )`,
      // Human-in-the-loop approvals. Every actionable email raises one row here
      // and one WhatsApp message to the owner; the owner's reply ("3 APPROVE")
      // is matched back by `ref`, which is why ref is short and unique.
      `CREATE TABLE IF NOT EXISTS hitl_requests (
        id SERIAL PRIMARY KEY,
        ref VARCHAR(20) UNIQUE NOT NULL,
        kind VARCHAR(20) NOT NULL DEFAULT 'email',
        source_id VARCHAR(255),
        title TEXT,
        summary TEXT,
        draft TEXT,
        payload JSONB DEFAULT '{}',
        status VARCHAR(20) DEFAULT 'pending',
        channel VARCHAR(20) DEFAULT 'whatsapp',
        sent_to VARCHAR(40),
        decided_by VARCHAR(40),
        decision_note TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        decided_at TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS emails (
        id SERIAL PRIMARY KEY,
        msg_id VARCHAR(255) UNIQUE,
        from_address VARCHAR(255),
        to_address VARCHAR(255),
        subject TEXT,
        snippet TEXT,
        body TEXT,
        received_at TIMESTAMP,
        status VARCHAR(20) DEFAULT 'unread',
        processed_at TIMESTAMP,
        category VARCHAR(30),
        is_ai_generated BOOLEAN DEFAULT false,
        ai_confidence FLOAT,
        category_reason TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )`,
    ];
    for (const sql of extraTables) {
      try { await pool.query(sql); } catch (e) {
        console.error(`[Schema] Extra table error: ${e.message.substring(0, 150)}`);
      }
    }

    // ─── Notification column migrations (converge older databases) ─────────
    for (const col of [
      `ALTER TABLE notifications ALTER COLUMN id TYPE VARCHAR(50)`,
      `ALTER TABLE notifications ALTER COLUMN title DROP NOT NULL`,
      `ALTER TABLE notifications ALTER COLUMN message DROP NOT NULL`,
      `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}'`,
      `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read BOOLEAN DEFAULT false`,
      `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false`,
      `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_id UUID`,
      `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link VARCHAR(255)`,
      `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
    ]) { try { await pool.query(col); } catch {} }

    // ─── WhatsApp column migrations ────────────────────────────────────────
    for (const col of [
      `ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false`,
    ]) { try { await pool.query(col); } catch {} }

    // ─── Email column migrations ──────────────────────────────────────────
    for (const col of [
      `ALTER TABLE IF EXISTS emails ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'unread'`,
      `ALTER TABLE IF EXISTS emails ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP`,
      `ALTER TABLE IF EXISTS emails ADD COLUMN IF NOT EXISTS category VARCHAR(30)`,
      `ALTER TABLE IF EXISTS emails ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT false`,
      `ALTER TABLE IF EXISTS emails ADD COLUMN IF NOT EXISTS ai_confidence FLOAT`,
      `ALTER TABLE IF EXISTS emails ADD COLUMN IF NOT EXISTS category_reason TEXT`,
      `ALTER TABLE emails ADD COLUMN IF NOT EXISTS thread_id VARCHAR(255)`,
      `ALTER TABLE emails ADD COLUMN IF NOT EXISTS sender_name VARCHAR(255)`,
    ]) { try { await pool.query(col); } catch {} }

    // ─── Create indexes (NOW all tables exist) ────────────────────────────
    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_approval_history_file ON approval_history(file_id)`,
      `CREATE INDEX IF NOT EXISTS idx_approval_history_created ON approval_history(created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read)`,
      `CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read)`,
      `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read)`,
      `CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status)`,
      `CREATE INDEX IF NOT EXISTS idx_emails_received ON emails(received_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_emails_msg_id ON emails(msg_id)`,
      `CREATE INDEX IF NOT EXISTS idx_wa_messages_timestamp ON whatsapp_messages(timestamp DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_wa_messages_from ON whatsapp_messages(from_number)`,
      `CREATE INDEX IF NOT EXISTS idx_wa_messages_direction ON whatsapp_messages(direction)`,
      `CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status)`,
      `CREATE INDEX IF NOT EXISTS idx_todos_created ON todos(created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_posts_status ON scheduled_posts(status, scheduled_for)`,
      `CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_scheduled_posts_status ON scheduled_posts(status)`,
      `CREATE INDEX IF NOT EXISTS idx_hitl_status ON hitl_requests(status, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_hitl_ref ON hitl_requests(ref)`,
    ];
    for (const idx of indexes) {
      try { await pool.query(idx); } catch (e) {
        console.warn(`[Schema] Index error: ${e.message.substring(0, 100)}`);
      }
    }

    // NOTE: Admin user seeding is now done via scripts/seed-admin.js
    // (standalone, idempotent, uses bcrypt). Run it separately:
    //   node scripts/seed-admin.js

    console.log('[PostgreSQL] Schema initialized successfully');
    return true;
  } catch (err) {
    console.error('[PostgreSQL] Schema initialization failed:', err.message);
    return false;
  }
}

// ─── Passive health tracking ───────────────────────────────────────────────
// Health is derived from real query traffic. A periodic `SELECT 1` ping would
// keep the Neon compute from ever scaling to zero (it suspends only after ~5
// minutes of total silence), so we never ping — we just remember how the last
// real query went. Never add a heartbeat here.
let lastQueryOk = false;
let lastQueryAt = 0;
let lastError = null;

export function getDbHealth() {
  return {
    healthy: lastQueryOk,
    lastQueryAt: lastQueryAt ? new Date(lastQueryAt).toISOString() : null,
    lastError,
  };
}

export function markDbHealthy(ok, err = null) {
  lastQueryOk = ok;
  lastQueryAt = Date.now();
  lastError = ok ? null : (err || null);
}

// pg surfaces connection-level failures with a useless `.message`: an
// AggregateError from a multi-address connect has an empty one, and a pool that
// has been ended only ever says so. Both used to reach the log as
// "[DB ERROR] after 756ms:" with nothing after the colon.
function describeDbError(err) {
  const parts = [];
  if (err.message) parts.push(err.message);
  if (err.code) parts.push(`code=${err.code}`);
  if (Array.isArray(err.errors) && err.errors.length) {
    // AggregateError — the real reasons live in here.
    parts.push(`causes=[${err.errors.map(e => e.code || e.message || String(e)).join(', ')}]`);
  }
  if (!parts.length) parts.push(`${err.name || 'Error'} (no message)`);
  return parts.join(' ');
}

// A dead pool never heals on its own: getPool() hands back the same cached
// object forever, so one ended/exhausted pool takes every DB route down until
// the process restarts. These are the errors worth throwing the pool away for.
function isPoolLevelError(err) {
  if (err.code && POOL_LEVEL_CODES.has(err.code)) return true;
  if (Array.isArray(err.errors) && err.errors.length) return true; // connect AggregateError
  const msg = err.message || '';
  return (
    msg.includes('pool after calling end') ||
    msg.includes('Connection terminated') ||
    msg.includes('connection is closed') ||
    msg === ''
  );
}

const POOL_LEVEL_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND', 'EHOSTUNREACH',
  '57P01', // admin_shutdown — Neon suspending the compute
  '57P03', // cannot_connect_now — compute still waking
  '08006', '08003', '08001', // connection_failure / does_not_exist / unable_to_connect
]);

async function runQuery(text, params) {
  const start = Date.now();
  const result = await getPool().query(text, params);
  return { result, duration: Date.now() - start };
}

export async function query(text, params = []) {
  const start = Date.now();
  try {
    const { result, duration } = await runQuery(text, params);
    markDbHealthy(true);
    const slowQueryMs = parseInt(process.env.SLOW_QUERY_MS || '1000', 10);
    if (process.env.LOG_SLOW_QUERIES === 'true' && duration > slowQueryMs) {
      console.warn(`[SLOW QUERY] ${duration}ms: ${text.substring(0, 100)}`);
    }
    return result;
  } catch (err) {
    if (isPoolLevelError(err)) {
      // Drop the poisoned pool and give the query exactly one more chance on a
      // fresh one. Neon cold-starts land here routinely and succeed on retry.
      console.warn(`[PostgreSQL] Pool-level failure (${describeDbError(err)}) — recreating pool and retrying once`);
      await resetPool();
      try {
        const { result } = await runQuery(text, params);
        markDbHealthy(true);
        console.log('[PostgreSQL] Retry on fresh pool succeeded');
        return result;
      } catch (retryErr) {
        err = retryErr;
      }
    }
    const duration = Date.now() - start;
    const detail = describeDbError(err);
    markDbHealthy(false, detail);
    console.error(`[DB ERROR] after ${duration}ms: ${detail} | query: ${text.replace(/\s+/g, ' ').trim().substring(0, 120)}`);
    throw err;
  }
}

// map lives in services/apiKeyMap.js — imported lazily to avoid a startup cycle

function decryptApiKey(encrypted) {
  try {
    const encKey = getEncryptionKey()
    const [ivHex, encHex] = encrypted.split(':')
    const iv = Buffer.from(ivHex, 'hex')
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(encKey, 'hex').slice(0, 32), iv)
    return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString()
  } catch { return null }
}

export async function loadApiKeysFromDb() {
  try {
    const pool = getPool()
    const result = await pool.query("SELECT key, value FROM admin_settings WHERE key LIKE 'api_%' AND encrypted=true")
    for (const row of result.rows) {
      const envKey = PREFIXED_ENV_MAP[row.key]
      if (!envKey) continue
      const decrypted = decryptApiKey(row.value)
      if (!decrypted) {
        console.warn(`[API Keys] Could not decrypt ${row.key} — check ENCRYPTION_KEY`)
        continue
      }
      // Admin-panel (third-party) key deliberately OVERWRITES the backend .env key
      const overwrote = Boolean(process.env[envKey]) && process.env[envKey] !== decrypted
      process.env[envKey] = decrypted
      console.log(`[API Keys] ${envKey} <- admin panel${overwrote ? ' (backend key overridden)' : ''}`)
    }
  } catch (e) {
    console.warn('[API Keys] Could not load from DB:', e.message)
  }
}

export async function closePool() {
  if (pool) {
    const dying = pool;
    // Clear the cache BEFORE awaiting end(): getPool() must never hand out a
    // pool that is on its way down. Leaving this set is what made a single
    // shutdown/teardown poison every later query with "Cannot use a pool after
    // calling end on the pool".
    pool = null;
    try {
      await dying.end();
      console.log('[PostgreSQL] Pool closed');
    } catch (e) {
      console.warn('[PostgreSQL] Error while closing pool:', e.message);
    }
  }
}

// Throw away a broken pool so the next getPool() builds a healthy one. end()
// is fire-and-forget here: the pool is already unusable, and awaiting it can
// hang on the very sockets that failed.
export async function resetPool() {
  if (!pool) return;
  const dying = pool;
  pool = null;
  dying.end().catch(() => {});
  console.log('[PostgreSQL] Pool reset — next query builds a fresh one');
}
