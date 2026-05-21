/**
 * MySQL Database Connection Pool with Failover Support
 * 
 * Provides connection to MariaDB/MySQL for authentication and session management.
 * Supports automatic failover to secondary database when primary is unavailable.
 */

const mysql = require('mysql2/promise');

// Validate required environment variables for primary database
const requiredEnvVars = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required database environment variables:', missingEnvVars.join(', '));
  console.error('   Please check your .env file');
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

// Primary database configuration
const primaryConfig = {
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

// Secondary database configuration (failover)
const secondaryConfig = process.env.DB_SECONDARY_HOST ? {
  host: process.env.DB_SECONDARY_HOST,
  port: parseInt(process.env.DB_SECONDARY_PORT || '3306', 10),
  user: process.env.DB_SECONDARY_USER || process.env.DB_USER,
  password: process.env.DB_SECONDARY_PASSWORD || process.env.DB_PASSWORD,
  database: process.env.DB_SECONDARY_NAME || process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
} : null;

// Failover enabled flag
const failoverEnabled = process.env.DB_FAILOVER_ENABLED !== 'false' && secondaryConfig !== null;

// Create connection pools
const primaryPool = mysql.createPool(primaryConfig);
const secondaryPool = secondaryConfig ? mysql.createPool(secondaryConfig) : null;

// Track database health status
let primaryHealthy = true;
let lastHealthCheck = Date.now();
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds

/**
 * Check if primary database is healthy
 */
async function checkPrimaryHealth() {
  try {
    const connection = await primaryPool.getConnection();
    await connection.ping();
    connection.release();
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Periodically check and recover primary database connection
 */
async function tryRecoverPrimary() {
  if (!primaryHealthy && Date.now() - lastHealthCheck > HEALTH_CHECK_INTERVAL) {
    lastHealthCheck = Date.now();
    const isHealthy = await checkPrimaryHealth();
    if (isHealthy) {
      primaryHealthy = true;
      console.log('✅ Primary database recovered, switching back');
    }
  }
}

/**
 * Execute query with automatic failover
 */
async function executeWithFailover(pool, sql, params) {
  try {
    const [results] = await pool.execute(sql, params);
    return results;
  } catch (error) {
    // Check if this is a connection error
    const isConnectionError = [
      'ECONNREFUSED',
      'ETIMEDOUT', 
      'ENOTFOUND',
      'PROTOCOL_CONNECTION_LOST',
      'ER_ACCESS_DENIED_ERROR',
      'ER_HOST_IS_BLOCKED',
      'ER_HOST_NOT_PRIVILEGED'
    ].some(code => error.code === code || error.message?.includes(code));
    
    if (isConnectionError) {
      throw { ...error, isConnectionError: true };
    }
    throw error;
  }
}

/**
 * Execute a query with parameters (with failover support)
 */
async function query(sql, params = []) {
  // Try to recover primary if it was down
  tryRecoverPrimary();
  
  // Use primary if healthy, otherwise try secondary
  if (primaryHealthy) {
    try {
      return await executeWithFailover(primaryPool, sql, params);
    } catch (error) {
      if (error.isConnectionError && failoverEnabled && secondaryPool) {
        console.warn('⚠️ Primary database failed, switching to secondary');
        primaryHealthy = false;
        lastHealthCheck = Date.now();
        
        try {
          return await executeWithFailover(secondaryPool, sql, params);
        } catch (secondaryError) {
          console.error('❌ Secondary database also failed');
          throw secondaryError;
        }
      }
      throw error;
    }
  } else if (failoverEnabled && secondaryPool) {
    // Primary is known to be down, use secondary
    try {
      return await executeWithFailover(secondaryPool, sql, params);
    } catch (error) {
      // Try primary as last resort
      console.warn('⚠️ Secondary failed, trying primary as fallback');
      return await executeWithFailover(primaryPool, sql, params);
    }
  } else {
    // No failover available, use primary
    return await executeWithFailover(primaryPool, sql, params);
  }
}

/**
 * Get a single row (with failover support)
 */
async function queryOne(sql, params = []) {
  const results = await query(sql, params);
  return results[0] || null;
}

/**
 * Get the active pool (primary or secondary based on health)
 */
function getActivePool() {
  if (primaryHealthy) {
    return primaryPool;
  }
  return failoverEnabled && secondaryPool ? secondaryPool : primaryPool;
}

/**
 * Initialize database tables
 */
async function initDatabase() {
  const pool = getActivePool();
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
        role ENUM('admin', 'user', 'viewer', 'Administrator', 'Superadmin') DEFAULT 'user',
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

    // Update role ENUM to include 'Administrator', 'superadmin', 'Superadmin'
    try {
      await connection.execute(`
        ALTER TABLE users
        MODIFY COLUMN role ENUM('admin', 'user', 'viewer', 'Administrator', 'Superadmin') DEFAULT 'user'
      `);
      console.log('  ➕ Updated role ENUM values');
    } catch (e) {
      console.warn('  ⚠️ Could not update role ENUM:', e.message);
    }

    // Create password_resets table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token VARCHAR(255) NOT NULL,
        otp_code VARCHAR(6),
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        used BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_token (token)
      )
    `);
    
    try {
      await connection.execute(`ALTER TABLE password_resets ADD COLUMN otp_code VARCHAR(6) AFTER token`);
      console.log('  ➕ Added otp_code column to password_resets');
    } catch (e) { /* Column exists */ }
    
    console.log('✅ Password resets table ready');

    console.log('✅ Users table ready');
    // Create sessions table
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

    // Create audit_logs table for data changes tracking and security audit
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        action VARCHAR(100) NOT NULL,
        target_table VARCHAR(100),
        target_id INT,
        changes JSON,
        ip_address VARCHAR(45),
        user_agent VARCHAR(500),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_audit_user (user_id),
        INDEX idx_audit_target (target_table, target_id),
        INDEX idx_audit_created (created_at),
        INDEX idx_audit_ip (ip_address)
      )
    `);
    
    // Add new columns to existing audit_logs table
    try {
      await connection.execute(`ALTER TABLE audit_logs ADD COLUMN ip_address VARCHAR(45) AFTER changes`);
      console.log('  ➕ Added ip_address column to audit_logs');
    } catch (e) { /* Column exists */ }

    try {
      await connection.execute(`ALTER TABLE audit_logs ADD COLUMN user_agent VARCHAR(500) AFTER ip_address`);
      console.log('  ➕ Added user_agent column to audit_logs');
    } catch (e) { /* Column exists */ }

    // Make target_table and target_id nullable for system events
    try {
      await connection.execute(`ALTER TABLE audit_logs MODIFY COLUMN target_table VARCHAR(100) NULL`);
      await connection.execute(`ALTER TABLE audit_logs MODIFY COLUMN target_id INT NULL`);
    } catch (e) { /* Ignore */ }

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
 * Test database connection (both primary and secondary)
 */
async function testConnection() {
  let primaryOk = false;
  let secondaryOk = false;
  
  try {
    const connection = await primaryPool.getConnection();
    await connection.ping();
    connection.release();
    console.log('✅ Primary database connection successful');
    primaryOk = true;
  } catch (error) {
    console.error('❌ Primary database connection failed:', error.message);
    primaryHealthy = false;
  }
  
  if (secondaryPool) {
    try {
      const connection = await secondaryPool.getConnection();
      await connection.ping();
      connection.release();
      console.log('✅ Secondary database connection successful');
      secondaryOk = true;
    } catch (error) {
      console.error('❌ Secondary database connection failed:', error.message);
    }
  }
  
  return primaryOk || secondaryOk;
}

/**
 * Get database health status
 */
function getHealthStatus() {
  return {
    primaryHealthy,
    failoverEnabled,
    hasSecondary: secondaryPool !== null,
    lastHealthCheck: new Date(lastHealthCheck).toISOString()
  };
}

// Legacy pool export for backwards compatibility
const pool = primaryPool;

module.exports = {
  pool,
  primaryPool,
  secondaryPool,
  query,
  queryOne,
  initDatabase,
  testConnection,
  getHealthStatus,
  getActivePool
};
