const crypto = require('crypto');
const db = require('../db');
const { encrypt, decrypt } = require('../lib/electricityCredentials');
const { currentScope, hash } = require('../lib/electricityRssToken');
const { withRoom } = require('../lib/electricityContext');
const { defaultSchedule } = require('../lib/electricitySchedule');
const parse = (value) =>
  typeof value === 'string' ? JSON.parse(value) : value;
const problem = (message, status = 400) =>
  Object.assign(new Error(message), { status, code: 'ELECTRICITY_ROOM_INPUT' });
function publicRoom(row) {
  return {
    id: row.id,
    name: row.name,
    active: Boolean(row.active),
    legacy: Boolean(row.legacy),
    verifiedAt: row.verified_at || null,
    memberCount: Number(row.member_count || 0),
  };
}
async function listRooms(user) {
  const owner = user.role === 'owner';
  const [rows] = await db.query(
    `SELECT r.*, (SELECT COUNT(*) FROM electricity_room_members m WHERE m.room_id=r.id) AS member_count FROM electricity_rooms r
 WHERE ${owner ? '1=1' : 'r.active=1 AND r.legacy=0 AND EXISTS (SELECT 1 FROM electricity_room_members m WHERE m.room_id=r.id AND m.user_id=?)'} ORDER BY r.legacy DESC,r.created_at,r.id`,
    owner ? [] : [user.id],
  );
  return rows.map(publicRoom);
}
async function getRoom(id) {
  const [rows] = await db.query('SELECT * FROM electricity_rooms WHERE id=?', [
    id,
  ]);
  return rows[0] || null;
}
async function accessibleRoom(user, id) {
  if (!user || user.status === 'disabled') return null;
  const room = await getRoom(id);
  if (!room) return null;
  if (user.role === 'owner') return room;
  if (!room.active || room.legacy) return null;
  const [rows] = await db.query(
    'SELECT 1 FROM electricity_room_members WHERE room_id=? AND user_id=?',
    [id, user.id],
  );
  return rows.length ? room : null;
}
async function inRoom(room, callback, { credentials = false } = {}) {
  return withRoom(
    {
      ...room,
      credentials: credentials
        ? decrypt(room.credentials_encrypted, room.id)
        : undefined,
    },
    callback,
  );
}
async function members(roomId) {
  const [rows] = await db.query(
    'SELECT u.id,u.username,u.email,u.status FROM electricity_room_members m JOIN users u ON u.id=m.user_id WHERE m.room_id=? ORDER BY u.username',
    [roomId],
  );
  return rows;
}
async function resolveMembers(names) {
  if (
    !Array.isArray(names) ||
    names.length > 30 ||
    names.some((n) => typeof n !== 'string' || n.length > 100)
  )
    throw problem('每个宿舍最多绑定 30 个网站用户名。');
  const ids = [];
  for (const name of [...new Set(names.map((n) => n.trim()).filter(Boolean))]) {
    const [rows] = await db.query(
      "SELECT id FROM users WHERE username=? AND status<>'disabled'",
      [name],
    );
    if (!rows.length)
      throw problem(`网站用户“${name}”不存在或已停用，请先注册。`);
    ids.push(rows[0].id);
  }
  return ids;
}
async function replaceMembers(conn, room, ids) {
  if (room.legacy && ids.length)
    throw problem('原有宿舍仅站长可见，不能绑定普通成员。');
  // Delete tokens for removed users in the same transaction. Re-adding never revives old links.
  await conn.query(
    `DELETE s FROM electricity_rss_subscriptions s JOIN electricity_room_members m ON m.user_id=s.user_id AND m.room_id=? WHERE s.scope_key=? ${ids.length ? 'AND s.user_id NOT IN (' + ids.map(() => '?').join(',') + ')' : ''}`,
    [room.id, room.scope_key, ...ids],
  );
  await conn.query('DELETE FROM electricity_room_members WHERE room_id=?', [
    room.id,
  ]);
  for (const id of ids)
    await conn.query(
      'INSERT INTO electricity_room_members(room_id,user_id) VALUES(?,?)',
      [room.id, id],
    );
}
function normalizeInput(input) {
  const name = String(input.name || '').trim(),
    account = String(input.account || '').trim(),
    roomVerify = String(input.roomVerify || '').trim();
  if (
    !name ||
    name.length > 100 ||
    !account ||
    account.length > 256 ||
    !roomVerify ||
    roomVerify.length > 4096
  )
    throw problem('请填写宿舍名称、学校账号和宿舍校验凭据。');
  const notifyTo = String(input.notifyTo || '').trim();
  if (
    notifyTo.length > 254 ||
    (notifyTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notifyTo))
  )
    throw problem('通知邮箱格式不正确。');
  // Same school's adapter and customer code. No user supplied upstream URL.
  const credentials = {
    account,
    roomVerify,
    customerCode: String(process.env.ELECTRICITY_CUSTOMER_CODE || '2252'),
  };
  const fingerprint = currentScope({
    ELECTRICITY_SCHOOL_ACCOUNT: account,
    ELECTRICITY_ROOM_VERIFY: roomVerify,
    ELECTRICITY_CUSTOMER_CODE: credentials.customerCode,
  });
  return {
    name,
    credentials,
    fingerprint,
    notifyTo,
    memberNames: input.members || [],
  };
}
async function prepareRoom(input, existingId = null) {
  const value = normalizeInput(input),
    memberIds = await resolveMembers(value.memberNames);
  const [duplicate] = await db.query(
    'SELECT id FROM electricity_rooms WHERE credential_hash=?',
    [value.fingerprint],
  );
  if (duplicate.some((r) => r.id !== existingId))
    throw problem('该账号与宿舍已经添加，请在原宿舍中绑定成员。');
  const id = existingId || crypto.randomUUID();
  const { fetchElectricitySnapshot } = require('../lib/electricity');
  const snapshot = await withRoom(
    { id, scope_key: value.fingerprint, credentials: value.credentials },
    () => fetchElectricitySnapshot({ timeoutMs: 6000 }),
  );
  if (!snapshot.meterId) throw problem('学校未返回有效电表，未保存宿舍。');
  const meterIdentity = hash(
    `${value.credentials.customerCode}:${snapshot.meterId}`,
  );
  const [sameMeter] = await db.query(
    'SELECT id FROM electricity_rooms WHERE meter_identity=?',
    [meterIdentity],
  );
  if (sameMeter.some((r) => r.id !== existingId))
    throw problem('该电表已在其他宿舍中，请绑定到已有宿舍，避免重复采集。');
  return {
    ...value,
    id,
    memberIds,
    meterIdentity,
    schoolName: snapshot.roomName || value.name,
  };
}
async function importRooms(inputs, preview = false) {
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 10)
    throw problem('每次添加或导入 1 至 10 个宿舍。');
  const prepared = [];
  const deadline = Date.now() + 45000;
  for (const input of inputs) {
    if (Date.now() > deadline - 20000)
      throw problem('验证耗时较长，请减少单次导入数量。');
    prepared.push(await prepareRoom(input));
  }
  if (new Set(prepared.map((r) => r.meterIdentity)).size !== prepared.length)
    throw problem('导入内容包含重复电表。');
  if (preview)
    return prepared.map((r) => ({
      name: r.name,
      schoolName: r.schoolName,
      members: r.memberNames,
      notifyTo: r.notifyTo,
    }));
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const room of prepared) {
      const scope = hash(`mooncci-room:${room.id}`);
      await conn.query(
        'INSERT INTO electricity_rooms(id,scope_key,name,credentials_encrypted,credential_hash,meter_identity,config,verified_at) VALUES(?,?,?,?,?,?,?,NOW())',
        [
          room.id,
          scope,
          room.name,
          encrypt(room.credentials, room.id),
          room.fingerprint,
          room.meterIdentity,
          JSON.stringify({
            schedule: defaultSchedule(),
            enabled: true,
            dailyNotify: Boolean(room.notifyTo),
            notifyTo: room.notifyTo,
            lowPurchaseThreshold: 10,
            lowTotalThreshold: 20,
          }),
        ],
      );
      await replaceMembers(
        conn,
        { id: room.id, scope_key: scope, legacy: false },
        room.memberIds,
      );
    }
    await conn.commit();
    return prepared.map((r) => ({ id: r.id, name: r.name }));
  } catch (e) {
    await conn.rollback();
    if (e.code === 'ER_DUP_ENTRY')
      throw problem('有宿舍或电表已存在，请刷新后检查。');
    throw e;
  } finally {
    conn.release();
  }
}
async function updateRoom(id, input) {
  const room = await getRoom(id);
  if (!room) throw problem('宿舍不存在', 404);
  const name = String(input.name || room.name).trim();
  if (!name || name.length > 100) throw problem('宿舍名称需为 1 至 100 字。');
  const ids =
    input.members === undefined ? null : await resolveMembers(input.members);
  if (room.legacy && ids?.length)
    throw problem('原有宿舍仅站长可见，不能绑定普通成员。');
  let prepared = null;
  if (input.account || input.roomVerify) {
    prepared = await prepareRoom(
      { ...input, name, members: [], notifyTo: '' },
      id,
    );
    // Credential rotation must not silently attach old history to a different meter.
    if (room.meter_identity && room.meter_identity !== prepared.meterIdentity)
      throw problem('新凭据指向不同电表，请新建宿舍。');
  }
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      'UPDATE electricity_rooms SET name=?,active=? WHERE id=?',
      [
        name,
        typeof input.active === 'boolean' ? Number(input.active) : room.active,
        id,
      ],
    );
    if (prepared)
      await conn.query(
        'UPDATE electricity_rooms SET credentials_encrypted=?,credential_hash=?,meter_identity=?,verified_at=NOW() WHERE id=?',
        [
          encrypt(prepared.credentials, id),
          prepared.fingerprint,
          prepared.meterIdentity,
          id,
        ],
      );
    if (ids) await replaceMembers(conn, room, ids);
    if (input.active === false)
      await conn.query(
        'DELETE FROM electricity_rss_subscriptions WHERE scope_key=?',
        [room.scope_key],
      );
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  return publicRoom(await getRoom(id));
}
async function migrateLegacy() {
  const scope = currentScope(process.env);
  if (!scope) return null;
  const conn = await db.getConnection();
  try {
    const [[lock]] = await conn.query(
      "SELECT GET_LOCK('mooncci:electricity-legacy',30) AS acquired",
    );
    if (!lock.acquired) throw new Error('ELECTRICITY_MIGRATION_BUSY');
    const [already] = await conn.query(
      'SELECT id FROM electricity_rooms WHERE legacy=1 LIMIT 1',
    );
    if (already.length) return already[0].id;
    const [settings] = await conn.query(
      "SELECT setting_value FROM site_settings WHERE setting_key='electricity'",
    );
    const [latest] = await conn.query(
      'SELECT * FROM electricity_snapshots ORDER BY recorded_at DESC LIMIT 1',
    );
    const credentials = {
      account: process.env.ELECTRICITY_SCHOOL_ACCOUNT,
      roomVerify: process.env.ELECTRICITY_ROOM_VERIFY,
      customerCode: String(process.env.ELECTRICITY_CUSTOMER_CODE || '2252'),
    };
    const id = crypto.randomUUID(),
      encrypted = encrypt(credentials, id);
    await conn.beginTransaction();
    await conn.query(
      'INSERT INTO electricity_rooms(id,scope_key,name,credentials_encrypted,credential_hash,meter_identity,config,legacy) VALUES(?,?,?,?,?,?,?,1)',
      [
        id,
        scope,
        latest[0]?.room_name || '我的宿舍',
        encrypted,
        scope,
        latest[0]?.meter_id
          ? hash(`${credentials.customerCode}:${latest[0].meter_id}`)
          : null,
        JSON.stringify(
          settings[0]
            ? parse(settings[0].setting_value)
            : {
                schedule: defaultSchedule(),
                enabled: true,
                dailyNotify: true,
                notifyTo: '',
              },
        ),
      ],
    );
    await conn.query(
      'UPDATE electricity_snapshots SET scope_key=? WHERE scope_key IS NULL',
      [scope],
    );
    await conn.query(
      `INSERT IGNORE INTO electricity_room_state(scope_key,low_alert_active,last_low_alert_at,last_recovered_at,last_daily_email_date,last_daily_email_slot,last_success_at,last_error_at,last_error_code)
    SELECT ?,low_alert_active,last_low_alert_at,last_recovered_at,last_daily_email_date,last_daily_email_slot,last_success_at,last_error_at,last_error_code FROM electricity_monitor_state WHERE id=1`,
      [scope],
    );
    await conn.commit();
    return id;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    await conn
      .query("SELECT RELEASE_LOCK('mooncci:electricity-legacy')")
      .catch(() => {});
    conn.release();
  }
}
module.exports = {
  listRooms,
  getRoom,
  accessibleRoom,
  inRoom,
  members,
  importRooms,
  updateRoom,
  migrateLegacy,
  publicRoom,
};
