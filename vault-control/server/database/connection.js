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
