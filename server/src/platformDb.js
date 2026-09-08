// New content timestamps are UTC, independently of the legacy server's timezone.
require('./db'); // Load the existing environment configuration first.
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: Math.max(5, Number(process.env.CONTENT_DB_CONNECTION_LIMIT || 5)),
  charset: 'utf8mb4',
  timezone: 'Z',
  waitForConnections: true,
});
pool.pool.on('connection', (connection) => connection.query("SET time_zone = '+00:00'"));
module.exports = pool;
