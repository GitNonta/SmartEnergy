require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrateUsers() {
  console.log('🚀 Starting User Migration...');
  
  let mainConnection, backupConnection;

  try {
    // 1. Connect to Main Database
    console.log('🔌 Connecting to MAIN database...');
    mainConnection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT, 10),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    // 2. Connect to Backup Database
    console.log('🔌 Connecting to BACKUP database...');
    backupConnection = await mysql.createConnection({
        host: process.env.DB_SECONDARY_HOST,
        port: parseInt(process.env.DB_SECONDARY_PORT, 10),
        user: process.env.DB_SECONDARY_USER,
        password: process.env.DB_SECONDARY_PASSWORD,
        database: process.env.DB_SECONDARY_NAME
    });

    // 3. Fetch all users from Main DB
    console.log('📥 Fetching users from MAIN database...');
    const [users] = await mainConnection.execute('SELECT * FROM users');
    
    if (users.length === 0) {
        console.log('⚠️ No users found in MAIN database. Aborting migration.');
        return;
    }
    console.log(`✅ Found ${users.length} users.`);

    // 4. Clear Backup DB users table
    console.log('🧹 Clearing users table in BACKUP database...');
    await backupConnection.execute('SET FOREIGN_KEY_CHECKS = 0');
    await backupConnection.execute('TRUNCATE TABLE users');
    console.log('✅ BACKUP users table cleared.');

    // 5. Insert users into Backup DB
    console.log('📤 Inserting users into BACKUP database...');
    
    // Construct INSERT query dynamically
    const keys = Object.keys(users[0]);
    const placeholders = keys.map(() => '?').join(',');
    const sql = `INSERT INTO users (${keys.join(',')}) VALUES (${placeholders})`;

    for (const user of users) {
        const values = keys.map(key => user[key]);
        await backupConnection.execute(sql, values);
    }
    
    await backupConnection.execute('SET FOREIGN_KEY_CHECKS = 1');
    console.log(`✅ Successfully migrated ${users.length} users to BACKUP database.`);

  } catch (error) {
    console.error('❌ Error during migration:', error);
  } finally {
    if (mainConnection) await mainConnection.end();
    if (backupConnection) await backupConnection.end();
  }
}

migrateUsers();
