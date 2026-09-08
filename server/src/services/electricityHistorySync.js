const { assertRoomMeter } = require('../lib/electricityContext');
const {
  fetchElectricitySnapshot,
  fetchElectricityDailyUsage,
  resolveNow,
  requiredCredentials,
} = require('../lib/electricity');
const { currentScope } = require('../lib/electricityRssToken');
const repository = require('../repositories/electricityDailyUsageRepository');

// Independent historical import. Never creates a midnight boundary, forecast, email or RSS report.
async function syncElectricityHistory({ onlyIfMissing = false, now } = {}) {
  requiredCredentials();
  const time = resolveNow(now),
    scope = currentScope();
  const conn = await repository.acquireHistoryLock(scope);
  if (!conn) return { status: 'busy', count: 0 };
  try {
    if (onlyIfMissing && (await repository.hasSchoolHistory(conn, scope, time)))
      return { status: 'already_imported', count: 0 };
    const state = await repository.getSyncState(conn, scope);
    const lastAttempt = Date.parse(state.lastAttemptAt || '');
    if (
      Number.isFinite(lastAttempt) &&
      time.getTime() - lastAttempt < 15 * 60000
    )
      return {
        status: 'cooldown',
        count: 0,
        retryAfterSeconds: Math.ceil(
          (15 * 60000 - (time.getTime() - lastAttempt)) / 1000,
        ),
      };
    const nextState = {
      ...state,
      lastAttemptAt: time.toISOString(),
      status: 'running',
    };
    // Persist before network I/O so repeated process restarts do not hammer the school API.
    await repository.setSyncState(conn, scope, nextState);
    try {
      const snapshot = await fetchElectricitySnapshot({ now: time });
      assertRoomMeter(snapshot);
      if (!snapshot.meterId)
        throw Object.assign(new Error('缺少电表信息'), {
          code: 'ELECTRICITY_MISSING_METER',
        });
      const days = await fetchElectricityDailyUsage({ now: time });
      const count = await repository.importSchoolHistory(
        conn,
        { ...snapshot, scopeKey: scope },
        days,
        time,
      );
      const status = count ? 'synced' : 'empty';
      await repository.setSyncState(conn, scope, {
        ...nextState,
        status,
        lastSuccessAt: time.toISOString(),
        count,
      });
      return { status, count };
    } catch (error) {
      await repository.setSyncState(conn, scope, {
        ...nextState,
        status: 'failed',
        errorCode: error.code || 'ELECTRICITY_HISTORY_SYNC_FAILED',
      });
      throw error;
    }
  } finally {
    await repository.releaseHistoryLock(conn, scope);
  }
}
module.exports = { syncElectricityHistory };
