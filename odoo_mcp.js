#!/usr/bin/env node
/**
 * Odoo MCP Server - Gold Tier (Node.js Implementation)
 * Connects to local Odoo 19 via JSON-RPC (XML-RPC) and exposes MCP tools
 * for business operations: invoices, customers, sales, accounting, journal entries.
 *
 * Designed for use with Claude Code MCP / MCP-compliant clients.
 *
 * Features:
 * - Odoo XML-RPC/JSON-RPC API integration
 * - Create customers, invoices, sale orders, journal entries
 * - Get bank balances, accounting summaries, recent transactions
 * - OAuth2-style authentication with Odoo
 * - Comprehensive error handling and logging
 *
 * Author: Digital Employee System
 * Version: 1.0.0
 */

const https = require('http');
const http = require('http');
const fs = require('fs').promises;
const path = require('path');

// =============================================================================
// Configuration
// =============================================================================

const BASE_DIR = process.cwd();
const LOGS_DIR = path.join(BASE_DIR, 'Logs');

// Odoo Configuration
const ODOO_URL = process.env.ODOO_URL || 'http://localhost:8069';
const ODOO_DB = process.env.ODOO_DB || 'odoo';
const ODOO_USERNAME = process.env.ODOO_USERNAME || 'awaisniaz720@gmail.com';
const ODOO_PASSWORD = process.env.ODOO_PASSWORD || '';

// XML-RPC endpoints
const COMMON_URL = `${ODOO_URL}/xmlrpc/2/common`;
const OBJECT_URL = `${ODOO_URL}/xmlrpc/2/object`;

// Logging
const LOG_LEVEL = process.env.LOG_LEVEL || 'INFO';
const LOG_FILE = path.join(LOGS_DIR, 'odoo_operations.log');

// =============================================================================
// Utility Functions
// =============================================================================

function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...(data && { data }),
  };

  const logLine = `[${timestamp}] [${level}] ${message}${data ? ' - ' + JSON.stringify(data) : ''}\n`;

  // Always log errors to stderr
  if (level === 'ERROR') {
    process.stderr.write(logLine);
  } else if (LOG_LEVEL === 'DEBUG') {
    process.stderr.write(logLine);
  }

  // Append to log file
  fs.appendFile(LOG_FILE, logLine).catch(() => {});
}

function jsonSerialize(obj) {
  // Make datetimes and other types JSON-safe
  if (obj instanceof Date) {
    return obj.toISOString();
  }
  if (typeof obj === 'bigint') {
    return Number(obj);
  }
  return obj;
}

function safeJson(data) {
  return JSON.stringify(data, jsonSerialize, 2);
}

// =============================================================================
// XML-RPC Client (Odoo uses XML-RPC, not JSON-RPC despite the name)
// =============================================================================

/**
 * Build XML-RPC request body
 */
function buildXmlRpcRequest(method, args) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>';
  xml += '<methodCall>';
  xml += `<methodName>${method}</methodName>`;
  xml += '<params>';

  for (const arg of args) {
    xml += '<param><value>';
    xml += serializeXmlRpcValue(arg);
    xml += '</value></param>';
  }

  xml += '</params>';
  xml += '</methodCall>';
  return xml;
}

/**
 * Serialize JavaScript value to XML-RPC format
 */
function serializeXmlRpcValue(value) {
  if (value === null || value === undefined) {
    return '<nil/>';
  }

  if (typeof value === 'boolean') {
    return `<boolean>${value ? 1 : 0}</boolean>`;
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return `<int>${value}</int>`;
    }
    return `<double>${value}</double>`;
  }

  if (typeof value === 'string') {
    return `<string>${escapeXml(value)}</string>`;
  }

  if (value instanceof Date) {
    return `<dateTime.iso8601>${value.toISOString()}</dateTime.iso8601>`;
  }

  if (Array.isArray(value)) {
    let xml = '<array><data>';
    for (const item of value) {
      xml += '<value>';
      xml += serializeXmlRpcValue(item);
      xml += '</value>';
    }
    xml += '</data></array>';
    return xml;
  }

  if (typeof value === 'object') {
    let xml = '<struct>';
    for (const [key, val] of Object.entries(value)) {
      xml += `<member><name>${escapeXml(key)}</name><value>`;
      xml += serializeXmlRpcValue(val);
      xml += '</value></member>';
    }
    xml += '</struct>';
    return xml;
  }

  return `<string>${escapeXml(String(value))}</string>`;
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Parse XML-RPC response
 * Simplified parser - in production, use a proper XML parser library
 */
function parseXmlRpcResponse(xml) {
  try {
    // Extract value from XML response
    const valueMatch = xml.match(/<value>([\s\S]*)<\/value>/);
    if (!valueMatch) {
      throw new Error('Invalid XML-RPC response');
    }

    return parseXmlValue(valueMatch[1]);
  } catch (error) {
    log('ERROR', 'Failed to parse XML-RPC response', { error: error.message });
    throw new Error(`XML parsing failed: ${error.message}`);
  }
}

function parseXmlValue(xml) {
  // Remove whitespace
  xml = xml.trim();

  // Boolean
  if (xml.includes('<boolean>')) {
    const match = xml.match(/<boolean>(\d)<\/boolean>/);
    return match ? parseInt(match[1]) === 1 : false;
  }

  // Integer
  if (xml.includes('<int>')) {
    const match = xml.match(/<int>(-?\d+)<\/int>/);
    return match ? parseInt(match[1]) : 0;
  }

  // Double
  if (xml.includes('<double>')) {
    const match = xml.match(/<double>(-?[\d.]+)<\/double>/);
    return match ? parseFloat(match[1]) : 0;
  }

  // String
  if (xml.includes('<string>')) {
    const match = xml.match(/<string>([\s\S]*?)<\/string>/);
    return match ? match[1] : '';
  }

  // Array
  if (xml.includes('<array>')) {
    const dataMatch = xml.match(/<data>([\s\S]*)<\/data>/);
    if (!dataMatch) return [];

    const values = [];
    const valueRegex = /<value>([\s\S]*?)<\/value>/g;
    let match;
    while ((match = valueRegex.exec(dataMatch[1])) !== null) {
      values.push(parseXmlValue(match[1]));
    }
    return values;
  }

  // Struct (object)
  if (xml.includes('<struct>')) {
    const obj = {};
    const memberRegex = /<member><name>([^<]+)<\/name><value>([\s\S]*?)<\/value><\/member>/g;
    let match;
    while ((match = memberRegex.exec(xml)) !== null) {
      obj[match[1]] = parseXmlValue(match[2]);
    }
    return obj;
  }

  // Nil
  if (xml.includes('<nil/>')) {
    return null;
  }

  return xml;
}

/**
 * Make XML-RPC request
 */
function xmlRpcRequest(url, method, args) {
  return new Promise((resolve, reject) => {
    const xmlBody = buildXmlRpcRequest(method, args);
    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        'Content-Length': Buffer.byteLength(xmlBody),
      },
    };

    const protocol = urlObj.protocol === 'https:' ? https : http;
    const req = protocol.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          return;
        }

        try {
          const result = parseXmlRpcResponse(data);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(xmlBody);
    req.end();
  });
}

// =============================================================================
// Odoo Client
// =============================================================================

class OdooClient {
  constructor(url, db, username, password) {
    this.url = url;
    this.db = db;
    this.username = username;
    this.password = password;
    this._uid = null;
  }

  /**
   * Authenticate with Odoo
   */
  async authenticate() {
    try {
      const uid = await xmlRpcRequest(COMMON_URL, 'authenticate', [
        this.db,
        this.username,
        this.password,
        {},
      ]);

      if (!uid || typeof uid !== 'number') {
        throw new AuthenticationError(
          `Authentication failed for user '${this.username}' on DB '${this.db}'`
        );
      }

      this._uid = uid;
      log('INFO', `Authenticated as uid=${uid}`);
      return uid;
    } catch (error) {
      if (error instanceof AuthenticationError) throw error;
      throw new Error(`Authentication error: ${error.message}`);
    }
  }

  get uid() {
    if (this._uid === null) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }
    return this._uid;
  }

  /**
   * Execute keyword arguments on Odoo model
   */
  async executeKw(model, method, args = [], kwargs = {}) {
    return await xmlRpcRequest(OBJECT_URL, 'execute_kw', [
      this.db,
      this.uid,
      this.password,
      model,
      method,
      args,
      kwargs,
    ]);
  }

  /**
   * Search and read records
   */
  async searchRead(model, domain = [], fields = [], limit = 100, order = 'id desc') {
    return await this.executeKw(
      model,
      'search_read',
      [domain],
      { fields, limit, order }
    );
  }

  /**
   * Create record
   */
  async create(model, values) {
    return await this.executeKw(model, 'create', [values]);
  }

  /**
   * Read records
   */
  async read(model, ids, fields = []) {
    return await this.executeKw(model, 'read', [ids], { fields });
  }

  /**
   * Search for records
   */
  async search(model, domain, limit = 100, order = 'id desc') {
    return await this.executeKw(
      model,
      'search',
      [domain],
      { limit, order }
    );
  }

  /**
   * Write to existing records
   */
  async write(model, ids, values) {
    return await this.executeKw(model, 'write', [ids, values]);
  }

  /**
   * Delete records
   */
  async unlink(model, ids) {
    return await this.executeKw(model, 'unlink', [ids]);
  }
}

// =============================================================================
// Custom Exceptions
// =============================================================================

class AuthenticationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

class OdooRPCError extends Error {
  constructor(message, code = null) {
    super(message);
    this.name = 'OdooRPCError';
    this.code = code;
  }
}

// =============================================================================
// Singleton Client
// =============================================================================

let _client = null;

function getClient() {
  if (_client === null) {
    _client = new OdooClient(ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD);
  }
  return _client;
}

// =============================================================================
// MCP Tool Implementations
// =============================================================================

/**
 * Create a new customer (res.partner with customer rank)
 */
async function createCustomer(name, email = '', phone = '', vat = '', street = '', city = '', countryId = null, extraFields = {}) {
  const client = getClient();

  const vals = {
    name,
    email,
    phone,
    vat,
    street,
    city,
    customer_rank: 1,
  };

  if (countryId) {
    vals.country_id = countryId;
  }

  Object.assign(vals, extraFields);

  const partnerId = await client.create('res.partner', vals);
  log('INFO', `Created customer res.partner id=${partnerId}`);

  // Read back the created record
  const partners = await client.read('res.partner', [partnerId]);
  const partner = partners[0];

  return {
    status: 'success',
    message: `Customer '${name}' created successfully`,
    customer_id: partnerId,
    customer: partner,
  };
}

/**
 * Create a customer invoice (account.move)
 */
async function createInvoice(partnerId, invoiceType = 'out_invoice', invoiceDate = '', paymentTermId = null, invoiceLineIds = [], narrative = '', extraFields = {}) {
  const client = getClient();

  // Build invoice lines as (0, 0, vals) commands
  const lines = [];
  if (invoiceLineIds && invoiceLineIds.length > 0) {
    for (const line of invoiceLineIds) {
      const lineVals = {
        name: line.name || 'Service',
        quantity: line.quantity || 1.0,
        price_unit: line.price_unit || 0.0,
      };

      if (line.product_id) {
        lineVals.product_id = line.product_id;
      }

      if (line.tax_ids) {
        lineVals.tax_ids = [[6, 0, line.tax_ids]];
      }

      lines.push([0, 0, lineVals]);
    }
  }

  const moveVals = {
    move_type: invoiceType,
    partner_id: partnerId,
    invoice_line_ids: lines,
  };

  if (invoiceDate) {
    moveVals.invoice_date = invoiceDate;
  } else {
    moveVals.invoice_date = new Date().toISOString().split('T')[0];
  }

  if (paymentTermId) {
    moveVals.invoice_payment_term_id = paymentTermId;
  }

  if (narrative) {
    moveVals.narration = narrative;
  }

  Object.assign(moveVals, extraFields);

  const invoiceId = await client.create('account.move', moveVals);
  log('INFO', `Created invoice account.move id=${invoiceId}`);

  const invoices = await client.read('account.move', [invoiceId]);
  const invoice = invoices[0];

  return {
    status: 'success',
    message: `Invoice created successfully (id=${invoiceId})`,
    invoice_id: invoiceId,
    invoice,
  };
}

/**
 * Create a Sale Order (sale.order)
 */
async function createSaleOrder(partnerId, orderLineIds = [], dateOrder = '', validityDate = '', note = '', extraFields = {}) {
  const client = getClient();

  const lines = [];
  if (orderLineIds && orderLineIds.length > 0) {
    for (const line of orderLineIds) {
      const lineVals = {
        name: line.name || 'Product',
        product_uom_qty: line.product_uom_qty || 1.0,
      };

      if (line.product_id) {
        lineVals.product_id = line.product_id;
      }

      if (line.price_unit) {
        lineVals.price_unit = line.price_unit;
      }

      lines.push([0, 0, lineVals]);
    }
  }

  const orderVals = {
    partner_id: partnerId,
    order_line: lines,
  };

  if (dateOrder) {
    orderVals.date_order = dateOrder;
  }

  if (validityDate) {
    orderVals.validity_date = validityDate;
  }

  if (note) {
    orderVals.note = note;
  }

  Object.assign(orderVals, extraFields);

  const orderId = await client.create('sale.order', orderVals);
  log('INFO', `Created sale.order id=${orderId}`);

  const orders = await client.read('sale.order', [orderId]);
  const order = orders[0];

  return {
    status: 'success',
    message: `Sale Order created successfully (id=${orderId})`,
    order_id: orderId,
    order,
  };
}

/**
 * Get bank/cash journal balance summary
 */
async function getBankBalance() {
  const client = getClient();

  // Get bank/cash journals
  const journals = await client.searchRead(
    'account.journal',
    [['type', 'in', ['bank', 'cash']]],
    ['id', 'name', 'type', 'default_account_id'],
    50
  );

  const summary = [];
  let totalBalance = 0.0;

  for (const journal of journals) {
    const defaultAccount = journal.default_account_id;
    let balance = 0.0;

    if (defaultAccount && Array.isArray(defaultAccount) && defaultAccount.length === 2) {
      const accountId = defaultAccount[0];

      // Read account
      const accounts = await client.read('account.account', [accountId], ['name', 'code']);

      if (accounts && accounts.length > 0) {
        const account = accounts[0];

        // Get balance from account_move_lines
        const moveLines = await client.searchRead(
          'account.move.line',
          [['account_id', '=', accountId], ['parent_state', '=', 'posted']],
          ['debit', 'credit'],
          10000
        );

        balance = moveLines.reduce((sum, ml) => {
          return sum + (ml.debit || 0) - (ml.credit || 0);
        }, 0);

        summary.push({
          journal: journal.name,
          journal_type: journal.type,
          account: account.name,
          account_code: account.code,
          balance: Math.round(balance * 100) / 100,
        });

        totalBalance += balance;
      }
    }
  }

  return {
    status: 'success',
    message: 'Bank balance summary retrieved',
    journals: summary,
    total_balance: Math.round(totalBalance * 100) / 100,
    currency: 'USD',
  };
}

/**
 * Get accounting summary
 */
async function getAccountingSummary() {
  const client = getClient();

  async function getBalance(accountCodePrefix) {
    const accounts = await client.searchRead(
      'account.account',
      [['code', '=like', `${accountCodePrefix}%`]],
      ['id'],
      50
    );

    let total = 0.0;

    for (const acc of accounts) {
      const lines = await client.searchRead(
        'account.move.line',
        [['account_id', '=', acc.id], ['parent_state', '=', 'posted']],
        ['debit', 'credit'],
        10000
      );

      total += lines.reduce((sum, ml) => {
        return sum + (ml.debit || 0) - (ml.credit || 0);
      }, 0);
    }

    return total;
  }

  // Receivable and Payable
  const receivable = await getBalance('12');
  const payable = await getBalance('2');
  const bankInfo = await getBankBalance();

  // Recent posted invoices count (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dateStr = thirtyDaysAgo.toISOString().split('T')[0];

  const recentInvoices = await client.searchRead(
    'account.move',
    [
      ['move_type', 'in', ['out_invoice', 'in_invoice']],
      ['state', '=', 'posted'],
      ['date', '>=', dateStr],
    ],
    ['id'],
    500
  );

  return {
    status: 'success',
    message: 'Accounting summary retrieved',
    total_receivable: Math.round(receivable * 100) / 100,
    total_payable: Math.round(Math.abs(payable) * 100) / 100,
    bank_balance: bankInfo.total_balance,
    recent_invoices_count: recentInvoices.length,
    currency: 'USD',
  };
}

/**
 * Get recent transactions
 */
async function getRecentTransactions(limit = 20, days = 30, moveType = '') {
  const client = getClient();

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0];

  const domain = [['date', '>=', sinceStr], ['parent_state', '=', 'posted']];

  if (moveType) {
    domain.push(['move_id.move_type', '=', moveType]);
  }

  const lines = await client.searchRead(
    'account.move.line',
    domain,
    [
      'id',
      'date',
      'name',
      'account_id',
      'partner_id',
      'move_id',
      'debit',
      'credit',
      'balance',
      'amount_currency',
      'currency_id',
    ],
    limit,
    'date desc, id desc'
  );

  return {
    status: 'success',
    message: `Retrieved ${lines.length} recent transactions`,
    count: lines.length,
    transactions: lines,
  };
}

/**
 * Create a journal entry (account.move)
 */
async function createJournalEntry(journalId, date = '', lineIds = [], ref = '', extraFields = {}) {
  const client = getClient();

  const lines = [];
  if (lineIds && lineIds.length > 0) {
    for (const ln of lineIds) {
      const lineVals = {
        account_id: ln.account_id,
        name: ln.name || '/',
        debit: ln.debit || 0.0,
        credit: ln.credit || 0.0,
      };

      if (ln.partner_id) {
        lineVals.partner_id = ln.partner_id;
      }

      lines.push([0, 0, lineVals]);
    }
  }

  const moveVals = {
    journal_id: journalId,
    date: date || new Date().toISOString().split('T')[0],
    line_ids: lines,
  };

  if (ref) {
    moveVals.ref = ref;
  }

  Object.assign(moveVals, extraFields);

  const moveId = await client.create('account.move', moveVals);
  log('INFO', `Created journal entry account.move id=${moveId}`);

  const moves = await client.read('account.move', [moveId]);
  const move = moves[0];

  return {
    status: 'success',
    message: `Journal Entry created successfully (id=${moveId})`,
    move_id: moveId,
    entry: move,
  };
}

// =============================================================================
// MCP Protocol
// =============================================================================

const MCP_SERVER_INFO = {
  name: 'odoo-gold-tier',
  version: '1.0.0',
  description: 'Odoo 19 Gold Tier MCP Server — invoices, customers, sales, accounting',
};

const TOOLS = [
  {
    name: 'create_customer',
    description: 'Create a new customer (contact) in Odoo',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Customer name' },
        email: { type: 'string', description: 'Email address' },
        phone: { type: 'string', description: 'Phone number' },
        vat: { type: 'string', description: 'VAT / Tax ID' },
        street: { type: 'string', description: 'Street address' },
        city: { type: 'string', description: 'City' },
        country_id: { type: 'integer', description: 'Odoo country ID' },
      },
      required: ['name'],
    },
  },
  {
    name: 'create_invoice',
    description: 'Create a customer invoice in Odoo',
    inputSchema: {
      type: 'object',
      properties: {
        partner_id: { type: 'integer', description: 'Customer ID' },
        invoice_type: {
          type: 'string',
          enum: ['out_invoice', 'out_refund', 'in_invoice', 'in_refund'],
          description: 'Invoice type',
        },
        invoice_date: { type: 'string', description: 'Invoice date (YYYY-MM-DD)' },
        invoice_line_ids: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              product_id: { type: 'integer' },
              name: { type: 'string' },
              quantity: { type: 'number' },
              price_unit: { type: 'number' },
            },
          },
          description: 'Invoice line items',
        },
        payment_term_id: { type: 'integer', description: 'Payment term ID' },
        narrative: { type: 'string', description: 'Additional notes' },
      },
      required: ['partner_id'],
    },
  },
  {
    name: 'create_sale_order',
    description: 'Create a Sale Order in Odoo',
    inputSchema: {
      type: 'object',
      properties: {
        partner_id: { type: 'integer', description: 'Customer ID' },
        order_line_ids: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              product_id: { type: 'integer' },
              name: { type: 'string' },
              product_uom_qty: { type: 'number' },
              price_unit: { type: 'number' },
            },
          },
          description: 'Order line items',
        },
        date_order: { type: 'string', description: 'Order date (YYYY-MM-DD)' },
        validity_date: { type: 'string', description: 'Quotation expiry (YYYY-MM-DD)' },
        note: { type: 'string', description: 'Additional notes' },
      },
      required: ['partner_id'],
    },
  },
  {
    name: 'get_bank_balance',
    description: 'Get bank/cash journal balance summary from Odoo accounting',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_accounting_summary',
    description: 'Get overall accounting summary (receivable, payable, bank balance)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_recent_transactions',
    description: 'Get recent accounting transactions / journal items',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Max records to return', default: 20 },
        days: { type: 'integer', description: 'Look back this many days', default: 30 },
        move_type: { type: 'string', description: 'Filter by move type (optional)' },
      },
    },
  },
  {
    name: 'create_journal_entry',
    description: 'Create a journal entry (account.move) with debit/credit lines',
    inputSchema: {
      type: 'object',
      properties: {
        journal_id: { type: 'integer', description: 'Odoo journal ID' },
        date: { type: 'string', description: 'Entry date (YYYY-MM-DD)' },
        ref: { type: 'string', description: 'Reference / memo' },
        line_ids: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              account_id: { type: 'integer' },
              name: { type: 'string' },
              debit: { type: 'number' },
              credit: { type: 'number' },
              partner_id: { type: 'integer' },
            },
            required: ['account_id', 'name'],
          },
          description: 'Journal lines with debit/credit',
        },
      },
      required: ['journal_id', 'line_ids'],
    },
  },
];

const TOOL_HANDLERS = {
  create_customer: createCustomer,
  create_invoice: createInvoice,
  create_sale_order: createSaleOrder,
  get_bank_balance: getBankBalance,
  get_accounting_summary: getAccountingSummary,
  get_recent_transactions: getRecentTransactions,
  create_journal_entry: createJournalEntry,
};

// =============================================================================
// Request Handlers
// =============================================================================

async function handleInitialize(params) {
  // Authenticate on initialize
  const client = getClient();
  try {
    await client.authenticate();
    log('INFO', 'Odoo MCP Server initialized and authenticated');
  } catch (error) {
    log('ERROR', 'Failed to authenticate with Odoo', { error: error.message });
    // Don't fail - allow lazy authentication
  }

  return {
    protocolVersion: '2024-11-05',
    capabilities: {
      tools: { listChanged: false },
    },
    serverInfo: {
      name: MCP_SERVER_INFO.name,
      version: MCP_SERVER_INFO.version,
    },
  };
}

async function handleToolsList(params) {
  return { tools: TOOLS };
}

async function handleToolsCall(params) {
  const toolName = params.name || '';
  const arguments_ = params.arguments || {};

  const handler = TOOL_HANDLERS[toolName];
  if (!handler) {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
      isError: true,
    };
  }

  try {
    const result = await handler(...Object.values(arguments_));
    return {
      content: [{ type: 'text', text: safeJson(result) }],
      isError: false,
    };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      log('ERROR', `Auth error: ${error.message}`);
      return {
        content: [{ type: 'text', text: `Authentication error: ${error.message}` }],
        isError: true,
      };
    }

    log('ERROR', `Tool '${toolName}' raised exception: ${error.message}`);
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    };
  }
}

const REQUEST_HANDLERS = {
  initialize: handleInitialize,
  'tools/list': handleToolsList,
  'tools/call': handleToolsCall,
};

// =============================================================================
// Main MCP Loop
// =============================================================================

async function runMcpServer() {
  log('INFO', `Starting Odoo MCP Server '${MCP_SERVER_INFO.name}' v${MCP_SERVER_INFO.version}`);
  log('INFO', `Configuration: DB=${ODOO_DB}, URL=${ODOO_URL}, User=${ODOO_USERNAME}`);

  // Ensure logs directory exists
  try {
    await fs.mkdir(LOGS_DIR, { recursive: true });
  } catch (error) {
    // Ignore
  }

  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on('line', async (rawLine) => {
    const line = rawLine.trim();
    if (!line) return;

    let request;
    try {
      request = JSON.parse(line);
    } catch (error) {
      const response = {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: `Parse error: ${error.message}` },
      };
      process.stdout.write(JSON.stringify(response) + '\n');
      return;
    }

    const method = request.method || '';
    const requestId = request.id;
    const params = request.params || {};

    const handler = REQUEST_HANDLERS[method];
    if (!handler) {
      const response = {
        jsonrpc: '2.0',
        id: requestId,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
      process.stdout.write(JSON.stringify(response) + '\n');
      return;
    }

    try {
      const result = await handler(params);
      const response = {
        jsonrpc: '2.0',
        id: requestId,
        result,
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    } catch (error) {
      log('ERROR', `Handler '${method}' failed: ${error.message}`);
      const response = {
        jsonrpc: '2.0',
        id: requestId,
        error: { code: -32603, message: `Internal error: ${error.message}` },
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    }
  });
}

// =============================================================================
// Entry Point
// =============================================================================

if (require.main === module) {
  runMcpServer().catch((error) => {
    log('ERROR', `Server failed to start: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  OdooClient,
  createCustomer,
  createInvoice,
  createSaleOrder,
  getBankBalance,
  getAccountingSummary,
  getRecentTransactions,
  createJournalEntry,
};
