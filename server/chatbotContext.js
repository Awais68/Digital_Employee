// Dashboard snapshot handed to the chatbot as system-prompt context.
// DB connection lives in vault-control/server/database/connection.js (ESM with
// named exports). Node >= 22.12 supports require() of ESM, so this works from CJS.
const db = require("../vault-control/server/database/connection.js");

// Statuses that mean "this post actually went out to the platform".
const PUBLISHED_STATUSES = ["published", "posted", "sent"];

// Each entry is run independently: one failing query (a column drift, a missing
// table) must degrade only its own slice of the context. Previously a single
// Promise.all rejection blanked the WHOLE context, and the bot answered every
// "last post?" / "kitni emails?" with zero.
const QUERIES = {
  todos: [
    `SELECT id, title, priority, status, created_at
     FROM todos ORDER BY created_at DESC LIMIT 15`,
  ],
  drafts: [
    `SELECT id, platform, content, topic, status, scheduled_for, published_at, created_at
     FROM scheduled_posts
     WHERE status NOT IN ('published','posted','sent')
     ORDER BY created_at DESC LIMIT 10`,
  ],
  notifications: [
    // NOTE: the live table's column is "read". The CREATE TABLE in
    // database/connection.js still says is_read — do not "fix" this back.
    `SELECT id, type, title, message, read, created_at
     FROM notifications ORDER BY created_at DESC LIMIT 10`,
  ],
  emails: [
    `SELECT id, msg_id, from_address, sender_name, subject, snippet, status, category, received_at
     FROM emails ORDER BY received_at DESC LIMIT 10`,
  ],
  // "last kaunsi post hui" — only posts that actually went live, newest first.
  publishedPosts: [
    `SELECT id, platform, content, topic, status, post_url, published_at, created_at
     FROM scheduled_posts
     WHERE status IN ('published','posted','sent')
     ORDER BY COALESCE(published_at, created_at) DESC LIMIT 5`,
  ],
  // Emails waiting on the owner's WhatsApp decision, keyed by the ref they reply with.
  pendingApprovals: [
    `SELECT ref, kind, title, summary, created_at
     FROM hitl_requests WHERE status='pending' ORDER BY id DESC LIMIT 10`,
  ],
  _counts: [
    `SELECT
       (SELECT COUNT(*) FROM todos  WHERE status = 'pending')          AS pending_todos,
       (SELECT COUNT(*) FROM emails WHERE status = 'unread')           AS unread_emails,
       (SELECT COUNT(*) FROM scheduled_posts WHERE status = 'draft')   AS draft_posts,
       (SELECT COUNT(*) FROM scheduled_posts
          WHERE status IN ('published','posted','sent'))               AS published_posts`,
  ],
};

async function getDashboardContext() {
  const context = {
    timestamp: new Date().toISOString(),
    todos: [],
    drafts: [],
    notifications: [],
    emails: [],
    publishedPosts: [],
    pendingApprovals: [],
    lastPublishedPost: null,
    lastEmail: null,
    counts: { pendingTodos: 0, unreadEmails: 0, draftPosts: 0, publishedPosts: 0 },
    errors: [],
  };

  const keys = Object.keys(QUERIES);
  const settled = await Promise.allSettled(
    keys.map((k) => db.query(QUERIES[k][0])),
  );

  settled.forEach((outcome, i) => {
    const key = keys[i];
    if (outcome.status === "rejected") {
      const msg = `${key}: ${outcome.reason?.message || outcome.reason}`;
      context.errors.push(msg);
      console.warn("[chatbotContext] query failed —", msg);
      return;
    }
    const rows = outcome.value.rows;
    if (key === "_counts") {
      const c = rows[0] || {};
      context.counts = {
        pendingTodos: Number(c.pending_todos || 0),
        unreadEmails: Number(c.unread_emails || 0),
        draftPosts: Number(c.draft_posts || 0),
        publishedPosts: Number(c.published_posts || 0),
      };
    } else {
      context[key] = rows;
    }
  });

  context.lastPublishedPost = context.publishedPosts[0] || null;
  context.lastEmail = context.emails[0] || null;
  if (!context.errors.length) delete context.errors;

  return context;
}

module.exports = { getDashboardContext, PUBLISHED_STATUSES };
