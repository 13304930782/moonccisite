const db = require('../db');
const { currentScope } = require('../lib/electricityRssToken');
const { getBusinessDate } = require('../lib/electricityTime');
const {
  shiftDate,
  isMidnightWindow,
  completeDay,
  calculateMidnightForecast,
} = require('../lib/electricityDailyUsage');
const parse = (value) =>
  typeof value === 'string' ? JSON.parse(value) : value;

function historyLockName(scope) {
  return `mooncci:elec-history:${scope.slice(0, 40)}`;
}
async function acquireHistoryLock(scope, waitSeconds = 0) {
  const conn = await db.getConnection();
  try {
    const [[row]] = await conn.query('SELECT GET_LOCK(?, ?) AS acquired', [
      historyLockName(scope),
      waitSeconds,
    ]);
    if (!row.acquired) {
      conn.release();
      return null;
    }
    return conn;
  } catch (error) {
    conn.release();
    throw error;
  }
}
async function releaseHistoryLock(conn, scope) {
  try {
    await conn.query('SELECT RELEASE_LOCK(?)', [historyLockName(scope)]);
  } finally {
    conn.release();
  }
}
async function hasSchoolHistory(conn, scope, now) {
  // Older days do not prove the last completed day has been imported. Schools
  // may publish yesterday's total after our midnight collection has finished.
  const yesterday = shiftDate(getBusinessDate(now), -1);
  const [rows] = await conn.query(
    `SELECT 1 FROM electricity_daily_usage WHERE scope_key=? AND usage_date=?
    AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.method'))='school_daily'
    AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.status'))='valid' LIMIT 1`,
    [scope, yesterday],
  );
  return rows.length > 0;
}
async function getSyncState(conn, scope) {
  const [rows] = await conn.query(
    'SELECT setting_value FROM site_settings WHERE setting_key=?',
    [`electricity_history_sync:${scope}`],
  );
  if (!rows.length) return {};
  try {
    return parse(rows[0].setting_value) || {};
  } catch {
    return {};
  }
}
async function setSyncState(conn, scope, state) {
  await conn.query(
    `INSERT INTO site_settings (setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)`,
    [`electricity_history_sync:${scope}`, JSON.stringify(state)],
  );
}
async function importSchoolHistory(conn, snapshot, schoolDays, now) {
  const today = getBusinessDate(now);
  if (!snapshot.scopeKey || !snapshot.meterId)
    throw Object.assign(new Error('缺少电表信息'), {
      code: 'ELECTRICITY_MISSING_METER',
    });
  const days = schoolDays.filter(
    (row) =>
      row.method === 'school_daily' &&
      row.usageDate < today &&
      row.usageDate >= shiftDate(today, -7),
  );
  await conn.beginTransaction();
  try {
    for (const row of days) {
      const payload = {
        ...row,
        meterId: snapshot.meterId,
        retrievedAt: now.toISOString(),
      };
      await conn.query(
        `INSERT INTO electricity_daily_usage (scope_key,usage_date,payload) VALUES (?,?,?)
        ON DUPLICATE KEY UPDATE payload=VALUES(payload)`,
        [snapshot.scopeKey, row.usageDate, JSON.stringify(payload)],
      );
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  }
  return days.filter((row) => row.status === 'valid').length;
}

async function getBoundary(scope, date) {
  const [rows] = await db.query(
    'SELECT payload FROM electricity_midnight_snapshots WHERE scope_key=? AND boundary_date=?',
    [scope, date],
  );
  return rows[0] ? parse(rows[0].payload) : null;
}
async function saveBoundary(snapshot, schoolDays = [], historyError = null) {
  if (!snapshot.scopeKey || !isMidnightWindow(snapshot.recordedAt))
    throw new Error('ELECTRICITY_INVALID_MIDNIGHT_BOUNDARY');
  const scope = snapshot.scopeKey,
    date = snapshot.snapshotDate,
    usageDate = shiftDate(date, -1);
  const conn = await acquireHistoryLock(scope, 15);
  if (!conn)
    throw Object.assign(new Error('历史同步任务正在执行'), {
      code: 'ELECTRICITY_HISTORY_BUSY',
    });
  try {
    await conn.beginTransaction();
    const [inserted] = await conn.query(
      `INSERT IGNORE INTO electricity_midnight_snapshots (scope_key,boundary_date,payload) VALUES (?,?,?)`,
      [scope, date, JSON.stringify({ ...snapshot, historyError })],
    );
    // The unique scope/date key arbitrates duplicate tasks, including concurrent retries.
    if (!inserted.affectedRows) {
      await conn.commit();
      return;
    }
    const [[previous]] = await conn.query(
      'SELECT payload FROM electricity_midnight_snapshots WHERE scope_key=? AND boundary_date=?',
      [scope, usageDate],
    );
    const rows = new Map([
      [
        usageDate,
        completeDay(
          previous ? parse(previous.payload) : null,
          snapshot,
          usageDate,
        ),
      ],
    ]);
    for (const row of schoolDays) {
      if (
        !snapshot.meterId ||
        row.usageDate >= date ||
        row.usageDate < shiftDate(date, -7)
      )
        continue;
      // School day totals are authoritative; a true meter delta can fill a missing upstream day.
      if (row.status === 'valid' || rows.get(row.usageDate)?.status !== 'valid')
        rows.set(row.usageDate, { ...row, meterId: snapshot.meterId });
    }
    for (const row of rows.values()) {
      const payload = { ...row, retrievedAt: snapshot.recordedAt };
      await conn.query(
        `INSERT INTO electricity_daily_usage (scope_key,usage_date,payload) VALUES (?,?,?)
        ON DUPLICATE KEY UPDATE payload=VALUES(payload)`,
        [scope, row.usageDate, JSON.stringify(payload)],
      );
    }
    // Store the day's forecast with its boundary: later balance updates cannot change it.
    const [history] = await conn.query(
      'SELECT payload FROM electricity_daily_usage WHERE scope_key=? AND usage_date>=? AND usage_date<?',
      [scope, shiftDate(date, -7), date],
    );
    const forecast = calculateMidnightForecast(
      history.map((row) => parse(row.payload)),
      snapshot,
      new Date(snapshot.recordedAt),
    );
    await conn.query(
      'UPDATE electricity_midnight_snapshots SET payload=? WHERE scope_key=? AND boundary_date=?',
      [JSON.stringify({ ...snapshot, historyError, forecast }), scope, date],
    );
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await releaseHistoryLock(conn, scope);
  }
}
async function getDailyHistory(days = 30, now = new Date()) {
  const end = getBusinessDate(now),
    start = shiftDate(end, -Math.max(7, Math.min(90, Number(days) || 30)));
  const [rows] = await db.query(
    'SELECT payload FROM electricity_daily_usage WHERE scope_key=? AND usage_date>=? AND usage_date<? ORDER BY usage_date DESC',
    [currentScope(), start, end],
  );
  return rows.map((row) => parse(row.payload));
}
async function getForecast(now = new Date(), meterId) {
  const boundary = await getBoundary(currentScope(), getBusinessDate(now));
  const usable =
    meterId === undefined || (meterId && meterId === boundary?.meterId);
  return {
    ...((usable && boundary?.forecast) ||
      calculateMidnightForecast([], null, now)),
    historyError: boundary?.historyError || null,
  };
}
module.exports = {
  getBoundary,
  saveBoundary,
  getDailyHistory,
  getForecast,
  acquireHistoryLock,
  releaseHistoryLock,
  hasSchoolHistory,
  getSyncState,
  setSyncState,
  importSchoolHistory,
};
