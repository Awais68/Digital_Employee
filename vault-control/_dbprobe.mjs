import fs from 'fs'
import pg from 'pg'
const url = fs.readFileSync(process.argv[2], 'utf8').trim()
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
try {
  await c.connect()
  const t = await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1`)
  console.log('TABLE COUNT:', t.rows.length)
  console.log('TABLES:', t.rows.map(r=>r.table_name).join(', ') || '(none)')
  for (const tbl of ['users','scheduled_posts','emails','notifications','todos','audit_log']) {
    if (!t.rows.find(r=>r.table_name===tbl)) { console.log(`  ${tbl}: MISSING`); continue }
    const n = await c.query(`SELECT count(*)::int n FROM "${tbl}"`)
    console.log(`  ${tbl}: ${n.rows[0].n}`)
  }
  if (t.rows.find(r=>r.table_name==='users')) {
    const u = await c.query(`SELECT username, email, role FROM users ORDER BY 1`)
    console.log('USERS:', JSON.stringify(u.rows))
  }
} catch (e) { console.error('CONN FAIL:', e.message) } finally { await c.end().catch(()=>{}) }
