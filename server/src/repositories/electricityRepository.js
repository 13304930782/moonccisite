const { roomContext } = require('../lib/electricityContext');
const db = require('../db');
const { currentScope } = require('../lib/electricityRssToken');
const {
  defaultSchedule,
  validateSchedule,
  scheduleFromConfig,
} = require('../lib/electricitySchedule');

const DEFAULT_CONFIG = {
  schedule: defaultSchedule(),
  enabled:
    String(process.env.ELECTRICITY_ENABLED || 'true').toLowerCase() === 'true',
  dailyNotify:
    String(process.env.ELECTRICITY_DAILY_NOTIFY || 'true').toLowerCase() ===
    'true',
  notifyHour: Math.trunc(
    numberInRange(process.env.ELECTRICITY_NOTIFY_HOUR, 21, 0, 23),
  ),
  lowPurchaseThreshold: numberInRange(
    process.env.ELECTRICITY_LOW_PURCHASE_THRESHOLD,
    10,
    0,
    100000,
  ),
  lowTotalThreshold: numberInRange(
    process.env.ELECTRICITY_LOW_TOTAL_THRESHOLD,
    20,
    0,
    100000,
  ),
  notifyTo: '',
};

function safeParse(value, fallback) {
  try {
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
}

function numberInRange(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max
    ? number
    : fallback;
}

function boolValue(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (['true', '1'].includes(String(value).toLowerCase())) return true;
  if (['false', '0'].includes(String(value).toLowerCase())) return false;
  return fallback;
}

function normalizeConfig(input = {}, fallback = DEFAULT_CONFIG) {
  return {
    schedule: scheduleFromConfig({
      schedule: input.schedule ?? fallback.schedule,
    }),
    enabled: boolValue(input.enabled, fallback.enabled),
    dailyNotify: boolValue(input.dailyNotify, fallback.dailyNotify),
    notifyHour: Math.trunc(
      numberInRange(input.notifyHour, fallback.notifyHour, 0, 23),
    ),
    lowPurchaseThreshold: numberInRange(
      input.lowPurchaseThreshold,
      fallback.lowPurchaseThreshold,
      0,
      100000,
    ),
    lowTotalThreshold: numberInRange(
      input.lowTotalThreshold,
      fallback.lowTotalThreshold,
      0,
      100000,
    ),
    notifyTo: String(input.notifyTo ?? fallback.notifyTo ?? '')
      .trim()
      .slice(0, 254),
  };
}

async function getElectricityConfig() {
  const room = roomContext();
  if (room) {
    const [rows] = await db.query(
      'SELECT config, active FROM electricity_rooms WHERE id=?',
      [room.id],
    );
    if (!rows[0]) throw new Error('ELECTRICITY_ROOM_UNAVAILABLE');
    const saved =
      typeof rows[0].config === 'string'
        ? JSON.parse(rows[0].config)
        : rows[0].config;
    return {
      ...normalizeConfig(saved),
      enabled: Boolean(rows[0].active) && normalizeConfig(saved).enabled,
    };
  }
  const [rows] = await db.query(
    'SELECT setting_value FROM site_settings WHERE setting_key=? LIMIT 1',
    ['electricity'],
  );
  return normalizeConfig(
    rows[0] ? safeParse(rows[0].setting_value, {}) : {},
    DEFAULT_CONFIG,
  );
}

async function saveElectricityConfig(input) {
  if (Object.prototype.hasOwnProperty.call(input, 'schedule'))
    validateSchedule(input.schedule);
  const current = await getElectricityConfig();
  const config = normalizeConfig(input, current);
  if (roomContext()) {
    await db.query(
      'UPDATE electricity_rooms SET config=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
      [JSON.stringify(config), roomContext().id],
    );
    return config;
  }
  await db.query(
    `INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)`,
    ['electricity', JSON.stringify(config)],
  );
  return config;
}

function mapSnapshot(row) {
  if (!row) return null;
  const numberOrNull = (value) =>
    value === null || value === undefined ? null : Number(value);
  const snapshotDate =
    row.snapshot_date instanceof Date
      ? `${row.snapshot_date.getFullYear()}-${String(row.snapshot_date.getMonth() + 1).padStart(2, '0')}-${String(row.snapshot_date.getDate()).padStart(2, '0')}`
      : String(row.snapshot_date);
  return {
    snapshotDate,
    recordedAt:
      row.recorded_at instanceof Date
        ? row.recorded_at.toISOString()
        : String(row.recorded_at),
    scopeKey: row.scope_key || null,
    cumulativeReading: numberOrNull(row.cumulative_reading),
    cumulativeReadingSource: row.cumulative_reading_source || null,
    roomName: row.room_name,
    meterId: row.meter_id,
    deviceName: row.device_name,
    meterStatus: row.meter_status,
    todayUse: numberOrNull(row.today_use),
    purchasedRemaining: numberOrNull(row.purchased_remaining),
    subsidyRemaining: numberOrNull(row.subsidy_remaining),
    totalRemaining: numberOrNull(row.total_remaining),
    price: numberOrNull(row.price),
  };
}

async function getSnapshotByDate(snapshotDate) {
  const [rows] = await db.query(
    'SELECT * FROM electricity_snapshots WHERE scope_key=? AND snapshot_date=? LIMIT 1',
    [currentScope(), snapshotDate],
  );
  return mapSnapshot(rows[0]);
}

async function upsertSnapshot(snapshot, snapshotDate, recordedAt) {
  await db.query(
    `INSERT INTO electricity_snapshots
      (snapshot_date, recorded_at, room_name, meter_id, device_name, meter_status, today_use,
       purchased_remaining, subsidy_remaining, total_remaining, price, scope_key, cumulative_reading, cumulative_reading_source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE recorded_at=VALUES(recorded_at), room_name=VALUES(room_name),
       meter_id=VALUES(meter_id), device_name=VALUES(device_name), meter_status=VALUES(meter_status),
       today_use=VALUES(today_use), purchased_remaining=VALUES(purchased_remaining),
       subsidy_remaining=VALUES(subsidy_remaining), total_remaining=VALUES(total_remaining), price=VALUES(price), scope_key=VALUES(scope_key), cumulative_reading=VALUES(cumulative_reading), cumulative_reading_source=VALUES(cumulative_reading_source)`,
    [
      snapshotDate,
      recordedAt,
      snapshot.roomName,
      snapshot.meterId,
      snapshot.deviceName,
      snapshot.status,
      snapshot.todayUse,
      snapshot.purchasedRemaining,
      snapshot.subsidyRemaining,
      snapshot.totalRemaining,
      snapshot.price,
      currentScope(),
      snapshot.cumulativeReading ?? null,
      snapshot.cumulativeReadingSource ?? null,
    ],
  );
  return getSnapshotByDate(snapshotDate);
}

async function getLatestSnapshot() {
  const [rows] = await db.query(
    'SELECT * FROM electricity_snapshots WHERE scope_key=? ORDER BY snapshot_date DESC, recorded_at DESC LIMIT 1',
    [currentScope()],
  );
  return mapSnapshot(rows[0]);
}

async function getSnapshotHistory(days = 30) {
  const limit = Math.max(1, Math.min(90, Math.trunc(Number(days) || 30)));
  const [rows] = await db.query(
    `SELECT * FROM electricity_snapshots WHERE scope_key=? ORDER BY snapshot_date DESC LIMIT ${limit}`,
    [currentScope()],
  );
  return rows.map(mapSnapshot).reverse();
}

async function getMonitorState() {
  await db.query(
    'INSERT IGNORE INTO electricity_room_state (scope_key) VALUES (?)',
    [currentScope()],
  );
  const [rows] = await db.query(
    'SELECT * FROM electricity_room_state WHERE scope_key=? LIMIT 1',
    [currentScope()],
  );
  const row = rows[0] || {};
  const dateOnly = (value) =>
    value
      ? String(
          value instanceof Date
            ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
            : value,
        )
      : null;
  return {
    lowAlertActive: Boolean(row.low_alert_active),
    lastLowAlertAt: row.last_low_alert_at || null,
    lastRecoveredAt: row.last_recovered_at || null,
    lastDailyEmailDate: dateOnly(row.last_daily_email_date),
    lastDailyEmailSlot: row.last_daily_email_slot || null,
    lastSuccessAt: row.last_success_at || null,
    lastErrorAt: row.last_error_at || null,
    lastErrorCode: row.last_error_code || null,
  };
}

async function markCollectionSuccess(recordedAt) {
  await db.query(
    'INSERT IGNORE INTO electricity_room_state (scope_key) VALUES (?)',
    [currentScope()],
  );
  await db.query(
    'UPDATE electricity_room_state SET last_success_at=?, last_error_at=NULL, last_error_code=NULL WHERE scope_key=?',
    [recordedAt, currentScope()],
  );
}

async function markCollectionFailure(recordedAt, code) {
  await db.query(
    'INSERT IGNORE INTO electricity_room_state (scope_key) VALUES (?)',
    [currentScope()],
  );
  await db.query(
    'UPDATE electricity_room_state SET last_error_at=?, last_error_code=? WHERE scope_key=?',
    [recordedAt, String(code || 'UNKNOWN').slice(0, 100), currentScope()],
  );
}

async function markDailyEmailSent(snapshotDate, slot) {
  await db.query(
    'UPDATE electricity_room_state SET last_daily_email_date=?, last_daily_email_slot=? WHERE scope_key=?',
    [snapshotDate, slot, currentScope()],
  );
}

async function setLowAlertState(active, recordedAt) {
  await db.query(
    `UPDATE electricity_room_state
     SET low_alert_active=?, last_low_alert_at=IF(?, ?, last_low_alert_at), last_recovered_at=IF(?, ?, last_recovered_at)
     WHERE scope_key=?`,
    [
      active ? 1 : 0,
      active ? 1 : 0,
      recordedAt,
      active ? 0 : 1,
      recordedAt,
      currentScope(),
    ],
  );
}

module.exports = {
  DEFAULT_CONFIG,
  getElectricityConfig,
  getLatestSnapshot,
  getMonitorState,
  getSnapshotByDate,
  getSnapshotHistory,
  markCollectionFailure,
  markCollectionSuccess,
  markDailyEmailSent,
  normalizeConfig,
  saveElectricityConfig,
  setLowAlertState,
  upsertSnapshot,
};
