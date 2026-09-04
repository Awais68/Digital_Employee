import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
try {
  const r = await pool.query(`SELECT id, topic, platform, status, image_url, scheduled_for, published_at, post_url, created_at FROM scheduled_posts WHERE image_url ILIKE '%post_1784832751293%' OR content ILIKE '%ERM Solutions%' ORDER BY created_at`);
  console.log(JSON.stringify(r.rows, null, 1));
} catch(e) { console.error('ERR', e.message); }
await pool.end();
