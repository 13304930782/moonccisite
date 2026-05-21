const path = require('path');
require('dotenv').config({
  path: path.resolve(__dirname, '../.env'),
});

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 20),
  queueLimit: 0,
  charset: 'utf8mb4',
});

module.exports = pool;
