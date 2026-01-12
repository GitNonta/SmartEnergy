/**
 * Session Management Service
 * 
 * Handles JWT token generation with HttpOnly cookies for web and 
 * Authorization header for mobile/API. Includes rolling timeout support.
 */

const jwt = require('jsonwebtoken');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const { pool, query, queryOne } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'smart-energy-secret-key-change-in-production';
const SESSION_DURATION_HOURS = parseInt(process.env.SESSION_DURATION_HOURS) || 24;
const IDLE_TIMEOUT_MINUTES = parseInt(process.env.IDLE_TIMEOUT_MINUTES) || 30;
const ROLLING_SESSION = process.env.ROLLING_SESSION !== 'false'; // Default true

// Session store options
const sessionStoreOptions = {
  clearExpired: true,
  checkExpirationInterval: 60000, // 1 minute
  expiration: IDLE_TIMEOUT_MINUTES * 60 * 1000, // Idle timeout in ms
  createDatabaseTable: false, // We handle table creation in db.js
  schema: {
    tableName: 'sessions',
    columnNames: {
      session_id: 'session_id',
      expires: 'expires_at',
      data: 'payload'
    }
  }
};

// Create MySQL session store
let sessionStore = null;

function getSessionStore() {
  if (!sessionStore) {
    sessionStore = new MySQLStore(sessionStoreOptions, pool);
  }
  return sessionStore;
}

/**
 * Generate JWT token
 */
function generateToken(user, sessionId, expiresAt) {
  return jwt.sign(
    {
      sessionId,
      userId: user.id,
      username: user.username,
      role: user.role,
      displayName: user.display_name
    },
    JWT_SECRET,
    { expiresIn: `${SESSION_DURATION_HOURS}h` }
  );
}

/**
 * Create a new session for a user
 */
async function createSession(user, ipAddress, userAgent) {
  const sessionId = require('crypto').randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + SESSION_DURATION_HOURS);

  const token = generateToken(user, sessionId, expiresAt);
  
  const payload = JSON.stringify({
    role: user.role,
    displayName: user.display_name,
    email: user.email
  });

  // Store session in database
  await query(
    `INSERT INTO sessions (session_id, user_id, token, ip_address, user_agent, payload, last_active, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)`,
    [sessionId, user.id, token, ipAddress, userAgent?.substring(0, 500), payload, expiresAt]
  );

  return {
    sessionId,
    token,
    expiresAt,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      email: user.email
    }
  };
}

/**
 * Validate a session token (supports both header and cookie)
 */
async function validateSession(token) {
  try {
    // Verify JWT
    const decoded = jwt.verify(token, JWT_SECRET);

    // Get sessionId from JWT payload (new tokens have it, old tokens don't)
    const sessionId = decoded.sessionId;

    // Check if session exists in database and not expired
    // Use session_id from JWT if available, otherwise fall back to token match
    let session;
    if (sessionId) {
      session = await queryOne(
        `SELECT s.*, u.username, u.display_name, u.role, u.is_active, u.email
         FROM sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.session_id = ? AND s.expires_at > NOW() AND u.is_active = TRUE`,
        [sessionId]
      );
    } else {
      // Fallback for old tokens without sessionId in payload
      session = await queryOne(
        `SELECT s.*, u.username, u.display_name, u.role, u.is_active, u.email
         FROM sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.token = ? AND s.expires_at > NOW() AND u.is_active = TRUE`,
        [token]
      );
    }

    if (!session) {
      return null;
    }

    // Check idle timeout
    const lastActive = new Date(session.last_active);
    const idleMs = Date.now() - lastActive.getTime();
    const idleTimeoutMs = IDLE_TIMEOUT_MINUTES * 60 * 1000;

    if (idleMs > idleTimeoutMs) {
      // Session idle timeout - invalidate
      await invalidateSessionById(session.session_id);
      return null;
    }

    // Rolling session: update last_active
    if (ROLLING_SESSION) {
      await query(
        'UPDATE sessions SET last_active = NOW() WHERE session_id = ?',
        [session.session_id]
      );
    }

    return {
      sessionId: session.session_id,
      id: session.user_id, // Alias for backward compatibility with routes using req.user.id
      userId: session.user_id,
      username: session.username,
      displayName: session.display_name,
      role: session.role,
      email: session.email
    };
  } catch (error) {
    console.error('Session validation error:', error.message);
    return null;
  }
}

/**
 * Refresh session token (extend expiry)
 */
async function refreshSession(sessionId) {
  const session = await queryOne(
    'SELECT * FROM sessions WHERE session_id = ?',
    [sessionId]
  );
  
  if (!session) return null;
  
  const user = await queryOne(
    'SELECT * FROM users WHERE id = ?',
    [session.user_id]
  );
  
  if (!user || !user.is_active) return null;
  
  const newExpiresAt = new Date();
  newExpiresAt.setHours(newExpiresAt.getHours() + SESSION_DURATION_HOURS);
  
  const newToken = generateToken(user, session.session_id, newExpiresAt);
  
  await query(
    'UPDATE sessions SET token = ?, expires_at = ?, last_active = NOW() WHERE session_id = ?',
    [newToken, newExpiresAt, sessionId]
  );
  
  return {
    token: newToken,
    expiresAt: newExpiresAt
  };
}

/**
 * Invalidate a session by token
 */
async function invalidateSession(token) {
  await query('DELETE FROM sessions WHERE token = ?', [token]);
}

/**
 * Invalidate a session by session ID
 */
async function invalidateSessionById(sessionId) {
  await query('DELETE FROM sessions WHERE session_id = ?', [sessionId]);
}

/**
 * Invalidate all sessions for a user
 */
async function invalidateAllUserSessions(userId) {
  await query('DELETE FROM sessions WHERE user_id = ?', [userId]);
}

/**
 * Get active sessions for a user
 */
async function getUserSessions(userId) {
  return await query(
    `SELECT session_id, ip_address, user_agent, last_active, created_at, expires_at
     FROM sessions
     WHERE user_id = ? AND expires_at > NOW()
     ORDER BY last_active DESC`,
    [userId]
  );
}

/**
 * Get session by ID
 */
async function getSessionById(sessionId) {
  return await queryOne(
    'SELECT * FROM sessions WHERE session_id = ?',
    [sessionId]
  );
}

/**
 * Cleanup expired sessions (run periodically)
 */
async function cleanupExpiredSessions() {
  // Delete sessions expired by absolute time
  const expiredResult = await query('DELETE FROM sessions WHERE expires_at < NOW()');
  
  // Delete sessions idle for too long  
  const idleResult = await query(
    'DELETE FROM sessions WHERE last_active < DATE_SUB(NOW(), INTERVAL ? MINUTE)',
    [IDLE_TIMEOUT_MINUTES]
  );
  
  const total = (expiredResult.affectedRows || 0) + (idleResult.affectedRows || 0);
  if (total > 0) {
    console.log(`🧹 Cleaned up ${total} expired/idle sessions`);
  }
  return total;
}

/**
 * Authentication middleware
 * Supports both Authorization header (for API/mobile) and HttpOnly cookie (for web)
 */
function authMiddleware(requireRole = null) {
  return async (req, res, next) => {
    let token = null;
    
    // Try Authorization header first (API/mobile)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    
    // Fallback to HttpOnly cookie (web)
    if (!token && req.cookies && req.cookies.jwt) {
      token = req.cookies.jwt;
    }
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No token provided'
      });
    }

    const session = await validateSession(token);

    if (!session) {
      // Clear cookie if invalid
      res.clearCookie('jwt');
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }

    // Check role if required
    if (requireRole && session.role !== requireRole && session.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    // 🟢 ROLLING SESSION: Refresh token and cookie on every activity
    if (ROLLING_SESSION) {
      try {
        // Only refresh if the request is not for static resources or polling (optional optimization)
        // For now, we refresh on all auth-protected API calls to ensure "Sliding Expiration"
        const refreshed = await refreshSession(session.sessionId);
        
        if (refreshed) {
          // Send new cookie with fresh expiration
          res.cookie('jwt', refreshed.token, getCookieOptions());
          // 🆕 Also send token in header for localStorage sync
          res.setHeader('X-New-Token', refreshed.token);
          res.setHeader('Access-Control-Expose-Headers', 'X-New-Token');
          // Update request token for downstream use
          token = refreshed.token;
        }
      } catch (err) {
        console.error('Rolling session refresh failed:', err.message);
        // Continue request even if refresh fails (don't block user)
      }
    }

    req.user = session;
    req.token = token;
    next();
  };
}

/**
 * Cookie options for JWT
 */
function getCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction, // HTTPS only in production
    sameSite: 'lax',
    maxAge: SESSION_DURATION_HOURS * 60 * 60 * 1000, // Convert hours to ms
    path: '/'
  };
}

module.exports = {
  createSession,
  validateSession,
  refreshSession,
  invalidateSession,
  invalidateSessionById,
  invalidateAllUserSessions,
  getUserSessions,
  getSessionById,
  cleanupExpiredSessions,
  authMiddleware,
  getSessionStore,
  getCookieOptions,
  JWT_SECRET,
  IDLE_TIMEOUT_MINUTES,
  SESSION_DURATION_HOURS,
  ROLLING_SESSION
};
