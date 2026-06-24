import pkg from 'pg';
import crypto from 'crypto';
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
      connectionTimeoutMillis: 10000,
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

export async function testConnection() {
  try {
    const pool = getPool();
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('[PostgreSQL] Connected successfully');
    return true;
  } catch (err) {
    console.warn('[PostgreSQL] Connection failed:', err.message);
    console.warn('[PostgreSQL] Falling back to file-based mode');
    return false;
  }
}

export async function initializeSchema() {
  try {
    const pool = getPool();

    // Drop stale tables from previous failed inits (safe for fresh DB)
    const dropOrder = [
      'admin_settings', 'todos', 'whatsapp_messages', 'scheduled_posts',
      'email_templates', 'emails', 'rate_limits', 'notifications',
      'sessions', 'approval_history', 'audit_log', 'api_keys', 'users',
    ]
    for (const t of dropOrder) {
      try { await pool.query(`DROP TABLE IF EXISTS ${t} CASCADE`) } catch {}
    }

    // Use gen_random_uuid() instead of uuid-ossp extension for Neon compatibility
    const tables = [
      `CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'user',
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
      `CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(20) DEFAULT 'info',
        is_read BOOLEAN DEFAULT false,
        link VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    ];
    for (const idx of indexes) {
      try { await pool.query(idx); } catch (e) {
        console.warn(`[Schema] Index error: ${e.message.substring(0, 100)}`);
      }
    }

    // Insert default admin user (password: admin123)
    await pool.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO NOTHING`,
      ['admin', 'admin@vault-control.local',
       '2ba5ff8cc914a32fce0072aa46bde39d:46fa69884fe47a1a211b0d9983fa84f79cea846168b6b6d34bfc47de06142bea847bead8a0f7a5485dc46ef777d28fade6af2e16f68b38d314922c6ed607309b',
       'admin']
    );

    console.log('[PostgreSQL] Schema initialized successfully');
    return true;
  } catch (err) {
    console.error('[PostgreSQL] Schema initialization failed:', err.message);
    return false;
  }
}

export async function query(text, params = []) {
  const pool = getPool();
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 100) {
      console.warn(`[SLOW QUERY] ${duration}ms: ${text.substring(0, 100)}`);
    }
    return result;
  } catch (err) {
    const duration = Date.now() - start;
    console.error(`[DB ERROR] after ${duration}ms:`, err.message);
    throw err;
  }
}

const ENV_KEY_MAP = {
  api_gemini: 'GEMINI_API_KEY',
  api_openai: 'OPENAI_API_KEY',
  api_openrouter: 'OPENROUTER_API_KEY',
  api_claude: 'ANTHROPIC_API_KEY',
  api_facebook: 'META_SYSTEM_USER_TOKEN',
  api_instagram: 'INSTAGRAM_ACCESS_TOKEN',
  api_linkedin: 'LINKEDIN_ACCESS_TOKEN',
  api_twitter_key: 'TWITTER_API_KEY',
  api_twitter_secret: 'TWITTER_API_SECRET',
  api_whatsapp: 'WHATSAPP_API_KEY',
  api_discord: 'DISCORD_BOT_TOKEN',
};

function decryptApiKey(encrypted) {
  try {
    const encKey = process.env.ENCRYPTION_KEY || '00000000000000000000000000000000'
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
      const envKey = ENV_KEY_MAP[row.key]
      if (envKey && !process.env[envKey]) {
        const decrypted = decryptApiKey(row.value)
        if (decrypted) {
          process.env[envKey] = decrypted
          console.log(`[API Keys] Loaded ${envKey} from DB`)
        }
      }
    }
  } catch (e) {
    console.warn('[API Keys] Could not load from DB:', e.message)
  }
}

export async function closePool() {
  if (pool) {
    await pool.end();
    console.log('[PostgreSQL] Pool closed');
  }
}
