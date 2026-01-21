/**
 * Authentication Routes
 * 
 * Handles user login, logout, session management, and activity logs.
 */

const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();

const { query, queryOne } = require('../services/db');
const { 
  createSession, 
  invalidateSession, 
  getUserSessions,
  authMiddleware,
  getCookieOptions
} = require('../services/sessionService');
const { 
  ACTIONS, 
  logActivity, 
  getActivityLogs,
  logAudit
} = require('../services/activityLogger');

/**
 * POST /api/auth/login
 * Authenticate user and create session
 */
// Rate Limiting Store (In-Memory)
const failedAttempts = new Map();
const MAX_ATTEMPTS = 5;
const COOLDOWN_SECONDS = 120;

/**
 * Cleanup old rate limit entries periodically (every 1 hour)
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of failedAttempts.entries()) {
    if (data.lockUntil && data.lockUntil < now) {
      failedAttempts.delete(key);
    } else if (now - data.lastAttempt > 3600000) { // 1 hour inactivity
      failedAttempts.delete(key);
    }
  }
}, 3600000);

/**
 * POST /api/auth/login
 * Authenticate user and create session
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const identifier = username; // User input identifier

    // 1. Check Rate Limit
    const limitKey = `login_fail:${ipAddress}`; // Limit by IP
    const limitData = failedAttempts.get(limitKey) || { count: 0, lockUntil: null, lastAttempt: null };

    if (limitData.lockUntil && limitData.lockUntil > Date.now()) {
      const remainingSeconds = Math.ceil((limitData.lockUntil - Date.now()) / 1000);
      
      // Log blocked attempt (optional, maybe too noisy if spammed)
      // await logActivity(null, 'LOGIN_BLOCKED', 'auth', { ip: ipAddress, reason: 'Rate limited' }, ipAddress);

      return res.status(429).json({
        success: false,
        error: 'Too many failed attempts. Please contact administrator.',
        locked: true,
        retryAfter: limitData.lockUntil,
        remainingSeconds
      });
    }

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username/Email/Phone and password are required'
      });
    }

    // 2. Find user
    const user = await queryOne(
      `SELECT * FROM users 
       WHERE is_active = TRUE 
       AND (
         username = ? 
         OR (email IS NOT NULL AND email = ?) 
         OR (phone_number IS NOT NULL AND phone_number = ?)
       )`,
      [identifier, identifier, identifier]
    );

    // Helper to handle login failure
    const handleLoginFailure = async (reason) => {
      limitData.count += 1;
      limitData.lastAttempt = Date.now();
      
      let locked = false;
      let retryAfter = null;

      if (limitData.count >= MAX_ATTEMPTS) {
        limitData.lockUntil = Date.now() + (COOLDOWN_SECONDS * 1000);
        locked = true;
        retryAfter = limitData.lockUntil;
        
        // Log Lockout Event to Activity Log
        await logActivity(user ? user.id : null, 'SECURITY_LOCKOUT', 'auth', {
          ip: ipAddress,
          identifier,
          failCount: limitData.count,
          reason: 'Excessive failed login attempts'
        }, ipAddress);
        
        // Log to Audit Log (High Priority Security Event)
        await logAudit(
          user ? user.id : null,
          'SECURITY_LOCKOUT',
          'users',
          user ? user.id : null,
          null,
          { 
            reason: 'Excessive failed login attempts', 
            failCount: limitData.count, 
            identifier,
            ip: ipAddress,
            userAgent
          },
          ipAddress,
          userAgent
        );
        
        console.warn(`⚠️ IP ${ipAddress} locked out due to excessive login failures`);
      } else {
        // Log Every Failure to Audit Log (as requested for detailed tracking)
        // action: LOGIN_FAILED or LOGIN_FAILED_REPEATED (>1)
        const auditAction = limitData.count > 1 ? 'LOGIN_FAILED_REPEATED' : 'LOGIN_FAILED';
        
        await logAudit(
          user ? user.id : null,
          auditAction,
          'users',
          user ? user.id : null, 
          null,
          { 
            reason, 
            attempt: limitData.count, 
            identifier,
            ip: ipAddress,
            userAgent
          },
          ipAddress,
          userAgent
        );
      }
      
      failedAttempts.set(limitKey, limitData);

      // Log Failed Login
      await logActivity(user ? user.id : null, ACTIONS.LOGIN_FAILED, 'auth', {
        identifier,
        ip: ipAddress,
        reason,
        attempt: limitData.count,
        maxAttempts: MAX_ATTEMPTS
      }, ipAddress);

      if (locked) {
        return res.status(429).json({
          success: false,
          error: 'Too many failed attempts. Please contact administrator.',
          locked: true,
          retryAfter,
          remainingSeconds: COOLDOWN_SECONDS
        });
      }

      return res.status(401).json({
        success: false,
        error: 'Username or password incorrect'
      });
    };

    if (!user) {
      return await handleLoginFailure('User not found');
    }

    // 3. Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      return await handleLoginFailure('Invalid password');
    }

    // 4. Success - Reset Rate Limit
    if (failedAttempts.has(limitKey)) {
      failedAttempts.delete(limitKey);
    }

    // Create session
    const session = await createSession(user, ipAddress, userAgent);
    
    await logActivity(user.id, ACTIONS.LOGIN_SUCCESS, 'auth',
      { ip: ipAddress, method: 'credentials' }, ipAddress);

    // Audit Log for Login Success (Session Tracking)
    await logAudit(
      user.id, 
      'LOGIN_SUCCESS', 
      'users', 
      user.id, 
      null, 
      { 
        sessionId: session.sessionId, 
        ip: ipAddress, 
        userAgent 
      }, 
      ipAddress, 
      userAgent
    );
    
    // Set HttpOnly cookie for web clients
    res.cookie('jwt', session.token, getCookieOptions());

    res.json({
      success: true,
      data: session
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

/**
 * POST /api/auth/logout
 * Invalidate current session
 */
router.post('/logout', authMiddleware(), async (req, res) => {
  try {
    const ipAddress = req.ip || req.connection.remoteAddress;
    
    await invalidateSession(req.token);
    await logActivity(req.user.userId, ACTIONS.LOGOUT, 'auth', null, ipAddress);
    
    // Audit Log for Logout
    await logAudit(
      req.user.userId,
      'LOGOUT',
      'users',
      req.user.userId,
      null,
      { ip: ipAddress },
      ipAddress,
      req.headers['user-agent']
    );
    
    // Clear cookie
    res.clearCookie('jwt');

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed'
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', authMiddleware(), async (req, res) => {
  res.json({
    success: true,
    data: {
      id: req.user.userId,
      username: req.user.username,
      displayName: req.user.displayName,
      role: req.user.role
    }
  });
});

/**
 * GET /api/auth/sessions
 * Get active sessions for current user
 */
router.get('/sessions', authMiddleware(), async (req, res) => {
  try {
    const sessions = await getUserSessions(req.user.userId);
    
    res.json({
      success: true,
      data: sessions.map(s => ({
        id: s.id,
        ipAddress: s.ip_address,
        userAgent: s.user_agent,
        createdAt: s.created_at,
        expiresAt: s.expires_at,
        current: s.id === req.user.sessionId
      }))
    });

  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get sessions'
    });
  }
});

/**
 * GET /api/auth/logs
 * Get activity logs (admin only)
 */
router.get('/logs', authMiddleware('admin'), async (req, res) => {
  try {
    const { userId, action, startDate, endDate, limit = 100, offset = 0 } = req.query;
    
    const logs = await getActivityLogs({
      userId: userId ? parseInt(userId) : null,
      action,
      startDate,
      endDate,
      limit: Math.min(parseInt(limit), 500),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: logs
    });

  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get activity logs'
    });
  }
});

/**
 * POST /api/auth/register
 * Register new user (admin only)
 */
router.post('/register', authMiddleware('admin'), async (req, res) => {
  try {
    const { username, password, displayName, role = 'user' } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }

    // Check if username exists
    const existing = await queryOne(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );

    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Username already exists'
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const result = await query(
      `INSERT INTO users (username, password_hash, display_name, role)
       VALUES (?, ?, ?, ?)`,
      [username, passwordHash, displayName || username, role]
    );

    await logActivity(req.user.userId, ACTIONS.ADMIN_ACTION, 'users',
      { action: 'create_user', newUserId: result.insertId, username }, ipAddress);

    res.json({
      success: true,
      data: {
        id: result.insertId,
        username,
        displayName: displayName || username,
        role
      }
    });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed'
    });
  }
});

/**
 * GET /api/auth/users
 * List all users (admin only)
 */
router.get('/users', authMiddleware('admin'), async (req, res) => {
  try {
    const users = await query(
      `SELECT id, username, display_name, role, is_active, created_at, updated_at
       FROM users
       ORDER BY created_at DESC`
    );

    res.json({
      success: true,
      data: users
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get users'
    });
  }
});

/**
 * POST /api/auth/reset-rate-limit
 * Reset rate limiting (admin only) - For testing purposes
 */
router.post('/reset-rate-limit', authMiddleware('admin'), async (req, res) => {
  try {
    const { ip } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    
    if (ip) {
      // Reset specific IP
      const key = `login_fail:${ip}`;
      failedAttempts.delete(key);
      
      await logActivity(req.user.userId, 'RATE_LIMIT_RESET', 'auth',
        { targetIp: ip, action: 'reset_single' }, ipAddress);
      
      res.json({
        success: true,
        message: `Rate limit reset for IP: ${ip}`
      });
    } else {
      // Reset all
      const count = failedAttempts.size;
      failedAttempts.clear();
      
      await logActivity(req.user.userId, 'RATE_LIMIT_RESET', 'auth',
        { action: 'reset_all', clearedEntries: count }, ipAddress);
      
      res.json({
        success: true,
        message: `Rate limit reset for all ${count} entries`
      });
    }
  } catch (error) {
    console.error('Reset rate limit error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset rate limit'
    });
  }
});

/**
 * GET /api/auth/rate-limit-status
 * Get rate limit status (admin only)
 */
router.get('/rate-limit-status', authMiddleware('admin'), async (req, res) => {
  try {
    const entries = [];
    for (const [key, data] of failedAttempts.entries()) {
      entries.push({
        key,
        count: data.count,
        lockUntil: data.lockUntil,
        locked: data.lockUntil && data.lockUntil > Date.now(),
        lastAttempt: data.lastAttempt
      });
    }
    
    res.json({
      success: true,
      data: {
        totalEntries: entries.length,
        entries
      }
    });
  } catch (error) {
    console.error('Get rate limit status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get rate limit status'
    });
  }
});

module.exports = router;
