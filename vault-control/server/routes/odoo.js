import express from 'express'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const execAsync = promisify(exec)
const router = express.Router()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT_DIR = path.join(__dirname, '../../../')

// Path to odoo_mcp.py
const ODOO_MCP_PATH = path.join(ROOT_DIR, 'odoo_mcp.py')

// GET accounting summary from Odoo
router.get('/summary', async (req, res) => {
  try {
    const { stdout, stderr } = await execAsync(`python3 "${ODOO_MCP_PATH}" get_accounting_summary`)
    
    if (stderr && !stdout) {
      console.error('Odoo MCP Error:', stderr)
      return res.status(500).json({ error: 'Failed to fetch Odoo summary', details: stderr })
    }

    const data = JSON.parse(stdout)
    res.json(data)
  } catch (err) {
    console.error('Failed to execute Odoo MCP:', err)
    res.status(500).json({ error: 'Internal Server Error', message: err.message })
  }
})

// GET recent transactions from Odoo
router.get('/transactions', async (req, res) => {
  const limit = req.query.limit || 20
  const days = req.query.days || 30
  
  try {
    const { stdout, stderr } = await execAsync(`python3 "${ODOO_MCP_PATH}" get_recent_transactions limit=${limit} days=${days}`)
    
    if (stderr && !stdout) {
      console.error('Odoo MCP Error:', stderr)
      return res.status(500).json({ error: 'Failed to fetch Odoo transactions', details: stderr })
    }

    const data = JSON.parse(stdout)
    res.json(data)
  } catch (err) {
    console.error('Failed to execute Odoo MCP:', err)
    res.status(500).json({ error: 'Internal Server Error', message: err.message })
  }
})

// GET bank balance from Odoo
router.get('/balance', async (req, res) => {
  try {
    const { stdout, stderr } = await execAsync(`python3 "${ODOO_MCP_PATH}" get_bank_balance`)
    
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

export default router
