require('dotenv').config(); // Loads .env from current directory (backend/)
const mysql = require('mysql2/promise');

async function updateRoles() {
  console.log('🔌 Connecting to database...');
  
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    console.log('🛠️ Updating users table schema...');
    
    // Execute ALTER TABLE
    await connection.execute(`
      ALTER TABLE users 
      MODIFY COLUMN role ENUM('admin', 'user', 'viewer', 'Administrator', 'Superadmin') DEFAULT 'user'
    `);
    
    console.log('✅ Success! Role ENUM updated.');
    console.log('   New values: admin, user, viewer, Administrator, Superadmin');
    
  } catch (error) {
    console.error('❌ Error updating database:', error.message);
  } finally {
    await connection.end();
  }
}

updateRoles();
