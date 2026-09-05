const express = require("express");
const router = express.Router();
const { streamChatResponse } = require("./chatbotService");
const { getDashboardContext } = require("./chatbotContext");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const ENABLE_AUTH = process.env.ENABLE_AUTH === "true";

// Actions that leave the building (real mail, real posts). When auth is on these
// require an admin; read-only + vault-local actions stay open like the rest of /chat.
const OUTWARD_ACTIONS = new Set(["SEND_EMAIL", "PUBLISH_POST", "SEND_WHATSAPP"]);

// DB connection (ESM with named exports — Node >= 22.12 supports require() of ESM)
let db = null;
async function getDb() {
  if (!db) db = require("../vault-control/server/database/connection.js");
  return db;
}

// Dashboard notification. Delegates to notificationService so the in-memory
// store, the WebSocket broadcast and the DB row all stay in sync — and so the
// notifications table's app-generated string id is produced in one place only.
async function notifyDashboard(type, title, message, data = {}) {
  try {
    const { notify } = await import(
      "../vault-control/server/services/notificationService.js"
    );
    notify(type, title, message, data);
  } catch (e) {
    console.warn("[chatbotRouter] notify failed:", e.message);
  }
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


// ─── SEND_EMAIL ───────────────────────────────────────────────────────────────
// Real SMTP send, delegated to scripts/chatbot_send_email.py (email_mcp.py owns
// the SMTP config, templates, retry and audit logging — no reason to duplicate
// that in Node). JSON in on stdin, one JSON object out on stdout.
function runEmailScript(payload) {
  return new Promise((resolve, reject) => {
    const script = path.join(PROJECT_ROOT, "scripts", "chatbot_send_email.py");
    const proc = spawn(process.env.PYTHON_BIN || "python3", [script], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        // email_mcp.py reads DRY_RUN from .env.<AI_ENV>; the chatbot decides
        // per-send instead, via the dry_run field in the payload.
        AI_ENV: process.env.AI_ENV || "development",
      },
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("Email send timed out after 60s"));
    }, 60_000);

    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`Could not run email helper: ${e.message}`));
    });
    proc.on("close", () => {
      clearTimeout(timer);
      const line = stdout.trim().split("\n").filter(Boolean).pop();
      if (!line) {
        return reject(new Error(stderr.trim().slice(0, 300) || "Email helper produced no output"));
      }
      try {
        resolve(JSON.parse(line));
      } catch {
        reject(new Error(`Unparseable email helper output: ${line.slice(0, 200)}`));
      }
    });

    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
  });
}

async function handleSendEmail(action, eventBus) {
  const to = (action.to || "").trim();
  if (!to || !to.includes("@")) {
    return { success: false, error: `Invalid recipient address: "${to || "(empty)"}"` };
  }
  if (!action.subject?.trim()) return { success: false, error: "Subject is required" };
  if (!action.body?.trim()) return { success: false, error: "Body is required" };

  // Default is a REAL send. Set CHATBOT_EMAIL_DRY_RUN=true to log-only.
  const dryRun = process.env.CHATBOT_EMAIL_DRY_RUN === "true";

  const result = await runEmailScript({
    to,
    subject: action.subject,
    body: action.body,
    cc: action.cc || null,
    bcc: action.bcc || null,
    is_html: !!action.isHtml,
    priority: action.priority || "normal",
    dry_run: dryRun,
  });

  if (!result.success) {
    return { success: false, error: result.error || result.message || "Email send failed" };
  }

  // Leave a trace in the dashboard so a sent mail is visible outside the chat.
  await notifyDashboard(
    "success",
    `Email sent: ${action.subject}`,
    `To ${to}${result.dry_run ? " (dry run — not actually delivered)" : ""}`,
    { to, subject: action.subject, dryRun: !!result.dry_run },
  );

  const payload = { to, subject: action.subject, dryRun: !!result.dry_run };
  eventBus?.emit("email:sent", payload);
  global.wsBroadcast?.({ type: "email:sent", email: payload });

  return { success: true, ...payload, message: result.message };
}

// ─── PUBLISH_POST ─────────────────────────────────────────────────────────────
// Actually publishes to the platform(s), then records each attempt in
// scheduled_posts — mirrors what POST /api/posts/publish-now does.
const SUPPORTED_PLATFORMS = ["facebook", "linkedin", "instagram", "twitter"];

async function handlePublishPost(action, eventBus) {
  const content = (action.content || "").trim();
  if (!content) return { success: false, error: "Post content is empty" };

  const requested = Array.isArray(action.platforms)
    ? action.platforms
    : [action.platform || "linkedin"];
  const platforms = [...new Set(requested.map((p) => String(p).toLowerCase()))];

  const unknown = platforms.filter((p) => !SUPPORTED_PLATFORMS.includes(p));
  if (unknown.length) {
    return { success: false, error: `Unsupported platform(s): ${unknown.join(", ")}` };
  }

  const db = await getDb();
  const { publishPost } = await import(
    "../vault-control/server/services/socialMediaService.js"
  );

  const imageUrl = action.imageUrl || null;
  const results = [];

  for (const platform of platforms) {
    // Instagram's Graph API has no text-only post; fail loudly instead of
    // surfacing a raw API error through the chat.
    if (platform === "instagram" && !imageUrl) {
      results.push({
        platform,
        success: false,
        error: "Instagram needs an image — provide imageUrl.",
      });
      continue;
    }

    try {
      const r = await publishPost({ platform, content, image_url: imageUrl });
      if (r?.success) {
        const inserted = await db.query(
          `INSERT INTO scheduled_posts (platform, content, topic, image_url, status, post_url, published_at)
           VALUES ($1, $2, $3, $4, 'published', $5, NOW())
           RETURNING id, platform, status, post_url, published_at`,
          [platform, content, action.topic || null, imageUrl, r.url || null],
        );
        const post = inserted.rows[0];
        results.push({ platform, success: true, url: r.url || null, id: post.id });
        eventBus?.emit("post:published", post);
        global.wsBroadcast?.({ type: "post:published", post });
      } else {
        const error = r?.message || r?.error || "Unknown platform error";
        await db
          .query(
            `INSERT INTO scheduled_posts (platform, content, topic, image_url, status)
             VALUES ($1, $2, $3, $4, 'failed')`,
            [platform, content, action.topic || null, imageUrl],
          )
          .catch(() => {});
        results.push({ platform, success: false, error });
      }
    } catch (e) {
      results.push({ platform, success: false, error: e.message });
    }
  }

  const summary = results
    .map((r) => `${r.platform}: ${r.success ? "posted" : "failed — " + r.error}`)
    .join(" | ");
  const anySuccess = results.some((r) => r.success);

  await notifyDashboard(
    anySuccess ? "success" : "error",
    anySuccess ? "Post published from chat" : "Post publish failed",
    summary,
    { results },
  );

  return { success: anySuccess, results, summary };
}

// ─── GET_LAST_POST ────────────────────────────────────────────────────────────
async function handleGetLastPost(action) {
  const db = await getDb();
  const platform = action.platform ? String(action.platform).toLowerCase() : null;
  const params = [];
  let where = `WHERE status IN ('published','posted','sent')`;
  if (platform) {
    params.push(platform);
    where += ` AND LOWER(platform) = $1`;
  }
  const result = await db.query(
    `SELECT id, platform, topic, content, status, post_url, published_at, created_at
     FROM scheduled_posts ${where}
     ORDER BY COALESCE(published_at, created_at) DESC
     LIMIT ${platform ? 1 : 5}`,
    params,
  );
  return { success: true, platform, posts: result.rows, post: result.rows[0] || null };
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
      case "SEND_EMAIL":
        return await handleSendEmail(action, eventBus);
      case "PUBLISH_POST":
        return await handlePublishPost(action, eventBus);
      case "GET_LAST_POST":
        return await handleGetLastPost(action);
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
      // /api/chat/* is exempt from the global auth middleware, so outward-facing
      // actions are gated here instead — otherwise anyone who can reach the
      // dashboard could send mail from the owner's account or post as them.
      if (ENABLE_AUTH && OUTWARD_ACTIONS.has(action.type) && req.user?.role !== "admin") {
        send({
          type: "action",
          action,
          result: {
            success: false,
            error: "Admin login required for this action (send email / publish post / WhatsApp).",
          },
        });
        send({ type: "done" });
        return res.end();
      }

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

      // Email sent → frontend update
      if (action.type === "SEND_EMAIL") {
        send({
          type: "email_sent",
          data: {
            success: !!result?.success,
            to: result?.to || action.to,
            subject: result?.subject || action.subject,
            dryRun: !!result?.dryRun,
            error: result?.error || null,
          },
        });
      }

      // Post published → frontend update
      if (action.type === "PUBLISH_POST") {
        send({
          type: "post_published",
          data: {
            success: !!result?.success,
            results: result?.results || [],
            summary: result?.summary || result?.error || "",
          },
        });
      }

      // Last post lookup → structured, so the UI can render links
      if (action.type === "GET_LAST_POST" && result?.success) {
        send({
          type: "post_status",
          data: {
            platform: result.platform,
            posts: (result.posts || []).map((p) => ({
              id: p.id,
              platform: p.platform,
              topic: p.topic,
              url: p.post_url,
              publishedAt: p.published_at || p.created_at,
              preview: (p.content || "").slice(0, 120),
            })),
          },
        });
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
