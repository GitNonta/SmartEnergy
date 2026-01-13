/**
 * MySQL Database Connection Pool
 * 
 * Provides connection to MariaDB/MySQL for authentication and session management.
 */

const mysql = require('mysql2/promise');

// Validate required environment variables
const requiredEnvVars = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required database environment variables:', missingEnvVars.join(', '));
  console.error('   Please check your .env file');
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

// Database configuration from environment
// SECURITY: All values must be set via environment variables
const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

/**
 * Initialize database tables
 */
async function initDatabase() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🔌 Initializing database connection...');
    
    // Create users table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        display_name VARCHAR(100),
        full_name VARCHAR(100),
        phone_number VARCHAR(20),
        role ENUM('admin', 'user', 'viewer') DEFAULT 'user',
        is_active BOOLEAN DEFAULT TRUE,
        is_verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_role (role)
      )
    `);
    
    // Add new columns to existing users table if they don't exist
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN email VARCHAR(255) UNIQUE AFTER username`);
      console.log('  ➕ Added email column');
    } catch (e) { /* Column exists */ }
    
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN full_name VARCHAR(100) AFTER display_name`);
      console.log('  ➕ Added full_name column');
    } catch (e) { /* Column exists */ }
    
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN phone_number VARCHAR(20) AFTER full_name`);
      console.log('  ➕ Added phone_number column');
    } catch (e) { /* Column exists */ }
    
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT FALSE AFTER is_active`);
      console.log('  ➕ Added is_verified column');
    } catch (e) { /* Column exists */ }
    
    console.log('✅ Users table ready');

    // Create sessions table (new schema with last_active, payload)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id VARCHAR(128) PRIMARY KEY,
        user_id INT,
        token VARCHAR(500),
        ip_address VARCHAR(45),
        user_agent VARCHAR(500),
        payload JSON,
        last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user (user_id),
        INDEX idx_expires (expires_at),
        INDEX idx_last_active (last_active)
      )
    `);
    
    // Add new columns to existing sessions table if they don't exist
    try {
      await connection.execute(`ALTER TABLE sessions ADD COLUMN session_id VARCHAR(128) FIRST`);
      console.log('  ➕ Added session_id column');
    } catch (e) { /* Column exists */ }
    
    try {
      await connection.execute(`ALTER TABLE sessions ADD COLUMN payload JSON AFTER user_agent`);
      console.log('  ➕ Added payload column');
    } catch (e) { /* Column exists */ }
    
    try {
      await connection.execute(`ALTER TABLE sessions ADD COLUMN last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER payload`);
      console.log('  ➕ Added last_active column');
    } catch (e) { /* Column exists */ }
    
    // Allow NULL for user_id (for session before login)
    try {
      await connection.execute(`ALTER TABLE sessions MODIFY COLUMN user_id INT NULL`);
    } catch (e) { /* Already nullable */ }
    
    console.log('✅ Sessions table ready');


    // Create activity_logs table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        action VARCHAR(100) NOT NULL,
        resource VARCHAR(100),
        details JSON,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_user (user_id),
        INDEX idx_action (action),
        INDEX idx_created (created_at)
      )
    `);
    console.log('✅ Activity logs table ready');

    // Create audit_logs table for data changes tracking
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        action VARCHAR(100) NOT NULL,
        target_table VARCHAR(100) NOT NULL,
        target_id INT NOT NULL,
        changes JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_audit_user (user_id),
        INDEX idx_audit_target (target_table, target_id),
        INDEX idx_audit_created (created_at)
      )
    `);
    console.log('✅ Audit logs table ready');

    // Create dashboard_layouts table for widget positioning
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS dashboard_layouts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        layout_key VARCHAR(50) UNIQUE NOT NULL DEFAULT 'default',
        layouts JSON NOT NULL,
        updated_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    console.log('✅ Dashboard layouts table ready');

    // Check if admin user exists, create if not
    const [rows] = await connection.execute(
      'SELECT id FROM users WHERE username = ?',
      ['admin']
    );

    if (rows.length === 0) {
      const bcrypt = require('bcrypt');
      const passwordHash = await bcrypt.hash('admin123', 10);
      
      await connection.execute(
        'INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)',
        ['admin', passwordHash, 'Administrator', 'admin']
      );
      console.log('✅ Default admin user created (admin/admin123)');
    }

    console.log('✅ Database initialization complete');

  } catch (error) {
    console.error('❌ Database initialization error:', error.message);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Execute a query with parameters
 */
async function query(sql, params = []) {
  const [results] = await pool.execute(sql, params);
  return results;
}

/**
 * Get a single row
 */
async function queryOne(sql, params = []) {
  const results = await query(sql, params);
  return results[0] || null;
}

/**
 * Test database connection
 */
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

module.exports = {
  pool,
  query,
  queryOne,
  initDatabase,
  testConnection
};
