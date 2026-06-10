const express = require('express');
const router = express.Router();
const { streamChatResponse } = require('./chatbotService');
const { getDashboardContext } = require('./chatbotContext');
const fs = require('fs');
const path = require('path');

function parseAction(fullText) {
  const match = fullText.match(/<ACTION>\s*([\s\S]*?)\s*<\/ACTION>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch (e) {
    return null;
  }
}

// Fetch emails from vault Inbox folder
function fetchEmailsFromVault(filter = 'all') {
  try {
    const vaultPath = process.env.VAULT_PATH || process.cwd();
    const inboxPath = path.join(vaultPath, 'Inbox');
    
    if (!fs.existsSync(inboxPath)) {
      return { success: true, emails: [], message: 'Inbox folder not found' };
    }

    const files = fs.readdirSync(inboxPath).filter(f => f.endsWith('.md'));
    const emails = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(inboxPath, file), 'utf-8');
        const lines = content.split('\n');
        
        // Parse YAML frontmatter
        let frontmatter = {};
        let inFrontmatter = false;
        let bodyStart = 0;
        
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].trim() === '---') {
            if (!inFrontmatter) {
              inFrontmatter = true;
              continue;
            } else {
              bodyStart = i + 1;
              break;
            }
          }
          if (inFrontmatter) {
            const match = lines[i].match(/^(\w+):\s*(.+)/);
            if (match) {
              frontmatter[match[1]] = match[2].trim();
            }
          }
        }

        const body = lines.slice(bodyStart).join('\n').trim();
        const isEmail = file.startsWith('EMAIL_') || 
                       frontmatter.type === 'email' ||
                       frontmatter.from ||
                       frontmatter.subject;

        if (isEmail) {
          emails.push({
            id: file.replace('.md', ''),
            from: frontmatter.from || 'Unknown',
            subject: frontmatter.subject || file.replace('.md', '').replace(/_/g, ' '),
            priority: frontmatter.priority || 'medium',
            status: frontmatter.status || 'unread',
            date: frontmatter.created || frontmatter.date || 'Unknown',
            preview: body.substring(0, 100).replace(/\n/g, ' '),
          });
        }
      } catch (e) {
        // Skip unreadable files
      }
    }

    // Apply filter
    let filteredEmails = emails;
    if (filter === 'unread') {
      filteredEmails = emails.filter(e => e.status === 'unread' || e.status === 'new');
    } else if (filter === 'important') {
      filteredEmails = emails.filter(e => e.priority === 'high' || e.priority === 'urgent');
    }

    // Sort by date (newest first)
    filteredEmails.sort((a, b) => b.date.localeCompare(a.date));

    return {
      success: true,
      emails: filteredEmails.slice(0, 10), // Return max 10 emails
      total: filteredEmails.length,
      filter: filter,
    };
  } catch (err) {
    return { success: false, error: err.message, emails: [] };
  }
}

function executeAction(action, eventBus) {
  if (!eventBus || !action) return;
  const typeMap = {
    ADD_TODO: 'add_todo',
    CREATE_DRAFT: 'create_draft',
    SEND_WHATSAPP: 'send_whatsapp',
    APPROVE_DRAFT: 'approve_draft',
    CHECK_EMAILS: 'check_emails',
  };
  const eventName = typeMap[action.type];
  if (eventName) {
    eventBus.emit(eventName, action);
  }
}

// eventBus inject karne ka function — server/index.js se call hoga
let _eventBus = null;
function setEventBus(bus) {
  _eventBus = bus;
}

// SSE Streaming endpoint
router.post('/chat/stream', async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let fullText = '';

  try {
    const context = await getDashboardContext();

    // Send thinking event while processing
    sendEvent({ type: 'thinking', message: 'Processing...' });

    for await (const chunk of streamChatResponse(messages, context)) {
      fullText += chunk;
      sendEvent({ type: 'chunk', text: chunk });
    }

    const action = parseAction(fullText);
    if (action) {
      executeAction(action, _eventBus);
      
      // Handle CHECK_EMAILS action - return actual email data
      if (action.type === 'CHECK_EMAILS') {
        const filter = action.filter || 'all';
        const emailResult = fetchEmailsFromVault(filter);
        
        if (emailResult.success && emailResult.emails.length > 0) {
          const emailSummary = emailResult.emails.map((e, i) => 
            `${i + 1}. 📧 **${e.subject}**\n   From: ${e.from} | Priority: ${e.priority} | Status: ${e.status}\n   Date: ${e.date}`
          ).join('\n\n');
          
          sendEvent({ 
            type: 'email_status', 
            data: {
              total: emailResult.total,
              filter: emailResult.filter,
              emails: emailResult.emails,
              summary: `Found ${emailResult.total} emails (${filter}):\n\n${emailSummary}`
            }
          });
        } else if (emailResult.success) {
          sendEvent({ 
            type: 'email_status', 
            data: {
              total: 0,
              filter: filter,
              emails: [],
              summary: `No ${filter} emails found in Inbox.`
            }
          });
        } else {
          sendEvent({ 
            type: 'email_status', 
            data: {
              total: 0,
              emails: [],
              summary: `Error checking emails: ${emailResult.error}`
            }
          });
        }
      }
      
      sendEvent({ type: 'action', action });
    }

    sendEvent({ type: 'done' });
    res.end();
  } catch (err) {
    console.error('[chatbotRouter] Stream error:', err.message);
    sendEvent({ type: 'error', message: err.message });
    res.end();
  }
});

module.exports = { router, setEventBus };
