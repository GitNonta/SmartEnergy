/**
 * Authentication Routes
 * 
 * Handles user login, logout, session management, and activity logs.
 */

const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const router = express.Router();

const { query, queryOne } = require('../services/db');
const { sendPasswordResetEmail } = require('../services/mailer');
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
    let validPassword = await bcrypt.compare(password, user.password_hash);
    
    // Support for manually inserted plain-text passwords (e.g. via phpMyAdmin)
    // If bcrypt fails, check if the stored hash matches the plain password EXACTLY
    if (!validPassword && password === user.password_hash) {
        console.log(`⚠️ Detected plain-text password for user '${user.username}'. Auto-hashing for security...`);
        
        // 1. Mark as valid
        validPassword = true;
        
        // 2. Generate secure hash
        const newHash = await bcrypt.hash(password, 10);
        
        // 3. Update database immediately (Lazy Migration)
        try {
            await query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, user.id]);
            user.password_hash = newHash; // Update local user object
            console.log(`🔒 Password securely hashed and updated for user '${user.username}'`);
            
            await logActivity(user.id, 'SECURITY_UPDATE', 'auth', 
                { action: 'auto_hash_password', reason: 'plain_text_detected' }, ipAddress);
                
        } catch (updateError) {
            console.error('Failed to auto-hash password:', updateError);
            // Continue allowing login even if update fails, but warn.
        }
    }
    
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
      token: session.token,
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

/**
 * POST /api/auth/forgot-password
 * Send password reset email
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const user = await queryOne('SELECT id, username, email, display_name FROM users WHERE email = ? AND is_active = TRUE', [email]);
    
    if (!user) {
      // Return success even if user not found to prevent email enumeration
      return res.json({ success: true, message: 'If that email exists in our system, a reset link has been sent.' });
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour

    await query(
      'INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, token, expiresAt]
    );

    // Frontend URL for reset
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetLink = `${frontendUrl}/reset-password?token=${token}`;

    await sendPasswordResetEmail(user.email, resetLink, user.username, user.display_name);
    
    await logAudit(user.id, 'PASSWORD_RESET_REQUEST', 'users', user.id, null, { email }, req.ip, req.headers['user-agent']);

    res.json({ success: true, message: 'If that email exists in our system, a reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, error: 'An error occurred during password reset request' });
  }
});

/**
 * POST /api/auth/reset-password
 * Reset password using token and optional OTP
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword, otp } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ success: false, error: 'Token and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters long' });
    }

    // Fetch the reset request and user details
    const resetRequest = await queryOne(
      `SELECT pr.*, u.email, u.username 
       FROM password_resets pr 
       JOIN users u ON pr.user_id = u.id 
       WHERE pr.token = ? AND pr.used = FALSE AND pr.expires_at > NOW()`,
      [token]
    );

    if (!resetRequest) {
      return res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
    }

    const { sendPasswordResetOtpEmail } = require('../services/mailer');

    if (!otp) {
      // Step 1: Generate and send OTP
      const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
      
      await query('UPDATE password_resets SET otp_code = ? WHERE id = ?', [generatedOtp, resetRequest.id]);
      
      await sendPasswordResetOtpEmail(resetRequest.email, resetRequest.username, generatedOtp);
      
      return res.json({ success: true, requireOtp: true, message: 'Verification code sent to your email.' });
    } else {
      // Step 2: Verify OTP and reset password
      if (resetRequest.otp_code !== otp) {
        return res.status(400).json({ success: false, error: 'Invalid verification code.' });
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);

      // Start transaction if possible, or execute sequentially
      await query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, resetRequest.user_id]);
      await query('UPDATE password_resets SET used = TRUE WHERE id = ?', [resetRequest.id]);
      
      // Invalidate all active sessions for this user for security
      await query('DELETE FROM sessions WHERE user_id = ?', [resetRequest.user_id]);

      await logAudit(resetRequest.user_id, 'PASSWORD_RESET_SUCCESS', 'users', resetRequest.user_id, null, {}, req.ip, req.headers['user-agent']);

      res.json({ success: true, message: 'Password has been successfully reset. Please log in with your new password.' });
    }
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, error: 'Failed to reset password' });
  }
});

module.exports = router;
