/**
 * User Service
 * 
 * CRUD operations for user management.
 */

const db = require('./db');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

/**
 * Get all users (admin function)
 */
async function getAllUsers(options = {}) {
    const { includeInactive = false, limit = 100, offset = 0 } = options;
    
    let query = `
        SELECT id, username, email, display_name, full_name, phone_number,
               role, is_active, is_verified, created_at, updated_at
        FROM users
    `;
    
    if (!includeInactive) {
        query += ' WHERE is_active = TRUE';
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    
    return db.query(query, [limit, offset]);
}

/**
 * Get user by ID
 */
async function getUserById(id) {
    return db.queryOne(
        `SELECT id, username, email, display_name, full_name, phone_number,
                role, is_active, is_verified, created_at, updated_at
         FROM users WHERE id = ?`,
        [id]
    );
}

/**
 * Get user by username
 */
async function getUserByUsername(username) {
    return db.queryOne(
        `SELECT id, username, email, display_name, full_name, phone_number,
                role, is_active, is_verified, created_at, updated_at
         FROM users WHERE username = ?`,
        [username]
    );
}

/**
 * Get user by email
 */
async function getUserByEmail(email) {
    return db.queryOne(
        `SELECT id, username, email, display_name, full_name, phone_number,
                role, is_active, is_verified, created_at, updated_at
         FROM users WHERE email = ?`,
        [email]
    );
}

/**
 * Create new user
 */
async function createUser(userData) {
    const {
        username,
        email,
        password,
        display_name,
        full_name,
        phone_number,
        role = 'user',
        is_verified = false
    } = userData;
    
    // Hash password
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    
    const result = await db.query(
        `INSERT INTO users (username, email, password_hash, display_name, full_name, phone_number, role, is_verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [username, email, password_hash, display_name, full_name, phone_number, role, is_verified]
    );
    
    return getUserById(result.insertId);
}

/**
 * Update user
 */
async function updateUser(id, updates) {
    const allowedFields = ['email', 'display_name', 'full_name', 'phone_number', 'role', 'is_active', 'is_verified'];
    const setClause = [];
    const values = [];
    
    for (const field of allowedFields) {
        if (updates[field] !== undefined) {
            setClause.push(`${field} = ?`);
            values.push(updates[field]);
        }
    }
    
    if (setClause.length === 0) {
        return getUserById(id);
    }
    
    values.push(id);
    
    await db.query(
        `UPDATE users SET ${setClause.join(', ')} WHERE id = ?`,
        values
    );
    
    return getUserById(id);
}

/**
 * Update user password
 */
async function updateUserPassword(id, newPassword) {
    const password_hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    
    await db.query(
        'UPDATE users SET password_hash = ? WHERE id = ?',
        [password_hash, id]
    );
    
    return true;
}

/**
 * Delete user (soft delete)
 */
async function deleteUser(id) {
    await db.query(
        'UPDATE users SET is_active = FALSE WHERE id = ?',
        [id]
    );
    return true;
}

/**
 * Hard delete user
 */
async function hardDeleteUser(id) {
    await db.query('DELETE FROM users WHERE id = ?', [id]);
    return true;
}

/**
 * Get user count
 */
async function getUserCount(includeInactive = false) {
    const condition = includeInactive ? '' : 'WHERE is_active = TRUE';
    const result = await db.queryOne(
        `SELECT COUNT(*) as count FROM users ${condition}`
    );
    return result?.count || 0;
}

/**
 * Verify user email
 */
async function verifyUserEmail(id) {
    await db.query(
        'UPDATE users SET is_verified = TRUE WHERE id = ?',
        [id]
    );
    return getUserById(id);
}

module.exports = {
    getAllUsers,
    getUserById,
    getUserByUsername,
    getUserByEmail,
    createUser,
    updateUser,
    updateUserPassword,
    deleteUser,
    hardDeleteUser,
    getUserCount,
    verifyUserEmail
};
