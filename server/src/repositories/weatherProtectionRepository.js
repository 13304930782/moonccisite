// Only fixed upstream buckets are persisted; no visitor identifiers or API Keys.
function createProtectionRepository(db) {
  return {
    async mutate(group, callback) {
      if (
        ![
          'amap-weather',
          'amap-lbs',
          'global-weather',
          'global-cities',
        ].includes(group)
      )
        throw Error('INVALID_BUDGET_GROUP');
      const key = `weather_budget:v1:${group}`;
      const conn = await db.getConnection();
      let locked = false;
      try {
        const [rows] = await conn.query('SELECT GET_LOCK(?, 1) AS acquired', [
          key,
        ]);
        if (Number(rows[0].acquired) !== 1) throw Error('BUDGET_BUSY');
        locked = true;
        const [data] = await conn.query(
          'SELECT setting_value FROM site_settings WHERE setting_key=?',
          [key],
        );
        // Corrupt counters must not silently reset allowance.
        const state = data.length ? JSON.parse(data[0].setting_value) : {};
        const result = callback(state);
        await conn.query(
          'INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',
          [key, JSON.stringify(state)],
        );
        return result;
      } finally {
        try {
          if (locked) await conn.query('SELECT RELEASE_LOCK(?)', [key]);
        } finally {
          conn.release();
        }
      }
    },
  };
}
let repository;
function defaultRepository() {
  if (!repository) {
    // Weather cache locks hold connections. A separate tiny pool avoids nested-pool starvation.
    require('../db');
    const db = require('mysql2/promise').createPool({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      charset: 'utf8mb4',
      connectionLimit: 2,
      waitForConnections: true,
      queueLimit: 64,
    });
    repository = createProtectionRepository(db);
  }
  return repository;
}
module.exports = { createProtectionRepository, defaultRepository };
