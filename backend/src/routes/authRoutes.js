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
  getActivityLogs 
} = require('../services/activityLogger');

/**
 * POST /api/auth/login
 * Authenticate user and create session
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    // 'username' field can be username, email, or phone number
    const identifier = username;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username/Email/Phone and password are required'
      });
    }

    // Find user by username, email, or phone number
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

    if (!user) {
      await logActivity(null, ACTIONS.LOGIN_FAILED, 'auth', 
        { identifier, reason: 'User not found' }, ipAddress);
      
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      await logActivity(user.id, ACTIONS.LOGIN_FAILED, 'auth',
        { reason: 'Invalid password' }, ipAddress);
      
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Create session
    const session = await createSession(user, ipAddress, userAgent);
    
    await logActivity(user.id, ACTIONS.LOGIN_SUCCESS, 'auth',
      { ip: ipAddress }, ipAddress);
    
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

module.exports = router;
