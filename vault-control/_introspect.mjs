import pg from 'pg'
const { Client } = pg
const url = process.argv[2]
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

const tables = (await c.query(`
  SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname`)).rows.map(r => r.relname)

const out = []
out.push('-- Generated from live DB introspection')
out.push('CREATE EXTENSION IF NOT EXISTS pgcrypto;')
out.push('')

for (const t of tables) {
  const cols = (await c.query(`
    SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS typ,
           a.attnotnull, pg_get_expr(d.adbin, d.adrelid) AS def
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY a.attnum`, [`public.${t}`])).rows

  const lines = cols.map(col => {
    const isSerial = col.def && /^nextval\(/.test(col.def)
    if (isSerial) {
      const st = col.typ === 'bigint' ? 'BIGSERIAL' : col.typ === 'smallint' ? 'SMALLSERIAL' : 'SERIAL'
      return `  "${col.attname}" ${st}`
    }
    let s = `  "${col.attname}" ${col.typ}`
    if (col.def) s += ` DEFAULT ${col.def}`
    if (col.attnotnull) s += ' NOT NULL'
    return s
  })

  // table-level constraints (PK, UNIQUE, CHECK, FK)
  const cons = (await c.query(`
    SELECT conname, pg_get_constraintdef(oid) AS def, contype
    FROM pg_constraint WHERE conrelid = $1::regclass AND contype IN ('p','u','c') ORDER BY contype, conname`,
    [`public.${t}`])).rows

  for (const k of cons) {
    lines.push(`  CONSTRAINT "${k.conname}" ${k.def}`)
  }

  out.push(`CREATE TABLE IF NOT EXISTS public."${t}" (\n${lines.join(',\n')}\n);`)
  out.push('')
}

// FKs after all tables
out.push('-- Foreign keys')
for (const t of tables) {
  const fks = (await c.query(`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint WHERE conrelid=$1::regclass AND contype='f' ORDER BY conname`,
    [`public.${t}`])).rows
  for (const f of fks) {
    out.push(`DO $$ BEGIN ALTER TABLE public."${t}" ADD CONSTRAINT "${f.conname}" ${f.def}; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`)
  }
}
out.push('')

// indexes (skip ones backing constraints)
out.push('-- Indexes')
const idx = (await c.query(`
  SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public'
  AND indexname NOT IN (SELECT conname FROM pg_constraint WHERE contype IN ('p','u'))
  ORDER BY tablename, indexname`)).rows
for (const i of idx) {
  out.push(i.indexdef.replace('CREATE INDEX ', 'CREATE INDEX IF NOT EXISTS ')
                     .replace('CREATE UNIQUE INDEX ', 'CREATE UNIQUE INDEX IF NOT EXISTS ') + ';')
}

console.log(out.join('\n'))
await c.end()
