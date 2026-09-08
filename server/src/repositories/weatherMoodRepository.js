const db = require('../db');
async function withLock(key, callback) {
  if (
    key !== 'weather_city_reverse:v1' &&
    !/^weather_mood:v2:[a-f0-9]{32}$/.test(key)
  )
    throw new Error('INVALID_WEATHER_CACHE_KEY');
  const conn = await db.getConnection();
  let locked = false;
  try {
    const [rows] = await conn.query('SELECT GET_LOCK(?, 0) AS acquired', [key]);
    locked = Number(rows[0].acquired) === 1;
    if (!locked) return null;
    const [settings] = await conn.query(
      'SELECT setting_value FROM site_settings WHERE setting_key=?',
      [key],
    );
    let state = {};
    try {
      state = JSON.parse(settings[0]?.setting_value || '{}') || {};
    } catch {}
    return await callback(state, async (value) => {
      await conn.query(
        'INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',
        [key, JSON.stringify(value)],
      );
    });
  } finally {
    try {
      if (locked) await conn.query('SELECT RELEASE_LOCK(?)', [key]);
    } finally {
      conn.release();
    }
  }
}
const OVERRIDE_KEY = 'weather_companion_override:v1';
async function readOverride() {
  const [rows] = await db.query(
    'SELECT setting_value FROM site_settings WHERE setting_key=?',
    [OVERRIDE_KEY],
  );
  try {
    return JSON.parse(rows[0]?.setting_value || 'null');
  } catch {
    return null;
  }
}
async function writeOverride(value) {
  await db.query(
    'INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',
    [OVERRIDE_KEY, JSON.stringify(value)],
  );
}
module.exports = { withLock, readOverride, writeOverride };
