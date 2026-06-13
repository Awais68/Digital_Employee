const db = require('../vault-control/server/database/connection.js');

async function getDashboardContext() {
  const context = {
    timestamp: new Date().toISOString(),
    todos: [],
    drafts: [],
    notifications: [],
    emails: [],
    error: null,
  };

  try {
    const [todosResult, draftsResult, notifResult, emailsResult] = await Promise.all([
      db.query(
        'SELECT id, title, priority, status, created_at FROM todos ORDER BY created_at DESC LIMIT 15'
      ),
      db.query(
        'SELECT id, platform, content, topic, status, scheduled_for, published_at, created_at FROM scheduled_posts ORDER BY created_at DESC LIMIT 10'
      ),
      db.query(
        'SELECT id, type, message, is_read AS read, created_at FROM notifications ORDER BY created_at DESC LIMIT 10'
      ),
      db.query(
        'SELECT id, msg_id, from_address, subject, snippet, status, received_at FROM emails ORDER BY received_at DESC LIMIT 10'
      ),
    ]);

    context.todos      = todosResult.rows;
    context.drafts     = draftsResult.rows;
    context.notifications = notifResult.rows;
    context.emails     = emailsResult.rows;

  } catch (err) {
    context.error  = 'Database not available: ' + err.message;
    context.todos  = [];
    context.drafts = [];
    context.notifications = [];
    context.emails = [];
  }

  return context;
}

module.exports = { getDashboardContext };
