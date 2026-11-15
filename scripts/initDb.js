const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

async function initDb() {
  console.log('Connecting to TiDB Cloud at', process.env.MYSQL_HOST, 'port', process.env.MYSQL_PORT, '...');
  
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || '4000', 10),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
  });

  console.log('✅ Connected to TiDB Cloud!');
  console.log('Creating database snaplink_db if not exists...');
  await conn.query('CREATE DATABASE IF NOT EXISTS snaplink_db;');
  await conn.query('USE snaplink_db;');

  console.log('Creating urls table...');
  await conn.query(`
    CREATE TABLE IF NOT EXISTS urls (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      short_code VARCHAR(10) NOT NULL UNIQUE,
      original_url TEXT NOT NULL,
      user_id VARCHAR(64) NULL,
      expires_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_short_code (short_code),
      INDEX idx_expires_at (expires_at)
    );
  `);

  console.log('Setting auto_increment offset...');
  try {
    await conn.query('ALTER TABLE urls AUTO_INCREMENT = 100000;');
  } catch (e) {
    console.log('Note on auto_increment:', e.message);
  }

  console.log('Creating click_events table...');
  await conn.query(`
    CREATE TABLE IF NOT EXISTS click_events (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      short_code VARCHAR(10) NOT NULL,
      ip_hash VARCHAR(64) NOT NULL,
      user_agent VARCHAR(255) NULL,
      referrer VARCHAR(255) NULL,
      clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_click_short_code (short_code),
      INDEX idx_click_timestamp (short_code, clicked_at)
    );
  `);

  const [tables] = await conn.query('SHOW TABLES;');
  console.log('✅ Tables verified in snaplink_db:', tables);

  await conn.end();
  console.log('🎉 Database initialization complete!');
}

initDb().catch((err) => {
  console.error('❌ Database initialization error:', err);
  process.exit(1);
});
