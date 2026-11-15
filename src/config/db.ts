import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  user: process.env.MYSQL_USER || 'snaplink_user',
  password: process.env.MYSQL_PASSWORD || 'snaplink_pass',
  database: process.env.MYSQL_DATABASE || 'snaplink_db',
  ssl: process.env.MYSQL_SSL === 'true' || process.env.MYSQL_HOST?.includes('tidbcloud.com') || process.env.MYSQL_HOST?.includes('aivencloud.com')
    ? { minVersion: 'TLSv1.2', rejectUnauthorized: true }
    : undefined,
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

export async function checkDbConnection(): Promise<void> {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    console.log('✅ MySQL Database connected successfully.');
  } catch (error) {
    console.error('❌ Failed to connect to MySQL:', error);
  }
}
