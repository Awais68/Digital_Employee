const express = require("express");
const router = express.Router();
const { streamChatResponse } = require("./chatbotService");
const { getDashboardContext } = require("./chatbotContext");
const fs = require("fs");
const path = require("path");

// DB connection (ESM with named exports — Node >= 22.12 supports require() of ESM)
let db = null;
async function getDb() {
  if (!db) db = require("../vault-control/server/database/connection.js");
  return db;
}

// ─── Action parser ────────────────────────────────────────────────────────────
function parseAction(fullText) {
  const match = fullText.match(/<ACTION>\s*([\s\S]*?)\s*<\/ACTION>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch {
    return null;
  }
}

// ─── Individual action handlers ───────────────────────────────────────────────

async function handleAddTodo(action, eventBus) {
  const db = await getDb();
  const result = await db.query(
    `INSERT INTO todos (title, description, priority, status, source)
     VALUES ($1, $2, $3, 'pending', 'chatbot')
     RETURNING id, title, priority, status, created_at`,
    [
      action.title || "New Task",
      action.description || "",
      ["high", "medium", "low"].includes(action.priority)
        ? action.priority
        : "medium",
    ],
  );
  const todo = result.rows[0];
  eventBus?.emit("todo:created", todo);
  global.wsBroadcast?.({ type: "todo:new", todo });
  return { success: true, todo };
}

async function handleCreateDraft(action, eventBus) {
  const db = await getDb();
  const result = await db.query(
    `INSERT INTO scheduled_posts (platform, content, topic, status)
     VALUES ($1, $2, $3, 'draft')
     RETURNING id, platform, content, topic, status, created_at`,
    [
      action.platform || "linkedin",
      action.content || "",
      action.topic || action.platform || "general",
    ],
  );
  const post = result.rows[0];
  eventBus?.emit("post:generated", post);
  global.wsBroadcast?.({ type: "post:new", post });
  return { success: true, post };
}

async function handleApproveDraft(action, eventBus) {
  const db = await getDb();
  const result = await db.query(
    `UPDATE scheduled_posts SET status='approved' WHERE id=$1
     RETURNING id, platform, content, status`,
    [action.draftId],
  );
  if (result.rows.length === 0)
    return { success: false, error: "Draft not found" };
  const post = result.rows[0];
  eventBus?.emit("post:approved", post);
  global.wsBroadcast?.({ type: "post:approved", post });
  return { success: true, post };
}

async function handleCheckEmails(action) {
  const db = await getDb();
  const filter = action.filter || "unread";
  let whereClause = "";
  if (filter === "unread") whereClause = `WHERE status='unread'`;
  else if (filter === "important")
    whereClause = `WHERE category='important' OR status='urgent'`;

  const result = await db.query(
    `SELECT id, msg_id, from_address, subject, snippet, status, received_at
     FROM emails ${whereClause}
     ORDER BY received_at DESC LIMIT 10`,
  );
  return { success: true, emails: result.rows, filter };
}

async function handleCreateInvoice(action, eventBus) {
  // Creates a pending invoice + approval request. Human must approve.
  const db = await getDb();
  const customer = action.customer || "Unknown Customer";
  const amount = action.amount || 0;
  const description = action.description || "";
  const customerEmail = action.customerEmail || "";

  // 1. Create a todo for the invoice
  const todoResult = await db.query(
    `INSERT INTO todos (title, description, priority, status, source)
     VALUES ($1, $2, 'high', 'pending', 'chatbot')
     RETURNING id, title, priority, status, created_at`,
    [`Invoice: ${customer} - $${amount}`, description],
  );
  const todo = todoResult.rows[0];
  eventBus?.emit("todo:created", todo);

  // 2. Create approval file in Pending_Approval/
  const vaultPath = process.env.VAULT_PATH || ".";
  const approvalDir = path.join(vaultPath, "Pending_Approval");
  fs.mkdirSync(approvalDir, { recursive: true });

  const approvalFile = path.join(
    approvalDir,
    `INVOICE_${Date.now()}_${customer.replace(/[^a-zA-Z0-9]/g, "_")}.md`,
  );

  const lineItems = action.lineItems
    ? action.lineItems
        .map((li) => `| ${li.description || "Service"} | ${li.quantity || 1} | $${li.price || amount} |`)
        .join("\n")
    : `| ${description || "Service"} | 1 | $${amount} |`;

  const approvalContent = `---
type: invoice
customer: ${customer}
amount: ${amount}
description: ${description}
customer_email: ${customerEmail}
status: pending_approval
created: ${new Date().toISOString()}
action: send_invoice
todo_id: ${todo.id}
---

## Invoice: ${customer}

| Item | Qty | Price |
|------|-----|-------|
${lineItems}

**Total: $${amount}**

Move to /Approved/ to send this invoice.
`;

  fs.writeFileSync(approvalFile, approvalContent, "utf-8");
  console.log(`[chatbotRouter] Invoice approval file created: ${approvalFile}`);

  // 3. Broadcast
  global.wsBroadcast?.({
    type: "invoice:created",
    invoice: { customer, amount, description, todo_id: todo.id, file: approvalFile },
  });
  eventBus?.emit("invoice:created", { customer, amount, todo, file: approvalFile });

  return { success: true, todo, file: approvalFile };
}

async function handleSendWhatsApp(action, eventBus) {
  // WhatsApp send — eventBus se handle hota hai (whatsappService)
  eventBus?.emit("chatbot:send_whatsapp", {
    phone: action.phone,
    message: action.message,
  });
  return { success: true, queued: true };
}

// ─── Main action executor ─────────────────────────────────────────────────────
async function executeAction(action, eventBus) {
  if (!action) return null;
  try {
    switch (action.type) {
      case "ADD_TODO":
        return await handleAddTodo(action, eventBus);
      case "CREATE_DRAFT":
        return await handleCreateDraft(action, eventBus);
      case "APPROVE_DRAFT":
        return await handleApproveDraft(action, eventBus);
      case "CHECK_EMAILS":
        return await handleCheckEmails(action);
      case "CREATE_INVOICE":
        return await handleCreateInvoice(action, eventBus);
      case "SEND_WHATSAPP":
        return await handleSendWhatsApp(action, eventBus);
      default:
        console.warn("[chatbotRouter] Unknown action type:", action.type);
        return null;
    }
  } catch (err) {
    console.error("[chatbotRouter] Action failed:", action.type, err.message);
    return { success: false, error: err.message };
  }
}

// ─── EventBus injection ───────────────────────────────────────────────────────
let _eventBus = null;
function setEventBus(bus) {
  _eventBus = bus;
}

// ─── SSE Streaming endpoint ───────────────────────────────────────────────────
router.post("/chat/stream", async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  let fullText = "";

  try {
    const context = await getDashboardContext();
    send({ type: "thinking", message: "Processing..." });

    for await (const chunk of streamChatResponse(messages, context)) {
      fullText += chunk;
      send({ type: "chunk", text: chunk });
    }

    // Parse & execute action
    const action = parseAction(fullText);
    if (action) {
      const result = await executeAction(action, _eventBus);

      // Send action event to frontend
      send({ type: "action", action, result });

      // Special: email results ko structured format mein bhejo
      if (action.type === "CHECK_EMAILS" && result?.success) {
        send({
          type: "email_status",
          data: {
            total: result.emails.length,
            filter: result.filter,
            emails: result.emails.map((e) => ({
              id: e.msg_id || e.id,
              subject: e.subject || "(no subject)",
              from: e.from_address || "Unknown",
              snippet: e.snippet || "",
              status: e.status,
              date: e.received_at,
            })),
          },
        });
      }

      // Todo created → frontend update
      if (action.type === "ADD_TODO" && result?.success) {
        send({ type: "todo_created", todo: result.todo });
      }

      // Draft created → frontend update
      if (action.type === "CREATE_DRAFT" && result?.success) {
        send({ type: "draft_created", post: result.post });
      }

      // Invoice created → frontend update
      if (action.type === "CREATE_INVOICE" && result?.success) {
        send({ type: "invoice_created", invoice: result });
      }
    }

    send({ type: "done" });
    res.end();
  } catch (err) {
    console.error("[chatbotRouter] Stream error:", err.message);
    send({ type: "error", message: err.message });
    res.end();
  }
});

module.exports = { router, setEventBus };
