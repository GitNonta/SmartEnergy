/**
 * Admin Routes
 * API endpoints for administrative operations
 * 
 * ✅ ALL ROUTES REQUIRE API KEY AUTHENTICATION
 * 
 * Headers required:
 *   x-api-key: your-admin-api-key
 */

const express = require('express');
const router = express.Router();
const { checkAdminAuth, logAdminAction } = require('../middleware/auth');
const { getActivityLogs, getAuditLogs, getActivitySummary } = require('../services/activityLogger');
const { query } = require('../services/db');

module.exports = function(influxService, energyState) {
  
  // Apply auth to ALL admin routes
  router.use(checkAdminAuth);

  // Reset energy state (RAM)
  router.post('/reset-energy-state', 
    logAdminAction('RESET_ENERGY_STATE'),
    (req, res) => {
      try {
        const { daily, monthly, yearly } = req.body;
        
        energyState.setState({
          daily: daily !== undefined ? daily : 0,
          monthly: monthly !== undefined ? monthly : 0,
          yearly: yearly !== undefined ? yearly : 0
        });
        
        const newState = energyState.getState();
        
        console.log('🔄 Energy state reset:', newState);
        
        res.json({
          success: true,
          message: 'Energy state reset successfully',
          newState
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    }
  );

  // Force recover energy state from InfluxDB
  router.post('/recover-energy-state',
    logAdminAction('RECOVER_ENERGY_STATE'),
    async (req, res) => {
      try {
        const result = await energyState.recoverState();
        
        res.json({
          success: true,
          message: 'Energy state recovered from InfluxDB',
          ...result
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    }
  );

  // Get system metrics
  router.get('/metrics', (req, res) => {
    try {
      const metrics = influxService.getMetrics ? influxService.getMetrics() : {};
      
      res.json({
        success: true,
        metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Clear InfluxDB bucket (DANGEROUS!)
  router.delete('/clear-influxdb/:bucket',
    logAdminAction('CLEAR_INFLUXDB'),
    async (req, res) => {
      try {
        const { bucket } = req.params;
        const { confirm } = req.query;
        
        if (confirm !== 'yes-i-am-sure') {
          return res.status(400).json({
            success: false,
            error: 'Confirmation required',
            hint: 'Add ?confirm=yes-i-am-sure to URL'
          });
        }
        
        // This is a placeholder - actual implementation depends on InfluxDB API
        console.warn(`⚠️ DANGEROUS: Clear ${bucket} bucket requested!`);
        
        res.json({
          success: true,
          message: `Bucket ${bucket} clear operation initiated`,
          warning: 'This action cannot be undone!'
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    }
  );

  // Get connection status
  router.get('/status', async (req, res) => {
    try {
      const influxHealth = await influxService.testConnection();
      
      res.json({
        success: true,
        influxdb: influxHealth,
        energyState: energyState.getState(),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================
  // AUDIT LOGS ENDPOINTS
  // ============================================

  /**
   * GET /admin/audit-logs - Get all audit logs with filters
   * Query params: action, targetTable, userId, startDate, endDate, limit, offset
   */
  router.get('/audit-logs', async (req, res) => {
    try {
      const { action, targetTable, userId, startDate, endDate, limit = 100, offset = 0 } = req.query;
      
      let sql = `
        SELECT 
          al.*,
          u.username,
          u.display_name
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE 1=1
      `;
      const params = [];

      if (action) {
        sql += ' AND al.action = ?';
        params.push(action);
      }

      if (targetTable) {
        sql += ' AND al.target_table = ?';
        params.push(targetTable);
      }

      if (userId) {
        sql += ' AND al.user_id = ?';
        params.push(userId);
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
      params.push(parseInt(limit), parseInt(offset));

      const logs = await query(sql, params);
      
      // Get total count
      let countSql = 'SELECT COUNT(*) as total FROM audit_logs WHERE 1=1';
      const countParams = [];
      if (action) { countSql += ' AND action = ?'; countParams.push(action); }
      if (targetTable) { countSql += ' AND target_table = ?'; countParams.push(targetTable); }
      if (userId) { countSql += ' AND user_id = ?'; countParams.push(userId); }
      
      const [countResult] = await query(countSql, countParams);

      res.json({
        success: true,
        data: logs.map(log => ({
          ...log,
          changes: typeof log.changes === 'string' ? JSON.parse(log.changes) : log.changes
        })),
        meta: {
          total: countResult?.total || logs.length,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /admin/audit-logs/:table/:id - Get audit history for a specific record
   */
  router.get('/audit-logs/:table/:id', async (req, res) => {
    try {
      const { table, id } = req.params;
      const logs = await getAuditLogs(table, parseInt(id));

      res.json({
        success: true,
        data: logs.map(log => ({
          ...log,
          changes: typeof log.changes === 'string' ? JSON.parse(log.changes) : log.changes
        })),
        meta: {
          targetTable: table,
          targetId: parseInt(id),
          total: logs.length
        }
      });
    } catch (error) {
      console.error('Error fetching record audit logs:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================
  // ACTIVITY LOGS ENDPOINTS
  // ============================================

  /**
   * GET /admin/activity-logs - Get all activity logs with filters
   * Query params: userId, action, startDate, endDate, limit, offset
   */
  router.get('/activity-logs', async (req, res) => {
    try {
      const { userId, action, startDate, endDate, limit = 100, offset = 0 } = req.query;
      
      const logs = await getActivityLogs({
        userId: userId ? parseInt(userId) : null,
        action,
        startDate,
        endDate,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json({
        success: true,
        data: logs.map(log => ({
          ...log,
          details: typeof log.details === 'string' ? JSON.parse(log.details) : log.details
        })),
        meta: {
          total: logs.length,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      console.error('Error fetching activity logs:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /admin/activity-summary - Get activity summary for dashboard
   * Query params: days (default 7)
   */
  router.get('/activity-summary', async (req, res) => {
    try {
      const { days = 7 } = req.query;
      const summary = await getActivitySummary(parseInt(days));

      res.json({
        success: true,
        data: summary,
        meta: {
          days: parseInt(days)
        }
      });
    } catch (error) {
      console.error('Error fetching activity summary:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
};
