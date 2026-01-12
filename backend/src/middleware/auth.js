/**
 * Authentication Middleware
 * 
 * Simple API Key authentication for admin and sensitive routes.
 * 
 * Usage:
 *   const { checkAdminAuth } = require('./middleware/auth');
 *   router.post('/dangerous-route', checkAdminAuth, handler);
 * 
 * Required ENV:
 *   ADMIN_API_KEY - API key for admin access (MUST change in production!)
 * 
 * Client Usage:
 *   fetch('/api/admin/...', {
 *     headers: { 'x-api-key': 'your-api-key' }
 *   })
 */

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'dev-key-change-in-production';

// Warn if using default key
if (ADMIN_API_KEY === 'dev-key-change-in-production') {
  console.warn('⚠️ WARNING: Using default ADMIN_API_KEY! Set ADMIN_API_KEY env variable in production!');
}

/**
 * Check Admin API Key
 * Requires 'x-api-key' header to match ADMIN_API_KEY
 */
function checkAdminAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    console.warn(`🚫 Auth failed: No API key provided - ${req.method} ${req.path}`);
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: API key required',
      hint: 'Add x-api-key header'
    });
  }
  
  if (apiKey !== ADMIN_API_KEY) {
    console.warn(`🚫 Auth failed: Invalid API key - ${req.method} ${req.path}`);
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid API key'
    });
  }
  
  // Auth passed
  next();
}

/**
 * Optional Auth - passes through but marks req.isAuthenticated
 * Useful for routes that work differently for admin vs public
 */
function optionalAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  req.isAuthenticated = apiKey && apiKey === ADMIN_API_KEY;
  next();
}

const { logActivity, ACTIONS } = require('../services/activityLogger');

/**
 * Log admin action for audit trail
 */
function logAdminAction(action) {
  return async (req, res, next) => {
    // Log to console for immediate visibility
    console.log(`🔐 Admin Action: ${action} by ${req.ip} at ${new Date().toISOString()}`);
    
    // Attach action to request for potential downstream use
    req.adminAction = action;
    
    // Prepare log details
    const userId = req.user ? req.user.userId : null; // null for API Key access
    const details = {
      method: req.method,
      path: req.path,
      authMethod: req.user ? 'SESSION' : 'API_KEY',
      userAgent: req.headers['user-agent']
    };

    // Log to database asynchronously (don't await to avoid blocking response)
    logActivity(
      userId, 
      ACTIONS.ADMIN_ACTION, // General category
      'admin_route', // Resource
      { ...details, specificAction: action }, // Details
      req.ip
    ).catch(err => console.error('Failed to log admin action:', err.message));

    next();
  };
}

module.exports = {
  checkAdminAuth,
  optionalAuth,
  logAdminAction,
  ADMIN_API_KEY // Export for testing only
};
