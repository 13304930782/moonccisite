const {
  electricityEnv,
  assertRoomMeter,
} = require('../lib/electricityContext');
const {
  fetchElectricitySnapshot,
  fetchElectricityDailyUsage,
  resolveNow,
} = require('../lib/electricity');
const {
  classifyElectricity,
  evaluateLowAlertTransition,
} = require('../lib/electricityMetrics');
const { getBusinessDate } = require('../lib/electricityTime');
const { hasSentNotificationSlot } = require('../lib/electricitySchedule');
const {
  sendElectricityDailyReport,
  sendElectricityLowAlert,
} = require('../lib/electricityMailer');
const repository = require('../repositories/electricityRepository');
const reports = require('../repositories/electricityReportRepository');
const { currentScope } = require('../lib/electricityRssToken');
const { buildReport } = require('../lib/electricityReport');
const dailyUsage = require('../repositories/electricityDailyUsageRepository');
const {
  isMidnightWindow,
  dailyStatusText,
} = require('../lib/electricityDailyUsage');

function credentialsConfigured(env = electricityEnv()) {
  return Boolean(
    String(env.ELECTRICITY_SCHOOL_ACCOUNT || '').trim() &&
      String(env.ELECTRICITY_ROOM_VERIFY || '').trim(),
  );
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
    assertRoomMeter(upstream);
    const stored = await repository.upsertSnapshot(
      upstream,
      getBusinessDate(now),
      now,
    );
    await repository.markCollectionSuccess(now);
    return stored;
  } catch (error) {
    try {
      await repository.markCollectionFailure(
        now,
        error.code || 'ELECTRICITY_UNKNOWN_ERROR',
      );
    } catch {
      // Preserve the original safe upstream error when the database is also unavailable.
    }
    throw error;
  }
}

async function getDashboardData(days = 30) {
  const config = await repository.getElectricityConfig();
  const [current, history] = await Promise.all([
    repository.getLatestSnapshot(),
    repository.getSnapshotHistory(days),
  ]);
  return {
    current: publicSnapshot(current),
    history: history.map(publicSnapshot),
    metrics: await dailyUsage.getForecast(new Date(), current?.meterId),
    dailyUsage: (await dailyUsage.getDailyHistory(days)).map(
      ({ usageDate, usage, status, method, startAt, endAt }) => ({
        usageDate,
        usage,
        status,
        statusText: dailyStatusText[status] || '数据不足',
        method,
        startAt,
        endAt,
      }),
    ),
    status: classifyElectricity(current, config),
    timezone: 'Asia/Shanghai',
  };
}

async function processNotifications(
  snapshot,
  config,
  { dailySlot = null, test = false, report = null } = {},
) {
  const metrics =
    report?.metrics ||
    (await dailyUsage.getForecast(new Date(), snapshot?.meterId));
  const status = classifyElectricity(snapshot, config);
  const state = await repository.getMonitorState();
  const transition = evaluateLowAlertTransition(state.lowAlertActive, status);
  const results = { daily: null, alert: null, status, metrics };

  if (test) {
    results.daily = await sendElectricityDailyReport({
      snapshot,
      metrics,
      status,
      notifyTo: config.notifyTo,
      test: true,
    });
    return results;
  }

  if (
    dailySlot &&
    config.dailyNotify &&
    !hasSentNotificationSlot(state, snapshot.snapshotDate, dailySlot)
  ) {
    results.daily = await sendElectricityDailyReport({
      snapshot: report?.snapshot || snapshot,
      metrics: report?.metrics || metrics,
      status: report?.status || status,
      notifyTo: config.notifyTo,
      period: dailySlot,
      report,
    });
    if (results.daily.sent)
      await repository.markDailyEmailSent(snapshot.snapshotDate, dailySlot);
  }

  if (transition.entered) {
    results.alert = await sendElectricityLowAlert({
      snapshot,
      status,
      notifyTo: config.notifyTo,
    });
    if (results.alert.sent) await repository.setLowAlertState(true, new Date());
  } else if (transition.recovered) {
    await repository.setLowAlertState(false, new Date());
  }

  return results;
}

async function runElectricityCycle({
  dailySlot = null,
  midnight = false,
  now,
} = {}) {
  const config = await repository.getElectricityConfig();
  if (!config.enabled) return { skipped: true, reason: 'disabled' };
  if (!credentialsConfigured())
    return { skipped: true, reason: 'not_configured' };
  const time = resolveNow(now);
  if (dailySlot && !['morning', 'evening'].includes(dailySlot))
    throw new Error('ELECTRICITY_INVALID_REPORT_PERIOD');
  const scope = currentScope();
  if (midnight) {
    if (!isMidnightWindow(time))
      return { skipped: true, reason: 'missed_midnight_window' };
    if (await dailyUsage.getBoundary(scope, getBusinessDate(time)))
      return { skipped: true, reason: 'midnight_already_saved' };
    const snapshot = await collectSnapshot({ now: time });
    let schoolDays = [],
      historyError = null;
    try {
      schoolDays = await fetchElectricityDailyUsage({ now: time });
    } catch (error) {
      historyError = error.code || 'ELECTRICITY_DAILY_HISTORY_FAILED';
      // A daily-history outage must not discard the successfully collected midnight reading.
      if (
        ['ELECTRICITY_ACCESS_RESTRICTED', 'ELECTRICITY_RATE_LIMITED'].includes(
          historyError,
        )
      )
        await repository.markCollectionFailure(time, historyError);
    }
    await dailyUsage.saveBoundary(snapshot, schoolDays, historyError);
    const yesterday = getBusinessDate(new Date(time.getTime() - 86400000));
    const validSchoolDays = schoolDays.filter((day) => day.status === 'valid');
    const latestSchoolDay = validSchoolDays
      .map((day) => day.usageDate)
      .sort()
      .at(-1);
    // Log dates and outcome only, never room credentials or raw school responses.
    console.log(
      `[electricity] Midnight history: date=${getBusinessDate(time)}, ` +
        `latest_school_day=${latestSchoolDay || 'none'}, ` +
        `yesterday_school_data=${validSchoolDays.some((day) => day.usageDate === yesterday) ? 'available' : 'missing'}, ` +
        `upstream_error=${historyError || 'none'}.`,
    );
    return { skipped: false, snapshot, midnight: true }; // No email, low alert, or RSS item at midnight.
  }
  let report = dailySlot
    ? await reports.getReport(scope, getBusinessDate(time), dailySlot)
    : null;
  let snapshot;
  if (report) {
    // Retry sends the already committed report, without another upstream collection.
    if (report.collectionOutcome === 'failed')
      return { skipped: true, reason: 'recorded_collection_failure', report };
    snapshot = report.snapshot;
  } else {
    const previous = dailySlot ? await repository.getLatestSnapshot() : null;
    try {
      snapshot = await collectSnapshot({ now: time });
    } catch (error) {
      if (dailySlot)
        await reports.saveReport(
          scope,
          buildReport({
            snapshot: null,
            config,
            period: dailySlot,
            now: time,
            failed: true,
          }),
        );
      throw error;
    }
    if (dailySlot) {
      const forecast = await dailyUsage.getForecast(time, snapshot.meterId);
      report = await reports.saveReport(
        scope,
        buildReport({
          snapshot,
          previous,
          forecast,
          config,
          period: dailySlot,
          now: time,
        }),
      );
      snapshot = report.snapshot;
    }
  }
  // Persist first: an SMTP rejection cannot remove the RSS report.
  return {
    skipped: false,
    snapshot,
    report,
    notifications: await processNotifications(snapshot, config, {
      dailySlot,
      report,
    }),
  };
}

async function refreshElectricity() {
  const config = await repository.getElectricityConfig();
  if (!credentialsConfigured()) {
    const error = new Error('学校账号与宿舍校验凭据尚未配置');
    error.code = 'ELECTRICITY_NOT_CONFIGURED';
    throw error;
  }
  const snapshot = await collectSnapshot();
  await processNotifications(snapshot, config);
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
  collectSnapshot,
  credentialsConfigured,
  getDashboardData,
  publicSnapshot,
  refreshElectricity,
  runElectricityCycle,
  sendTestElectricityEmail,
};
