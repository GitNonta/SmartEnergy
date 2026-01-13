/**
 * Activity Logger Service
 * 
 * Logs user activities for audit trail purposes.
 */

const { query } = require('./db');

// Activity action types
const ACTIONS = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  VIEW_DASHBOARD: 'VIEW_DASHBOARD',
  EXPORT_DATA: 'EXPORT_DATA',
  VIEW_REPORTS: 'VIEW_REPORTS',
  VIEW_DEVICES: 'VIEW_DEVICES',
  ADMIN_ACTION: 'ADMIN_ACTION',
  SETTINGS_CHANGE: 'SETTINGS_CHANGE',
  SESSION_EXPIRED: 'SESSION_EXPIRED'
};

/**
 * Log an activity
 */
async function logActivity(userId, action, resource = null, details = null, ipAddress = null) {
  try {
    await query(
      `INSERT INTO activity_logs (user_id, action, resource, details, ip_address)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, action, resource, details ? JSON.stringify(details) : null, ipAddress]
    );
  } catch (error) {
    // Don't throw - logging should not break the main flow
    console.error('Activity logging error:', error.message);
  }
}

/**
 * Get activity logs with pagination and filters
 */
async function getActivityLogs(options = {}) {
  const {
    userId = null,
    action = null,
    startDate = null,
    endDate = null,
    limit = 100,
    offset = 0
  } = options;

  let sql = `
    SELECT 
      al.*,
      u.username,
      u.display_name
    FROM activity_logs al
    LEFT JOIN users u ON al.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (userId) {
    sql += ' AND al.user_id = ?';
    params.push(userId);
  }

  if (action) {
    sql += ' AND al.action = ?';
    params.push(action);
  }

  if (startDate) {
    sql += ' AND al.created_at >= ?';
    params.push(startDate);
  }

  if (endDate) {
    sql += ' AND al.created_at <= ?';
    params.push(endDate);
  }

  sql += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

    return await query(sql, params);
  }
  
  /**
   * Log a data change audit
   * @param {number} userId - User performing the action
   * @param {string} action - Action name (e.g. UPDATE_USER)
   * @param {string} targetTable - Table being modified
   * @param {number} targetId - ID of the record
   * @param {Object} oldData - Previous data state
   * @param {string} ipAddress - Request IP
   * @param {string} userAgent - Request User Agent
   */
  async function logAudit(userId, action, targetTable, targetId, oldData, newData, ipAddress = null, userAgent = null) {
    try {
      const changes = compareObjects(oldData, newData);
      
      // If no old/new data provided, allowing logging pure events if changes is null but action provided
      if (!changes && action !== 'DELETE' && action !== 'CREATE' && !ipAddress) {
         // Modification: allow logging if ipAddress provided (security event) or if forced
         // But logic below checks changes.
         // Let's rely on caller providing meaningful old/new data for standard audits.
         // For security audits like 'LOGIN_FAIL', we might pass old=null, new={...details} which results in _new change.
         return; 
      }
      
      // If changes is null but we want to force log (like security event without data mutation but with context)
      // use "changes" as the details object if changes is null ? 
      // Current implementation: compareObjects returns { _new: ... } if old is null.
      // So passing old=null, new={details} works.

      await query(
        `INSERT INTO audit_logs (user_id, action, target_table, target_id, changes, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, action, targetTable, targetId, JSON.stringify(changes), ipAddress, userAgent]
      );
    } catch (error) {
      console.error('Audit logging error:', error.message);
    }
  }
  
  /**
   * Compare old and new objects to find changes
   */
  function compareObjects(oldObj, newObj) {
    if (!oldObj && !newObj) return null;
    if (!oldObj) return { _new: newObj }; // Creation
    if (!newObj) return { _old: oldObj }; // Deletion
    
    const changes = {};
    const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
    
    // Fields to ignore
    const ignoredFields = ['updated_at', 'password_hash'];
    
    for (const key of allKeys) {
      if (ignoredFields.includes(key)) continue;
      
      const val1 = oldObj[key];
      const val2 = newObj[key];
      
      // Handle simple equality check
      if (val1 !== val2) {
        // Handle dates comparison if strings
        if (typeof val1 === 'string' && typeof val2 === 'string' && 
            !isNaN(Date.parse(val1)) && !isNaN(Date.parse(val2))) {
           if (new Date(val1).getTime() === new Date(val2).getTime()) continue;
        }
        
        changes[key] = {
          old: val1,
          new: val2
        };
      }
    }
    
    return Object.keys(changes).length > 0 ? changes : null;
  }
  
  /**
   * Get audit logs for a specific record
   */
  async function getAuditLogs(targetTable, targetId) {
    return await query(
      `SELECT al.*, u.username, u.display_name
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE al.target_table = ? AND al.target_id = ?
       ORDER BY al.created_at DESC`,
      [targetTable, targetId]
    );
  }
  
  /**
   * Get activity summary for dashboard
   */
  async function getActivitySummary(days = 7) {
    const sql = `
      SELECT 
        action,
        COUNT(*) as count,
        DATE(created_at) as date
      FROM activity_logs
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      GROUP BY action, DATE(created_at)
      ORDER BY date DESC, count DESC
    `;
    
    return await query(sql, [days]);
  }
  
  /**
   * Cleanup old activity logs (run periodically)
   */
  async function cleanupOldLogs(retentionDays = 90) {
    const result = await query(
      'DELETE FROM activity_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
      [retentionDays]
    );
    
    // Also cleanup audit logs
    const auditResult = await query(
        'DELETE FROM audit_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
        [retentionDays * 2] // Keep audits longer
    );
    
    const total = (result.affectedRows || 0) + (auditResult.affectedRows || 0);
    
    if (total > 0) {
      console.log(`🧹 Cleaned up ${total} old logs`);
    }
    
    return total;
  }
  
  module.exports = {
    ACTIONS,
    logActivity,
    logAudit,
    getAuditLogs,
    getActivityLogs,
    getActivitySummary,
    cleanupOldLogs
  };
