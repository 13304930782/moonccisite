const { AsyncLocalStorage } = require('node:async_hooks');
const storage = new AsyncLocalStorage();
function roomContext() {
  return storage.getStore();
}
function electricityEnv() {
  const context = roomContext();
  if (!context) return process.env;
  // No account fallback: a missing credential in one room must never use the owner's.
  return {
    ...process.env,
    ELECTRICITY_SCHOOL_ACCOUNT: context.credentials?.account || '',
    ELECTRICITY_ROOM_VERIFY: context.credentials?.roomVerify || '',
    ELECTRICITY_CUSTOMER_CODE: context.credentials?.customerCode || '2252',
  };
}
function withRoom(room, callback) {
  return storage.run(room, callback);
}
function assertRoomMeter(snapshot) {
  const room = roomContext();
  if (!room?.meter_identity) return;
  const identity = require('crypto')
    .createHash('sha256')
    .update(`${electricityEnv().ELECTRICITY_CUSTOMER_CODE}:${snapshot.meterId}`)
    .digest('hex');
  if (identity !== room.meter_identity)
    throw Object.assign(new Error('学校返回的电表已变更，请检查宿舍绑定'), {
      code: 'ELECTRICITY_METER_CHANGED',
    });
}
module.exports = { roomContext, electricityEnv, withRoom, assertRoomMeter };
