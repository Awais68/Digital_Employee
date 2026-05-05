import pkg from 'pg';
const { Pool } = pkg;

let pool = null;

export function getPool() {
  if (pool) return pool;

  pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'vault_control',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

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
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'user',
        is_active BOOLEAN DEFAULT true,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        key_hash VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(100),
        permissions JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        expires_at TIMESTAMP,
        last_used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(50) NOT NULL,
        resource_type VARCHAR(50),
        resource_id VARCHAR(255),
        old_value JSONB,
        new_value JSONB,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS approval_history (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) UNIQUE NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        expires_at TIMESTAMP NOT NULL,
        is_revoked BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(20) DEFAULT 'info',
        is_read BOOLEAN DEFAULT false,
        link VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS rate_limits (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        identifier VARCHAR(255) NOT NULL,
        endpoint VARCHAR(255) NOT NULL,
        request_count INTEGER DEFAULT 1,
        window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(identifier, endpoint, window_start)
      )
    `);

    // Create indexes
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_approval_history_file ON approval_history(file_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_approval_history_created ON approval_history(created_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)`);

    // Insert default admin user (password: admin123)
    const adminHash = '2ba5ff8cc914a32fce0072aa46bde39d:46fa69884fe47a1a211b0d9983fa84f79cea846168b6b6d34bfc47de06142bea847bead8a0f7a5485dc46ef777d28fade6af2e16f68b38d314922c6ed607309b';
    await pool.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO NOTHING`,
      ['admin', 'admin@vault-control.local', adminHash, 'admin']
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
    console.log('[PostgreSQL] Query executed', { text, duration, rows: result.rowCount });
    return result;
  } catch (err) {
    console.error('[PostgreSQL] Query error:', err.message);
    throw err;
  }
}

export async function closePool() {
  if (pool) {
    await pool.end();
    console.log('[PostgreSQL] Pool closed');
  }
}
