const { fetchElectricitySnapshot, resolveNow } = require('../lib/electricity');
const { calculateUsageStats, classifyElectricity, evaluateLowAlertTransition } = require('../lib/electricityMetrics');
const { getBusinessDate } = require('../lib/electricityTime');
const { sendElectricityDailyReport, sendElectricityLowAlert } = require('../lib/electricityMailer');
const repository = require('../repositories/electricityRepository');

function credentialsConfigured(env = process.env) {
  return Boolean(String(env.ELECTRICITY_SCHOOL_ACCOUNT || '').trim() && String(env.ELECTRICITY_ROOM_VERIFY || '').trim());
}

function publicSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    snapshotDate: snapshot.snapshotDate,
    recordedAt: snapshot.recordedAt,
    todayUse: snapshot.todayUse,
    purchasedRemaining: snapshot.purchasedRemaining,
    subsidyRemaining: snapshot.subsidyRemaining,
    totalRemaining: snapshot.totalRemaining,
    price: snapshot.price,
  };
}

async function collectSnapshot(options = {}) {
  const now = resolveNow(options.now);
  try {
    const upstream = await fetchElectricitySnapshot({ ...options, now });
    const stored = await repository.upsertSnapshot(upstream, getBusinessDate(now), now);
    await repository.markCollectionSuccess(now);
    return stored;
  } catch (error) {
    try {
      await repository.markCollectionFailure(now, error.code || 'ELECTRICITY_UNKNOWN_ERROR');
    } catch {
      // Preserve the original safe upstream error when the database is also unavailable.
    }
    throw error;
  }
}

async function getDashboardData(days = 30) {
  const config = await repository.getElectricityConfig();
  const [current, history] = await Promise.all([repository.getLatestSnapshot(), repository.getSnapshotHistory(days)]);
  return {
    current: publicSnapshot(current),
    history: history.map(publicSnapshot),
    metrics: calculateUsageStats(history, current),
    status: classifyElectricity(current, config),
    timezone: 'Asia/Shanghai',
  };
}

async function processNotifications(snapshot, config, { daily = false, test = false } = {}) {
  const history = await repository.getSnapshotHistory(30);
  const metrics = calculateUsageStats(history, snapshot);
  const status = classifyElectricity(snapshot, config);
  const state = await repository.getMonitorState();
  const transition = evaluateLowAlertTransition(state.lowAlertActive, status);
  const results = { daily: null, alert: null, status, metrics };

  if (test) {
    results.daily = await sendElectricityDailyReport({ snapshot, metrics, status, notifyTo: config.notifyTo, test: true });
    return results;
  }

  if (daily && config.dailyNotify && state.lastDailyEmailDate !== snapshot.snapshotDate) {
    results.daily = await sendElectricityDailyReport({ snapshot, metrics, status, notifyTo: config.notifyTo });
    if (results.daily.sent) await repository.markDailyEmailSent(snapshot.snapshotDate);
  }

  if (transition.entered) {
    results.alert = await sendElectricityLowAlert({ snapshot, status, notifyTo: config.notifyTo });
    if (results.alert.sent) await repository.setLowAlertState(true, new Date());
  } else if (transition.recovered) {
    await repository.setLowAlertState(false, new Date());
  }

  return results;
}

async function runElectricityCycle({ daily = true, now } = {}) {
  const config = await repository.getElectricityConfig();
  if (!config.enabled) return { skipped: true, reason: 'disabled' };
  if (!credentialsConfigured()) return { skipped: true, reason: 'not_configured' };
  const snapshot = await collectSnapshot({ now });
  return { skipped: false, snapshot, notifications: await processNotifications(snapshot, config, { daily }) };
}

async function refreshElectricity() {
  const config = await repository.getElectricityConfig();
  if (!credentialsConfigured()) {
    const error = new Error('学校账号与宿舍校验凭据尚未配置');
    error.code = 'ELECTRICITY_NOT_CONFIGURED';
    throw error;
  }
  const snapshot = await collectSnapshot();
  await processNotifications(snapshot, config, { daily: false });
  return getDashboardData(30);
}

async function sendTestElectricityEmail() {
  const config = await repository.getElectricityConfig();
  const snapshot = await repository.getLatestSnapshot();
  if (!snapshot) {
    const error = new Error('尚无电量快照，请先执行一次立即刷新');
    error.code = 'ELECTRICITY_NO_SNAPSHOT';
    throw error;
  }
  return processNotifications(snapshot, config, { test: true });
}

module.exports = {
  collectSnapshot, credentialsConfigured, getDashboardData, publicSnapshot, refreshElectricity,
  runElectricityCycle, sendTestElectricityEmail,
};
