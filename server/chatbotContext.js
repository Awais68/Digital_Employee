// DB connection lives in vault-control/server/database/connection.js (ESM with named exports).
// Node >= 22.12 supports require() of ESM, so this works from CommonJS.
const db = require('../vault-control/server/database/connection.js');

async function getDashboardContext() {
  const context = {
    timestamp: new Date().toISOString(),
    todos: [],
    drafts: [],
    notifications: [],
    error: null,
  };

  try {
    const [todosResult, draftsResult, notifResult] = await Promise.all([
      db.query(
        'SELECT id, title, priority, status, created_at FROM todos ORDER BY created_at DESC LIMIT 15'
      ),
      // Schema has no "drafts" table — scheduled_posts is the drafts store.
      db.query(
        'SELECT id, platform, content, status, created_at FROM scheduled_posts ORDER BY created_at DESC LIMIT 10'
      ),
      // notifications uses is_read (aliased to keep the context shape stable).
      db.query(
        'SELECT id, type, message, is_read AS read, created_at FROM notifications ORDER BY created_at DESC LIMIT 10'
      ),
    ]);

    context.todos = todosResult.rows;
    context.drafts = draftsResult.rows;
    context.notifications = notifResult.rows;
  } catch (err) {
    context.error = 'Database not available: ' + err.message;
    context.todos = [];
    context.drafts = [];
    context.notifications = [];
  }

  return context;
}

module.exports = { getDashboardContext };
