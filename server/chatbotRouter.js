const express = require('express');
const router = express.Router();
const { streamChatResponse } = require('./chatbotService');
const { getDashboardContext } = require('./chatbotContext');

function parseAction(fullText) {
  const match = fullText.match(/<ACTION>\s*([\s\S]*?)\s*<\/ACTION>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch (e) {
    return null;
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

    for await (const chunk of streamChatResponse(messages, context)) {
      fullText += chunk;
      sendEvent({ type: 'chunk', text: chunk });
    }

    const action = parseAction(fullText);
    if (action) {
      executeAction(action, _eventBus);
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
