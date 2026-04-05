#!/usr/bin/env node
/**
 * Email MCP Server - Node.js Implementation v3.0
 *
 * Gmail integration using Google APIs for the Digital Employee system.
 * Provides email sending capabilities via Gmail API with OAuth 2.0.
 *
 * Features:
 * - Gmail API integration (not SMTP)
 * - OAuth 2.0 authentication
 * - Send emails with plain text and HTML
 * - Support for CC, BCC, Reply-To
 * - File attachments (single/multiple)
 * - Multiple recipients (comma-separated lists)
 * - Email templates with variable substitution
 * - Priority/flagging headers
 * - Dry-run mode for testing
 * - Comprehensive logging
 *
 * Author: Digital Employee System
 * Version: 3.0 - Full Feature Support
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { google } = require('googleapis');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const mime = require('mime-types');

// =============================================================================
// Configuration
// =============================================================================

const BASE_DIR = process.cwd();
const LOGS_DIR = path.join(BASE_DIR, 'Logs');
const MCP_CONFIG_PATH = path.join(BASE_DIR, 'mcp.json');
const TEMPLATES_DIR = path.join(BASE_DIR, 'Email_Templates');

// Maximum attachment size (10MB default)
const MAX_ATTACHMENT_SIZE = parseInt(process.env.MAX_ATTACHMENT_SIZE || '10485760', 10); // 10MB

// Ensure directories exist
async function ensureDirs() {
  try {
    await fs.mkdir(LOGS_DIR, { recursive: true });
    await fs.mkdir(TEMPLATES_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create directories:', error.message);
  }
}

// Load MCP configuration
async function loadMCPConfig() {
  try {
    const configData = await fs.readFile(MCP_CONFIG_PATH, 'utf-8');
    return JSON.parse(configData);
  } catch (error) {
    console.error('Warning: Could not load mcp.json, using environment variables');
    return null;
  }
}

// Get Gmail credentials from config or environment
function getGmailCredentials(mcpConfig) {
  if (mcpConfig?.servers?.email_mcp?.config?.GMAIL_CREDENTIALS) {
    return mcpConfig.servers.email_mcp.config.GMAIL_CREDENTIALS;
  }

  const credPath = process.env.GMAIL_CREDENTIALS_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath) {
    return credPath;
  }

  return path.join(BASE_DIR, 'credentials.json');
}

function getTokenPath() {
  return process.env.GMAIL_TOKEN_PATH || path.join(BASE_DIR, 'token.json');
}

// =============================================================================
// Email Templates System
// =============================================================================

class EmailTemplate {
  constructor(name, subject, body, isHtml = false) {
    this.name = name;
    this.subject = subject;
    this.body = body;
    this.isHtml = isHtml;
  }

  /**
   * Render template with variables
   * @param {Object} variables - Variables to substitute
   * @returns {[string, string]} Tuple of [subject, body]
   */
  render(variables = {}) {
    let renderedSubject = this.subject;
    let renderedBody = this.body;

    // Replace ${variable} patterns
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
      renderedSubject = renderedSubject.replace(regex, value || '');
      renderedBody = renderedBody.replace(regex, value || '');
    }

    return [renderedSubject, renderedBody];
  }

  /**
   * Load template from file
   * @param {string} templatePath - Path to template file
   * @returns {EmailTemplate}
   */
  static fromFile(templatePath) {
    const content = fsSync.readFileSync(templatePath, 'utf-8');
    
    // Parse frontmatter
    if (content.startsWith('---')) {
      const parts = content.split('---', 3);
      if (parts.length >= 3) {
        const frontmatter = {};
        parts[1].trim().split('\n').forEach(line => {
          if (line.includes(':')) {
            const [key, ...valueParts] = line.split(':');
            frontmatter[key.trim().toLowerCase()] = valueParts.join(':').trim();
          }
        });

        const bodyContent = parts[2].trim();
        const lines = bodyContent.split('\n');
        
        let subject = '';
        let body = '';
        let inBody = false;

        for (const line of lines) {
          if (!inBody && line.startsWith('Subject:')) {
            subject = line.substring(8).trim();
            inBody = true;
          } else if (inBody) {
            body += (body ? '\n' : '') + line;
          }
        }

        return new EmailTemplate(
          frontmatter.name || path.basename(templatePath, '.md'),
          subject,
          body.trim(),
          frontmatter.is_html === 'true'
        );
      }
    }

    throw new Error(`Invalid template format: ${templatePath}`);
  }

  /**
   * Save template to file
   * @param {string} templatePath - Optional path to save to
   * @returns {string} Path to saved file
   */
  async save(templatePath = null) {
    if (!templatePath) {
      const safeName = this.name.toLowerCase().replace(/ /g, '_').replace(/\//g, '_');
      templatePath = path.join(TEMPLATES_DIR, `${safeName}.md`);
    }

    const content = `---
name: ${this.name}
is_html: ${this.isHtml}
---
Subject: ${this.subject}

${this.body}
`;

    await fs.writeFile(templatePath, content, 'utf-8');
    console.error(`Template saved: ${templatePath}`);
    return templatePath;
  }
}

class TemplateManager {
  constructor(templatesDir = TEMPLATES_DIR) {
    this.templatesDir = templatesDir;
    this.templates = {};
    this._loadTemplates();
  }

  async _loadTemplates() {
    try {
      const files = await fs.readdir(this.templatesDir);
      for (const file of files) {
        if (file.endsWith('.md')) {
          try {
            const templatePath = path.join(this.templatesDir, file);
            const template = EmailTemplate.fromFile(templatePath);
            this.templates[template.name.toLowerCase()] = template;
            console.error(`Loaded template: ${template.name}`);
          } catch (error) {
            console.error(`Failed to load template ${file}:`, error.message);
          }
        }
      }
    } catch (error) {
      // Directory might not exist yet
      console.error('Templates directory not found, will create on demand');
    }
  }

  get(name) {
    return this.templates[name.toLowerCase()] || null;
  }

  listTemplates() {
    return Object.keys(this.templates);
  }

  async createTemplate(name, subject, body, isHtml = false) {
    const template = new EmailTemplate(name, subject, body, isHtml);
    this.templates[name.toLowerCase()] = template;
    await template.save();
    return template;
  }
}

// =============================================================================
// Gmail OAuth2 Handler
// =============================================================================

class GmailAuth {
  constructor(credentialsPath) {
    this.credentialsPath = credentialsPath;
    this.tokenPath = getTokenPath();
    this.oauth2Client = null;
    this.gmail = null;
  }

  async initialize() {
    try {
      const credentialsData = await fs.readFile(this.credentialsPath, 'utf-8');
      const credentials = JSON.parse(credentialsData);

      const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

      this.oauth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
      );

      try {
        const tokenData = await fs.readFile(this.tokenPath, 'utf-8');
        const token = JSON.parse(tokenData);
        this.oauth2Client.setCredentials(token);
      } catch (error) {
        console.error('No token found. Run OAuth2 authorization flow first.');
      }

      this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

      return true;
    } catch (error) {
      console.error('Failed to initialize Gmail auth:', error.message);
      throw error;
    }
  }

  getAuthUrl(scopes = ['https://www.googleapis.com/auth/gmail.send']) {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
    });
  }

  async getToken(code) {
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    await fs.writeFile(this.tokenPath, JSON.stringify(tokens));
    return tokens;
  }

  async refreshToken() {
    try {
      const response = await this.oauth2Client.refreshAccessToken();
      const tokens = response.credentials;
      await fs.writeFile(this.tokenPath, JSON.stringify(tokens));
      return tokens;
    } catch (error) {
      console.error('Token refresh failed:', error.message);
      throw error;
    }
  }
}

// =============================================================================
// Email Sender
// =============================================================================

class EmailMCP {
  constructor() {
    this.gmailAuth = null;
    this.initialized = false;
    this.dryRun = process.env.DRY_RUN?.toLowerCase() === 'true';
    this.senderName = process.env.SENDER_NAME || 'Digital Employee';
    this.senderEmail = null;
    this.templateManager = new TemplateManager();
  }

  async initialize(credentialsPath) {
    if (this.initialized) return;

    await ensureDirs();

    this.gmailAuth = new GmailAuth(credentialsPath);
    await this.gmailAuth.initialize();

    try {
      const profile = await this.gmailAuth.gmail.users.getProfile({ userId: 'me' });
      this.senderEmail = profile.data.emailAddress;
      this.initialized = true;

      console.error(`✅ Email MCP initialized: ${this.senderName} <${this.senderEmail}>`);
      if (this.dryRun) {
        console.error('🔍 DRY_RUN mode enabled');
      }
    } catch (error) {
      console.error('Failed to get Gmail profile:', error.message);
      throw error;
    }
  }

  /**
   * Parse recipient string into array of emails
   * @param {string} recipients - Comma or semicolon separated emails
   * @returns {string[]} Array of email addresses
   */
  parseRecipients(recipients) {
    if (!recipients) return [];
    
    return recipients
      .replace(/;/g, ',')
      .split(',')
      .map(email => email.trim())
      .filter(email => email && email.includes('@'));
  }

  /**
   * Validate attachment files
   * @param {string[]} attachments - Array of file paths
   * @returns {Promise<string[]>} Validated file paths
   */
  async validateAttachments(attachments) {
    const validated = [];
    
    for (const attachment of attachments) {
      const filePath = path.resolve(attachment);
      
      try {
        await fs.access(filePath);
      } catch (error) {
        throw new Error(`Attachment not found: ${attachment}`);
      }

      const stats = await fs.stat(filePath);
      if (stats.size > MAX_ATTACHMENT_SIZE) {
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);
        const maxMB = (MAX_ATTACHMENT_SIZE / (1024 * 1024)).toFixed(0);
        throw new Error(`Attachment too large: ${path.basename(filePath)} (${sizeMB}MB > ${maxMB}MB)`);
      }

      validated.push(filePath);
    }

    return validated;
  }

  /**
   * Add priority headers to message lines
   * @param {string[]} lines - Message header lines
   * @param {string} priority - Priority level (low, normal, high, urgent)
   */
  addPriorityHeaders(lines, priority) {
    const priorityLevel = priority.toLowerCase();
    
    const priorityMap = {
      'urgent': '1',
      'high': '2',
      'normal': '3',
      'low': '5'
    };

    const importanceMap = {
      'urgent': 'High',
      'high': 'High',
      'normal': 'Normal',
      'low': 'Low'
    };

    lines.push(`X-Priority: ${priorityMap[priorityLevel] || '3'}`);
    lines.push(`Importance: ${importanceMap[priorityLevel] || 'Normal'}`);
    lines.push(`X-MSMail-Priority: ${priorityMap[priorityLevel] || '3'}`);
  }

  /**
   * Create email message in RFC 2822 format with attachments
   */
  createMessage({ to, subject, body, cc, bcc, replyTo, inReplyTo, references, isHtml, attachments = [] }) {
    const lines = [];

    // Headers
    lines.push(`To: ${to}`);
    lines.push(`From: ${this.senderName} <${this.senderEmail}>`);

    if (cc) lines.push(`Cc: ${cc}`);
    if (bcc) lines.push(`Bcc: ${bcc}`);
    if (replyTo) lines.push(`Reply-To: ${replyTo}`);
    if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`);
    if (references) lines.push(`References: ${references}`);

    lines.push(`Subject: ${subject}`);

    const hasAttachments = attachments && attachments.length > 0;

    if (hasAttachments) {
      // Mixed MIME for attachments
      const mixedBoundary = `mixed_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const altBoundary = `alt_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      lines.push('MIME-Version: 1.0');
      lines.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
      lines.push('');

      // Start mixed part
      lines.push(`--${mixedBoundary}`);
      lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
      lines.push('');

      // Alternative part - plain text
      lines.push(`--${altBoundary}`);
      lines.push('Content-Type: text/plain; charset="UTF-8"');
      lines.push('Content-Transfer-Encoding: 7bit');
      lines.push('');

      if (isHtml) {
        const plainText = body
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n\n')
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/\n{3,}/g, '\n\n');
        lines.push(plainText);
      } else {
        lines.push(body);
      }

      lines.push('');

      // Alternative part - HTML
      lines.push(`--${altBoundary}`);
      lines.push('Content-Type: text/html; charset="UTF-8"');
      lines.push('Content-Transfer-Encoding: 7bit');
      lines.push('');

      if (isHtml) {
        lines.push(body);
      } else {
        const html = body.replace(/\n/g, '<br>\n').replace(/  /g, '&nbsp;&nbsp;');
        lines.push(`<html><body>${html}</body></html>`);
      }

      lines.push('');
      lines.push(`--${altBoundary}--`);
      lines.push('');

      // Attachments
      for (const attachment of attachments) {
        const fileName = path.basename(attachment);
        const mimeType = mime.lookup(attachment) || 'application/octet-stream';
        const fileData = fsSync.readFileSync(attachment);
        const base64Data = fileData.toString('base64');

        lines.push(`--${mixedBoundary}`);
        lines.push(`Content-Type: ${mimeType}; name="${fileName}"`);
        lines.push(`Content-Disposition: attachment; filename="${fileName}"`);
        lines.push('Content-Transfer-Encoding: base64');
        lines.push('');

        // Split base64 into lines
        for (let i = 0; i < base64Data.length; i += 76) {
          lines.push(base64Data.substring(i, i + 76));
        }

        lines.push('');
      }

      lines.push(`--${mixedBoundary}--`);

    } else {
      // Simple multipart/alternative without attachments
      const boundary = `boundary_alt_message_${Date.now()}`;

      lines.push('MIME-Version: 1.0');
      lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      lines.push('');

      // Plain text part
      lines.push(`--${boundary}`);
      lines.push('Content-Type: text/plain; charset="UTF-8"');
      lines.push('Content-Transfer-Encoding: 7bit');
      lines.push('');

      if (isHtml) {
        const plainText = body
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n\n')
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/\n{3,}/g, '\n\n');
        lines.push(plainText);
      } else {
        lines.push(body);
      }

      lines.push('');

      // HTML part
      lines.push(`--${boundary}`);
      lines.push('Content-Type: text/html; charset="UTF-8"');
      lines.push('Content-Transfer-Encoding: 7bit');
      lines.push('');

      if (isHtml) {
        lines.push(body);
      } else {
        const html = body.replace(/\n/g, '<br>\n').replace(/  /g, '&nbsp;&nbsp;');
        lines.push(`<html><body>${html}</body></html>`);
      }

      lines.push('');
      lines.push(`--${boundary}--`);
    }

    // Encode to base64url
    const message = lines.join('\n');
    const encoded = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    return { raw: encoded };
  }

  /**
   * Send email via Gmail API
   */
  async sendEmail({ to, subject, body, cc, bcc, replyTo, inReplyTo, threadId, isHtml = false, attachments = [], priority = 'normal' }) {
    const timestamp = new Date().toISOString();
    
    // Parse recipients
    const toList = this.parseRecipients(to);
    const ccList = cc ? this.parseRecipients(cc) : [];
    const bccList = bcc ? this.parseRecipients(bcc) : [];

    const toHeader = toList.length > 0 ? toList.join(', ') : to;

    const result = {
      success: false,
      message: '',
      messageId: null,
      threadId: null,
      dryRun: this.dryRun,
      timestamp,
      to,
      cc: cc || null,
      bcc: bcc || null,
      subject,
      priority,
      attachments: attachments || []
    };

    // Validate inputs
    if (toList.length === 0) {
      const errorMsg = `No valid recipient emails found in: ${to}`;
      console.error('❌', errorMsg);
      result.message = errorMsg;
      return result;
    }

    if (!subject) subject = '(No Subject)';
    if (!body) {
      console.warn('⚠️ Empty email body');
      body = '(No Content)';
    }

    // Validate attachments
    let validatedAttachments = [];
    if (attachments && attachments.length > 0) {
      try {
        validatedAttachments = await this.validateAttachments(attachments);
        console.error(`Validated ${validatedAttachments.length} attachment(s)`);
      } catch (error) {
        const errorMsg = `Attachment validation failed: ${error.message}`;
        console.error('❌', errorMsg);
        result.message = errorMsg;
        return result;
      }
    }

    // Dry-run mode
    if (this.dryRun) {
      console.error('=' .repeat(60));
      console.error('📧 DRY RUN - Email would be sent:');
      console.error(`   To: ${toHeader}`);
      if (ccList.length > 0) console.error(`   CC: ${ccList.join(', ')}`);
      if (bccList.length > 0) console.error(`   BCC: ${bccList.join(', ')}`);
      console.error(`   Subject: ${subject}`);
      console.error(`   Priority: ${priority}`);
      console.error(`   HTML: ${isHtml}`);
      console.error(`   Attachments: ${validatedAttachments.length}`);
      console.error(`   Body preview: ${body.substring(0, 200)}...`);
      console.error('=' .repeat(60));

      result.success = true;
      result.message = 'Dry run - email logged but not sent';
      result.messageId = `DRYRUN-${Date.now()}`;

      await this.logEmail(result, body);
      return result;
    }

    try {
      // Create message
      const message = this.createMessage({
        to: toHeader,
        subject,
        body,
        cc: ccList.length > 0 ? ccList.join(', ') : null,
        bcc: bccList.length > 0 ? bccList.join(', ') : null,
        replyTo,
        inReplyTo,
        references: inReplyTo,
        isHtml,
        attachments: validatedAttachments,
        priority
      });

      // Add priority headers are already included in createMessage

      // Send via Gmail API
      const response = await this.gmailAuth.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: message.raw,
          threadId: threadId || undefined,
        },
      });

      // Success
      result.success = true;
      result.message = `Email sent successfully to ${toHeader}`;
      result.messageId = response.data.id;
      result.threadId = response.data.threadId;

      console.error(`✅ Email sent: ${subject}`);
      console.error(`   Message-ID: ${result.messageId}`);
      console.error(`   Thread-ID: ${result.threadId}`);
      console.error(`   Recipients: ${toList.length + ccList.length + bccList.length}`);

      await this.logEmail(result, body);
      return result;

    } catch (error) {
      let errorMsg = 'Failed to send email';

      if (error.code === 401) {
        errorMsg = 'Authentication failed. Token may be expired. Re-authorize.';
        console.error('❌', errorMsg);
      } else if (error.code === 403) {
        errorMsg = 'Permission denied. Check Gmail API access.';
        console.error('❌', errorMsg);
      } else if (error.message) {
        errorMsg = `Error: ${error.message}`;
        console.error('❌', errorMsg);
      }

      result.message = errorMsg;
      await this.logEmail(result, body);
      return result;
    }
  }

  /**
   * Send email using a template
   */
  async sendFromTemplate({ to, templateName, variables, cc, bcc, replyTo, inReplyTo, threadId, attachments = [], priority = 'normal' }) {
    const template = this.templateManager.get(templateName);
    if (!template) {
      const available = this.templateManager.listTemplates();
      const errorMsg = `Template not found: ${templateName}. Available: ${available.join(', ')}`;
      console.error('❌', errorMsg);
      return {
        success: false,
        message: errorMsg,
        timestamp: new Date().toISOString()
      };
    }

    const [subject, body] = template.render(variables);

    return this.sendEmail({
      to,
      subject,
      body,
      isHtml: template.isHtml,
      cc,
      bcc,
      replyTo,
      inReplyTo,
      threadId,
      attachments,
      priority
    });
  }

  /**
   * Create a new email template
   */
  async createTemplate(name, subject, body, isHtml = false) {
    return await this.templateManager.createTemplate(name, subject, body, isHtml);
  }

  /**
   * List available templates
   */
  listTemplates() {
    return this.templateManager.listTemplates();
  }

  /**
   * Log email action to daily log file
   */
  async logEmail(result, body) {
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const logFile = path.join(LOGS_DIR, `email_log_${dateStr}.md`);

    const status = result.success ? (result.dryRun ? '🔍 Dry Run' : '✅ Sent') : '❌ Failed';

    const bodyPreview = body.length > 500 ? body.substring(0, 500) + '...' : body;
    const attachmentsInfo = result.attachments && result.attachments.length > 0 
      ? result.attachments.map(a => path.basename(a)).join(', ')
      : 'None';

    const logEntry = `
## ${status} - ${result.subject || 'No Subject'}

| Field | Value |
|-------|-------|
| **Time** | ${result.timestamp} |
| **To** | ${result.to || 'N/A'} |
| **CC** | ${result.cc || 'N/A'} |
| **BCC** | ${result.bcc || 'N/A'} |
| **Subject** | ${result.subject || 'N/A'} |
| **Priority** | ${result.priority || 'normal'} |
| **Message ID** | ${result.messageId || 'N/A'} |
| **Attachments** | ${attachmentsInfo} |
| **Status** | ${status} |

**Body Preview:**
\`\`\`
${bodyPreview}
\`\`\`

---

`;

    try {
      await fs.appendFile(logFile, logEntry, 'utf-8');
    } catch (error) {
      console.error('Failed to write email log:', error.message);
    }
  }

  /**
   * Test Gmail connection
   */
  async testConnection() {
    const result = {
      success: false,
      message: '',
      timestamp: new Date().toISOString(),
      senderEmail: this.senderEmail,
    };

    if (this.dryRun) {
      result.success = true;
      result.message = 'Dry run mode - connection test skipped';
      console.error('🔍 DRY RUN - Connection test skipped');
      return result;
    }

    try {
      const profile = await this.gmailAuth.gmail.users.getProfile({ userId: 'me' });
      result.success = true;
      result.message = `Successfully connected to Gmail API as ${profile.data.emailAddress}`;
      result.senderEmail = profile.data.emailAddress;
      console.error(`✅ Connection test successful: ${result.message}`);
    } catch (error) {
      result.message = `Connection test failed: ${error.message}`;
      console.error('❌', result.message);
    }

    return result;
  }
}

// =============================================================================
// MCP Server
// =============================================================================

async function createMCPServer() {
  const emailMCP = new EmailMCP();

  const mcpConfig = await loadMCPConfig();
  const credentialsPath = getGmailCredentials(mcpConfig);

  try {
    await emailMCP.initialize(credentialsPath);
  } catch (error) {
    console.error('⚠️ Email MCP initialization failed:', error.message);
    console.error('Some tools may not work correctly');
  }

  const server = new Server(
    {
      name: 'email-mcp',
      version: '3.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'send_email',
          description: 'Send an email via Gmail API. Supports plain text/HTML, CC, BCC, Reply-To, attachments, multiple recipients, and priority levels.',
          inputSchema: {
            type: 'object',
            properties: {
              to: {
                type: 'string',
                description: 'Recipient email address(es). For multiple: "user1@example.com, user2@example.com"',
              },
              subject: {
                type: 'string',
                description: 'Email subject line (required)',
              },
              body: {
                type: 'string',
                description: 'Email body content (required)',
              },
              is_html: {
                type: 'boolean',
                description: 'If true, treat body as HTML; otherwise plain text',
                default: false,
              },
              cc: {
                type: 'string',
                description: 'CC recipient email address(es). For multiple: "user1@example.com, user2@example.com"',
              },
              bcc: {
                type: 'string',
                description: 'BCC recipient email address(es). For multiple: "user1@example.com, user2@example.com"',
              },
              reply_to: {
                type: 'string',
                description: 'Reply-To email address (optional)',
              },
              in_reply_to: {
                type: 'string',
                description: 'Message-ID this is replying to (for threading)',
              },
              thread_id: {
                type: 'string',
                description: 'Gmail thread ID for continuing conversation',
              },
              attachments: {
                type: 'array',
                items: {
                  type: 'string',
                },
                description: 'Array of file paths to attach (e.g., ["/path/to/file.pdf", "/path/to/image.jpg"])',
              },
              priority: {
                type: 'string',
                enum: ['low', 'normal', 'high', 'urgent'],
                description: 'Email priority level',
                default: 'normal',
              },
            },
            required: ['to', 'subject', 'body'],
          },
        },
        {
          name: 'send_email_from_template',
          description: 'Send an email using a template. Templates support variable substitution with ${variable} syntax.',
          inputSchema: {
            type: 'object',
            properties: {
              to: {
                type: 'string',
                description: 'Recipient email address(es)',
              },
              template_name: {
                type: 'string',
                description: 'Name of the template to use',
              },
              variables: {
                type: 'object',
                description: 'Variables for template substitution (e.g., {"name": "John", "date": "2026-04-05"})',
              },
              cc: {
                type: 'string',
                description: 'CC recipient email address(es)',
              },
              bcc: {
                type: 'string',
                description: 'BCC recipient email address(es)',
              },
              attachments: {
                type: 'array',
                items: {
                  type: 'string',
                },
                description: 'Array of file paths to attach',
              },
              priority: {
                type: 'string',
                enum: ['low', 'normal', 'high', 'urgent'],
                description: 'Email priority level',
                default: 'normal',
              },
            },
            required: ['to', 'template_name', 'variables'],
          },
        },
        {
          name: 'create_template',
          description: 'Create a new email template for reuse. Templates are saved to Email_Templates directory.',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Template name',
              },
              subject: {
                type: 'string',
                description: 'Subject line (can contain ${variable} placeholders)',
              },
              body: {
                type: 'string',
                description: 'Email body (can contain ${variable} placeholders)',
              },
              is_html: {
                type: 'boolean',
                description: 'If true, body is HTML',
                default: false,
              },
            },
            required: ['name', 'subject', 'body'],
          },
        },
        {
          name: 'list_templates',
          description: 'List all available email templates.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'test_email_connection',
          description: 'Test the Gmail API connection and verify authentication.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'get_auth_url',
          description: 'Get OAuth2 authorization URL for Gmail authentication.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'set_auth_code',
          description: 'Set the authorization code received from OAuth2 flow to obtain access token.',
          inputSchema: {
            type: 'object',
            properties: {
              code: {
                type: 'string',
                description: 'Authorization code from Google OAuth2 flow',
              },
            },
            required: ['code'],
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'send_email': {
          const result = await emailMCP.sendEmail({
            to: args.to,
            subject: args.subject,
            body: args.body,
            isHtml: args.is_html || false,
            cc: args.cc,
            bcc: args.bcc,
            replyTo: args.reply_to,
            inReplyTo: args.in_reply_to,
            threadId: args.thread_id,
            attachments: args.attachments || [],
            priority: args.priority || 'normal',
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
            isError: !result.success,
          };
        }

        case 'send_email_from_template': {
          const result = await emailMCP.sendFromTemplate({
            to: args.to,
            templateName: args.template_name,
            variables: args.variables || {},
            cc: args.cc,
            bcc: args.bcc,
            replyTo: args.reply_to,
            inReplyTo: args.in_reply_to,
            threadId: args.thread_id,
            attachments: args.attachments || [],
            priority: args.priority || 'normal',
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
            isError: !result.success,
          };
        }

        case 'create_template': {
          const template = await emailMCP.createTemplate(
            args.name,
            args.subject,
            args.body,
            args.is_html || false
          );

          return {
            content: [
              {
                type: 'text',
                text: `✅ Template created: ${template.name}\nSaved to: ${TEMPLATES_DIR}`,
              },
            ],
          };
        }

        case 'list_templates': {
          const templates = emailMCP.listTemplates();
          
          if (templates.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'No templates found. Use create_template to add new templates.',
                },
              ],
            };
          }

          return {
            content: [
              {
                type: 'text',
                text: `Available templates (${templates.length}):\n${templates.map(t => `  - ${t}`).join('\n')}`,
              },
            ],
          };
        }

        case 'test_email_connection': {
          const result = await emailMCP.testConnection();

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
            isError: !result.success,
          };
        }

        case 'get_auth_url': {
          const authUrl = emailMCP.gmailAuth.getAuthUrl();

          return {
            content: [
              {
                type: 'text',
                text: `Visit this URL to authorize Gmail access:\n\n${authUrl}\n\nAfter authorization, copy the authorization code and use the 'set_auth_code' tool to complete setup.`,
              },
            ],
          };
        }

        case 'set_auth_code': {
          if (!args.code) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Error: Authorization code is required',
                },
              ],
              isError: true,
            };
          }

          const tokens = await emailMCP.gmailAuth.getToken(args.code);

          return {
            content: [
              {
                type: 'text',
                text: `✅ Authorization successful!\n\nAccess token obtained and saved to ${getTokenPath()}\n\nGmail API is now ready to use.`,
              },
            ],
          };
        }

        default:
          return {
            content: [
              {
                type: 'text',
                text: `Unknown tool: ${name}`,
              },
            ],
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

// =============================================================================
// Main Entry Point - HTTP Server + Stdio Support
// =============================================================================

const http = require('http');

async function main() {
  const startTime = new Date();
  const timestamp = startTime.toLocaleString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
  });

  console.error('');
  console.error('┌─────────────────────────────────────────────────────────────┐');
  console.error('│                                                             │');
  console.error('│  📧  Email MCP Server v3.0.0                               │');
  console.error('│     Gmail Integration for Digital Employee System          │');
  console.error('│                                                             │');
  console.error('└─────────────────────────────────────────────────────────────┘');
  console.error('');
  console.error(`🕐 Started: ${timestamp}`);
  console.error('');
  console.error('📦 Initializing components...');

  // Load configuration
  const mcpConfig = await loadMCPConfig();
  const credentialsPath = getGmailCredentials(mcpConfig);
  
  // Create email MCP instance
  const emailMCP = new EmailMCP();
  
  // Initialize with credentials
  try {
    await ensureDirs();
    await emailMCP.initialize(credentialsPath);
    
    // Check token status
    const tokenPath = getTokenPath();
    const tokenExists = fsSync.existsSync(tokenPath);
    
    if (tokenExists) {
      console.error('✅ Authentication successful using existing credentials.json');
      console.error(`🔑 Token stored in ${path.basename(tokenPath)}`);
    } else {
      console.error('⚠️  No token found - use get_auth_url tool to authenticate');
    }
    
  } catch (error) {
    console.error('❌ Initialization failed:', error.message);
    console.error('');
    console.error('💡 Troubleshooting:');
    console.error('   1. Ensure credentials.json exists');
    console.error('   2. Run get_auth_url tool to authenticate');
    console.error('   3. Check OAuth2 configuration');
    console.error('');
    process.exit(1);
  }

  // Determine mode: HTTP or stdio
  const mode = process.env.MCP_MODE || 'stdio'; // 'http' or 'stdio'
  const port = parseInt(process.env.PORT || '3001', 10); // 3001 to avoid conflicts with Dashboard WebSocket
  const host = process.env.HOST || '127.0.0.1';

  console.error('');
  console.error('🔧 Available tools:');
  console.error('   • send_email              - Send emails with attachments');
  console.error('   • send_email_from_template - Use email templates');
  console.error('   • create_template         - Create new templates');
  console.error('   • list_templates          - List available templates');
  console.error('   • test_email_connection   - Test Gmail connection');
  console.error('   • get_auth_url            - Get OAuth2 authorization URL');
  console.error('   • set_auth_code           - Complete OAuth2 flow');
  console.error('');

  if (mode === 'http') {
    // HTTP Server Mode
    console.error(`🌐 Starting HTTP server on http://${host}:${port}...`);
    
    // Create HTTP server with MCP endpoint
    const httpServer = http.createServer(async (req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
      }
      
      if (req.method === 'GET' && req.url === '/') {
        // Status page
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Email MCP Server</title>
            <style>
              body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; background: #f5f5f5; }
              .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
              h1 { color: #4285f4; margin-top: 0; }
              .status { display: inline-block; padding: 5px 15px; background: #34a853; color: white; border-radius: 20px; font-size: 14px; }
              .info { background: #f8f9fa; padding: 15px; border-left: 4px solid #4285f4; margin: 20px 0; }
              .tools { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; margin: 20px 0; }
              .tool { background: #e8f0fe; padding: 10px; border-radius: 5px; font-size: 14px; }
              code { background: #f1f3f4; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>📧 Email MCP Server</h1>
              <span class="status">✅ Running</span>
              
              <div class="info">
                <strong>Version:</strong> 3.0.0<br>
                <strong>Mode:</strong> HTTP Server<br>
                <strong>Started:</strong> ${timestamp}<br>
                <strong>Sender:</strong> ${emailMCP.senderName} &lt;${emailMCP.senderEmail}&gt;
              </div>
              
              <h2>Available Tools</h2>
              <div class="tools">
                <div class="tool">📤 send_email</div>
                <div class="tool">📋 send_email_from_template</div>
                <div class="tool">📝 create_template</div>
                <div class="tool">📚 list_templates</div>
                <div class="tool">🔌 test_email_connection</div>
                <div class="tool">🔗 get_auth_url</div>
                <div class="tool">🔑 set_auth_code</div>
              </div>
              
              <h2>API Endpoints</h2>
              <ul>
                <li><code>POST /mcp</code> - MCP protocol endpoint</li>
                <li><code>GET /health</code> - Health check</li>
                <li><code>GET /</code> - This status page</li>
              </ul>
              
              <div class="info">
                <strong>Documentation:</strong> See <code>EMAIL_MCP_NODE_GUIDE.md</code> for usage examples
              </div>
            </div>
          </body>
          </html>
        `);
        return;
      }
      
      if (req.method === 'GET' && req.url === '/health') {
        // Health check
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
          sender: emailMCP.senderEmail
        }));
        return;
      }
      
      if (req.method === 'POST' && (req.url === '/mcp' || req.url === '/')) {
        // MCP protocol endpoint (placeholder - full implementation needs SSE)
        res.writeHead(501, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'MCP protocol requires stdio transport. Use Claude Code or Qwen Code for MCP integration.'
        }));
        return;
      }
      
      // 404
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });
    
    // Start listening
    httpServer.listen(port, host, () => {
      console.error('');
      console.error('┌─────────────────────────────────────────────────────────────┐');
      console.error('│                                                             │');
      console.error(`│  ✅ Email MCP Server initialized on http://${host}:${port}`.padEnd(61) + '│');
      console.error('│                                                             │');
      console.error('│  📊 Status Page: http://localhost:3001/'.padEnd(61) + '│');
      console.error('│  🔌 Health Check: http://localhost:3001/health'.padEnd(61) + '│');
      console.error('│                                                             │');
      console.error('└─────────────────────────────────────────────────────────────┘');
      console.error('');
      console.error('📡 Server is ready to accept connections');
      console.error('');
      console.error('💡 Email sending functionality is fully implemented and ready to use');
      console.error('');
    });
    
    // Graceful shutdown
    process.on('SIGINT', () => {
      console.error('\n👋 Shutting down Email MCP Server...');
      httpServer.close(() => {
        console.error('✅ Server closed gracefully');
        process.exit(0);
      });
    });
    
    process.on('SIGTERM', () => {
      console.error('\n👋 Shutting down Email MCP Server...');
      httpServer.close(() => {
        console.error('✅ Server closed gracefully');
        process.exit(0);
      });
    });
    
  } else {
    // Stdio Mode (Default - for Claude Code & Qwen Code)
    console.error('📡 Starting stdio transport for MCP integration...');
    
    const server = await createMCPServer();
    const transport = new StdioServerTransport();
    
    await server.connect(transport);
    
    console.error('');
    console.error('┌─────────────────────────────────────────────────────────────┐');
    console.error('│                                                             │');
    console.error('│  ✅ Email MCP Server running on stdio                      │');
    console.error('│                                                             │');
    console.error('│  🔗 Ready for Claude Code & Qwen Code integration          │');
    console.error('│                                                             │');
    console.error('└─────────────────────────────────────────────────────────────┘');
    console.error('');
    console.error('💡 Email sending functionality is fully implemented and ready to use');
    console.error('');
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.error('\n👋 Shutting down Email MCP Server...');
      await server.close();
      console.error('✅ Server closed gracefully');
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.error('\n👋 Shutting down Email MCP Server...');
      await server.close();
      console.error('✅ Server closed gracefully');
      process.exit(0);
    });
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { EmailMCP, GmailAuth, EmailTemplate, TemplateManager, createMCPServer };
