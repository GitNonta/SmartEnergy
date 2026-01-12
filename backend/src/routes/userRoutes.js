/**
 * User Routes
 * 
 * API endpoints for user management.
 */

const express = require('express');
const router = express.Router();
const userService = require('../services/userService');
const { authMiddleware } = require('../services/sessionService');
const { logActivity, logAudit } = require('../services/activityLogger');

/**
 * GET /api/users - Get all users (admin only)
 */
router.get('/', authMiddleware('admin'), async (req, res) => {
    try {
        const { includeInactive, limit, offset } = req.query;
        
        const users = await userService.getAllUsers({
            includeInactive: includeInactive === 'true',
            limit: parseInt(limit) || 100,
            offset: parseInt(offset) || 0
        });
        
        const total = await userService.getUserCount(includeInactive === 'true');
        
        res.json({
            success: true,
            data: users,
            meta: {
                total,
                limit: parseInt(limit) || 100,
                offset: parseInt(offset) || 0
            }
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch users'
        });
    }
});

/**
 * GET /api/users/me - Get current user profile
 */
router.get('/me', authMiddleware(), async (req, res) => {
    try {
        const user = await userService.getUserById(req.user.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        res.json({
            success: true,
            data: user
        });
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch profile'
        });
    }
});

/**
 * PUT /api/users/me - Update current user profile
 */
router.put('/me', authMiddleware(), async (req, res) => {
    try {
        const { display_name, full_name, phone_number, email } = req.body;
        
        // Get current data for audit
        const currentUser = await userService.getUserById(req.user.id);

        const updatedUser = await userService.updateUser(req.user.id, {
            display_name,
            full_name,
            phone_number,
            email
        });
        
        await logActivity(req.user.id, 'profile_update', 'user', { userId: req.user.id }, req.ip);
        
        // Audit log
        await logAudit(req.user.id, 'UPDATE_PROFILE', 'users', req.user.id, currentUser, updatedUser);
        
        res.json({
            success: true,
            data: updatedUser,
            message: 'Profile updated successfully'
        });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update profile'
        });
    }
});

/**
 * PUT /api/users/me/password - Change own password
 */
router.put('/me/password', authMiddleware(), async (req, res) => {
    try {
        const { newPassword } = req.body;
        
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                error: 'Password must be at least 6 characters'
            });
        }
        
        await userService.updateUserPassword(req.user.id, newPassword);
        await logActivity(req.user.id, 'password_change', 'user', { userId: req.user.id }, req.ip);
        
        // Audit log (manual since compareObjects ignores password_hash)
        await logAudit(req.user.id, 'UPDATE_PASSWORD', 'users', req.user.id, { password: '***' }, { password: 'NEW' });
        
        res.json({
            success: true,
            message: 'Password updated successfully'
        });
    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to change password'
        });
    }
});

/**
 * GET /api/users/:id - Get user by ID (admin only)
 */
router.get('/:id', authMiddleware('admin'), async (req, res) => {
    try {
        const user = await userService.getUserById(req.params.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        res.json({
            success: true,
            data: user
        });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch user'
        });
    }
});

/**
 * POST /api/users - Create new user (admin only)
 */
router.post('/', authMiddleware('admin'), async (req, res) => {
    try {
        const { username, email, password, display_name, full_name, phone_number, role } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: 'Username and password are required'
            });
        }
        
        // Check if username exists
        const existingUser = await userService.getUserByUsername(username);
        if (existingUser) {
            return res.status(409).json({
                success: false,
                error: 'Username already exists'
            });
        }
        
        // Check if email exists
        if (email) {
            const existingEmail = await userService.getUserByEmail(email);
            if (existingEmail) {
                return res.status(409).json({
                    success: false,
                    error: 'Email already exists'
                });
            }
        }
        
        const newUser = await userService.createUser({
            username,
            email,
            password,
            display_name,
            full_name,
            phone_number,
            role: role || 'user'
        });
        
        await logActivity(req.user.id, 'user_create', 'user', { 
            createdUserId: newUser.id,
            username: newUser.username 
        }, req.ip);
        
        // Audit log
        await logAudit(req.user.id, 'CREATE_USER', 'users', newUser.id, null, newUser);
        
        res.status(201).json({
            success: true,
            data: newUser,
            message: 'User created successfully'
        });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create user'
        });
    }
});

/**
 * PUT /api/users/:id - Update user (admin only)
 */
router.put('/:id', authMiddleware('admin'), async (req, res) => {
    try {
        const { display_name, full_name, phone_number, email, role, is_active, is_verified } = req.body;
        
        const user = await userService.getUserById(req.params.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        const updatedUser = await userService.updateUser(req.params.id, {
            display_name,
            full_name,
            phone_number,
            email,
            role,
            is_active,
            is_verified
        });
        
        await logActivity(req.user.id, 'user_update', 'user', { 
            updatedUserId: req.params.id,
            changes: req.body 
        }, req.ip);
        
        // Audit log
        await logAudit(req.user.id, 'UPDATE_USER', 'users', req.params.id, user, updatedUser);
        
        res.json({
            success: true,
            data: updatedUser,
            message: 'User updated successfully'
        });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update user'
        });
    }
});

/**
 * PUT /api/users/:id/password - Reset user password (admin only)
 */
router.put('/:id/password', authMiddleware('admin'), async (req, res) => {
    try {
        const { newPassword } = req.body;
        
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                error: 'Password must be at least 6 characters'
            });
        }
        
        await userService.updateUserPassword(req.params.id, newPassword);
        await logActivity(req.user.id, 'password_reset', 'user', { 
            targetUserId: req.params.id 
        }, req.ip);
        
        // Audit log
        await logAudit(req.user.id, 'RESET_PASSWORD', 'users', req.params.id, { password: '***' }, { password: 'NEW' });
        
        res.json({
            success: true,
            message: 'Password reset successfully'
        });
    } catch (error) {
        console.error('Error resetting password:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reset password'
        });
    }
});

/**
 * DELETE /api/users/:id - Delete user (admin only, soft delete)
 */
router.delete('/:id', authMiddleware('admin'), async (req, res) => {
    try {
        const user = await userService.getUserById(req.params.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        // Prevent self-deletion
        if (parseInt(req.params.id) === req.user.id) {
            return res.status(400).json({
                success: false,
                error: 'Cannot delete your own account'
            });
        }
        
        await userService.deleteUser(req.params.id);
        await logActivity(req.user.id, 'user_delete', 'user', { 
            deletedUserId: req.params.id,
            username: user.username 
        }, req.ip);
        
        // Audit log
        await logAudit(req.user.id, 'DELETE_USER', 'users', req.params.id, user, null);
        
        res.json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete user'
        });
    }
});

/**
 * POST /api/users/:id/verify - Verify user email (admin only)
 */
router.post('/:id/verify', authMiddleware('admin'), async (req, res) => {
    try {
        const updatedUser = await userService.verifyUserEmail(req.params.id);
        
        await logActivity(req.user.id, 'user_verify', 'user', { 
            verifiedUserId: req.params.id 
        }, req.ip);
        
        res.json({
            success: true,
            data: updatedUser,
            message: 'User verified successfully'
        });
    } catch (error) {
        console.error('Error verifying user:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to verify user'
        });
    }
});

module.exports = router;
