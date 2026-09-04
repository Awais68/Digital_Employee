import express from 'express'
import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { requireAdmin } from '../database/auth.js'
// Static, not `await import(...)` inside odooRead: a dynamic import is an await,
// so three concurrent callers all suspended on it before any of them reached
// `inflight.set` — the de-duplication never fired and each click still spawned
// its own 17s Python process.
import { cacheGet, cacheSet } from '../services/cache.js'

const execFileAsync = promisify(execFile)
const ODOO_TIMEOUT = 25000
const router = express.Router()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT_DIR = path.join(__dirname, '../../../')

// venv/ has never existed in this repo, so the old default made every Odoo
// route fail with ENOENT. System python3 already has dotenv + xmlrpc.
const PYTHON = process.env.ODOO_PYTHON || 'python3'

// Path to odoo_mcp.py
const ODOO_MCP_PATH = path.join(ROOT_DIR, 'odoo_mcp.py')

// ─── Read caching ──────────────────────────────────────────────────────────
// Every Odoo read spawns a Python process that opens its own XML-RPC session;
// one `get_accounting_summary` measured 17s. The Accounting page fires summary
// and transactions together, so an uncached load cost ~35s and a second visit
// paid it all over again — which is what made the panel look like it was
// flapping between "Running" and "Reconnecting…".
//
// Ledger totals do not change second to second, so a short TTL is safe. Requests
// that arrive while a fetch is already running share that fetch instead of
// spawning a second Python process (`inflight`); without that, three impatient
// clicks on Sync Now meant three concurrent 17s subprocesses.
const ODOO_CACHE_TTL = parseInt(process.env.ODOO_CACHE_TTL || '120', 10)
const inflight = new Map()

function odooRead(cacheKey, argv) {
  // Deliberately NOT async: every statement up to `inflight.set` must run in one
  // synchronous turn, or concurrent callers slip past the de-duplication.
  const cached = cacheGet(cacheKey)
  if (cached) return Promise.resolve(cached)

  if (inflight.has(cacheKey)) return inflight.get(cacheKey)

  const p = (async () => {
    // argv array — see runOdoo for why no shell is involved.
    const { stdout, stderr } = await execFileAsync(
      PYTHON,
      [ODOO_MCP_PATH, ...argv],
      { timeout: ODOO_TIMEOUT }
    )
    if (stderr && !stdout) {
      const e = new Error(stderr)
      e.odooStderr = true
      throw e
    }
    const data = JSON.parse(stdout)
    cacheSet(cacheKey, data, ODOO_CACHE_TTL)
    return data
  })().finally(() => inflight.delete(cacheKey))

  inflight.set(cacheKey, p)
  return p
}

// GET accounting summary from Odoo
router.get('/summary', async (req, res) => {
  try {
    const data = await odooRead('odoo_summary', ['get_accounting_summary'])
    res.json(data)
  } catch (err) {
    console.error('[Odoo] summary failed:', err.message)
    res.status(500).json({ error: 'Failed to fetch Odoo summary', message: err.message })
  }
})

// GET recent transactions from Odoo
router.get('/transactions', async (req, res) => {
  // Bounded integers. These are also part of the cache key, so leaving them as
  // free-form strings would let one client fill the cache with junk entries.
  // Anything unparseable falls back to the default rather than erroring.
  const clampInt = (v, def, min, max) => {
    const n = parseInt(v, 10)
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def
  }
  const limit = clampInt(req.query.limit, 20, 1, 500)
  const days = clampInt(req.query.days, 30, 1, 3650)

  try {
    const data = await odooRead(
      `odoo_tx_${limit}_${days}`,
      ['get_recent_transactions', `limit=${limit}`, `days=${days}`]
    )
    res.json(data)
  } catch (err) {
    console.error('[Odoo] transactions failed:', err.message)
    res.status(500).json({ error: 'Failed to fetch Odoo transactions', message: err.message })
  }
})

// GET bank balance from Odoo
router.get('/balance', async (req, res) => {
  try {
      const { stdout, stderr } = await execFileAsync(PYTHON, [ODOO_MCP_PATH, 'get_bank_balance'], { timeout: ODOO_TIMEOUT })
    
    if (stderr && !stdout) {
      console.error('Odoo MCP Error:', stderr)
      return res.status(500).json({ error: 'Failed to fetch Odoo bank balance', details: stderr })
    }

    const data = JSON.parse(stdout)
    res.json(data)
  } catch (err) {
    console.error('Failed to execute Odoo MCP:', err)
    res.status(500).json({ error: 'Internal Server Error', message: err.message })
  }
})

// Shared runner: odoo_mcp.py prints one JSON object on stdout.
//
// execFile, not exec: arguments are passed as an argv array so no shell ever sees
// them. The previous version pasted request values into a command string and only
// stripped double quotes, so `GET /api/odoo/invoices?state=draft;id` ran `id` on
// the server — and that route is not admin-gated.
async function runOdoo(tool, args = {}, timeout = ODOO_TIMEOUT) {
  const argv = [ODOO_MCP_PATH, tool]
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined || v === null || v === '') continue
    argv.push(`${k}=${String(v)}`)
  }
  console.log('[Odoo] run:', tool, Object.keys(args).join(','))

  const { stdout, stderr } = await execFileAsync(PYTHON, argv, { timeout, maxBuffer: 10 * 1024 * 1024 })
  if (!stdout) throw new Error(stderr || `${tool} produced no output`)
  try {
    return JSON.parse(stdout)
  } catch {
    throw new Error(`${tool} returned non-JSON output: ${stdout.slice(0, 300)}`)
  }
}

// GET invoices
router.get('/invoices', async (req, res) => {
  try {
    const data = await runOdoo('list_invoices', {
      limit: req.query.limit || 20,
      state: req.query.state,
      invoice_type: req.query.type,
    })
    res.json(data)
  } catch (err) {
    console.error('[Odoo] list_invoices failed:', err.message)
    res.status(500).json({ error: 'Failed to list invoices', message: err.message })
  }
})

// POST send an invoice: validates a draft, then emails it to the customer.
router.post('/invoice/send', requireAdmin, async (req, res) => {
  const { invoice_id, force_post = true, email_to } = req.body || {}
  if (!invoice_id) {
    return res.status(400).json({ error: 'invoice_id is required' })
  }
  try {
    // Posting + emailing round-trips to Odoo SaaS; the read-only timeout is too tight.
    const data = await runOdoo('send_invoice', {
      invoice_id,
      force_post: force_post ? 1 : 0,
      email_to,
    }, 90000)

    if (data.status !== 'success') {
      return res.status(400).json(data)
    }

    try {
      const { notify } = await import('../services/notificationService.js')
      notify('success', 'Invoice Sent', data.message, { invoice_id: data.invoice_id })
    } catch { /* notification is best-effort */ }

    res.json(data)
  } catch (err) {
    console.error('[Odoo] send_invoice failed:', err.message)
    res.status(500).json({ error: 'Failed to send invoice', message: err.message })
  }
})

// POST create an invoice and immediately send it.
router.post('/invoice/create-and-send', requireAdmin, async (req, res) => {
  const { partner_id, invoice_line_ids, narrative, invoice_date } = req.body || {}
  if (!partner_id) return res.status(400).json({ error: 'partner_id is required' })
  try {
    const created = await runOdoo('create_invoice', {
      partner_id,
      invoice_date,
      narrative,
      invoice_line_ids: JSON.stringify(invoice_line_ids || []),
    }, 60000)
    if (created.status !== 'success') return res.status(400).json(created)

    const sent = await runOdoo('send_invoice', { invoice_id: created.invoice_id, force_post: 1 }, 90000)
    res.json({ created, sent })
  } catch (err) {
    console.error('[Odoo] create-and-send failed:', err.message)
    res.status(500).json({ error: 'Failed to create and send invoice', message: err.message })
  }
})

export default router
