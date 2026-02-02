require('dotenv').config(); // Loads .env from current directory (backend/)
const mysql = require('mysql2/promise');

async function updateRolesBackup() {
  console.log('🔌 Connecting to BACKUP database...');
  
  const connection = await mysql.createConnection({
    host: process.env.DB_SECONDARY_HOST,
    port: parseInt(process.env.DB_SECONDARY_PORT, 10),
    user: process.env.DB_SECONDARY_USER,
    password: process.env.DB_SECONDARY_PASSWORD,
    database: process.env.DB_SECONDARY_NAME
  });

  try {
    console.log('🛠️ Updating users table schema on BACKUP server...');
    
    // Execute ALTER TABLE
    await connection.execute(`
      ALTER TABLE users 
      MODIFY COLUMN role ENUM('admin', 'user', 'viewer', 'Administrator', 'Superadmin') DEFAULT 'user'
    `);
    
    console.log('✅ Success! Role ENUM updated on BACKUP server.');
    console.log('   New values: admin, user, viewer, Administrator, Superadmin');
    
  } catch (error) {
    console.error('❌ Error updating database:', error.message);
  } finally {
    await connection.end();
  }
}

updateRolesBackup();
