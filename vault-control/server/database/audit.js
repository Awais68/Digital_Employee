import { query, getPool } from './connection.js';

export async function logAudit(userId, action, resourceType, resourceId, oldVal, newVal, req) {
  try {
    await query(
      `INSERT INTO audit_log (user_id, action, resource_type, resource_id, old_value, new_value, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId || null,
        action,
        resourceType,
        resourceId,
        oldVal ? JSON.stringify(oldVal) : null,
        newVal ? JSON.stringify(newVal) : null,
        req?.ip || req?.connection?.remoteAddress || 'unknown',
        req?.headers?.['user-agent'] || 'unknown',
      ]
    );
  } catch (err) {
    console.error('[Audit] Failed to log:', err.message);
  }
}

export async function logApprovalHistory(fileId, filename, action, userId, notes = '') {
  try {
    await query(
      `INSERT INTO approval_history (file_id, filename, action, performed_by, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [fileId, filename, action, userId || null, notes]
    );
  } catch (err) {
    console.error('[Audit] Failed to log approval history:', err.message);
  }
}

export async function undoLastApproval(userId) {
  try {
    const result = await query(
      `SELECT * FROM approval_history 
       WHERE performed_by = $1 AND action IN ('approved', 'rejected') AND undone_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return { success: false, message: 'No action to undo' };
    }

    const lastAction = result.rows[0];

    await query(
      `UPDATE approval_history SET undone_at = NOW(), undone_by = $1 WHERE id = $2`,
      [userId, lastAction.id]
    );

    return { success: true, lastAction };
  } catch (err) {
    console.error('[Audit] Failed to undo:', err.message);
    return { success: false, message: err.message };
  }
}

export async function getAuditLogs(limit = 50, offset = 0, filters = {}) {
  try {
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (filters.userId) {
      whereClause += ` AND user_id = $${paramCount}`;
      params.push(filters.userId);
      paramCount++;
    }
    if (filters.action) {
      whereClause += ` AND action = $${paramCount}`;
      params.push(filters.action);
      paramCount++;
    }
    if (filters.resourceType) {
      whereClause += ` AND resource_type = $${paramCount}`;
      params.push(filters.resourceType);
      paramCount++;
    }

    const result = await query(
      `SELECT al.*, u.username, u.email 
       FROM audit_log al 
       LEFT JOIN users u ON al.user_id = u.id 
       ${whereClause}
       ORDER BY al.created_at DESC 
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...params, limit, offset]
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM audit_log al ${whereClause}`,
      params
    );

    return {
      logs: result.rows,
      total: parseInt(countResult.rows[0].count),
    };
  } catch (err) {
    console.error('[Audit] Failed to fetch logs:', err.message);
    return { logs: [], total: 0 };
  }
}

export async function createNotification(userId, title, message, type = 'info', link = null) {
  try {
    await query(
      `INSERT INTO notifications (user_id, title, message, type, link)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, title, message, type, link]
    );
  } catch (err) {
    console.error('[Notification] Failed to create:', err.message);
  }
}

export async function getUnreadNotifications(userId, limit = 20) {
  try {
    const result = await query(
      `SELECT * FROM notifications WHERE user_id = $1 AND is_read = false ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  } catch (err) {
    console.error('[Notification] Failed to fetch:', err.message);
    return [];
  }
}

export async function markNotificationRead(userId, notificationId) {
  try {
    await query(
      `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
      [notificationId, userId]
    );
  } catch (err) {
    console.error('[Notification] Failed to mark read:', err.message);
  }
}
