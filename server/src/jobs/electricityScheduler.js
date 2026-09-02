const { getBusinessDate } = require('../lib/electricityTime');
const {
  hasSentNotificationSlot,
  isPausedForBusinessDate,
  isSlotComplete,
  latestPassedScheduleHour,
  nextScheduleSlot,
  notificationSlotForHour,
  parseScheduleHours,
} = require('../lib/electricitySchedule');
const repository = require('../repositories/electricityRepository');
const { credentialsConfigured, runElectricityCycle } = require('../services/electricityMonitor');

let timer = null;
let running = false;

function safeLog(message, error) {
  console.error(`[electricity] ${message}`, error?.code || 'ELECTRICITY_JOB_FAILED');
}

async function execute(slotHour, config) {
  if (running) return { skipped: true, reason: 'already_running' };
  running = true;
  try {
    const state = await repository.getMonitorState();
    if (isPausedForBusinessDate(state, new Date())) {
      return { skipped: true, reason: 'paused_after_failure' };
    }
    return await runElectricityCycle({ dailySlot: notificationSlotForHour(slotHour, scheduleHours()) });
  } catch (error) {
    safeLog('scheduled collection failed:', error);
    return { skipped: true, reason: error?.code || 'collection_failed' };
  } finally {
    running = false;
  }
}

function scheduleHours() {
  return parseScheduleHours(process.env.ELECTRICITY_SCHEDULE_HOURS);
}

function scheduleNext(config) {
  if (timer) clearTimeout(timer);
  const slot = nextScheduleSlot(new Date(), scheduleHours());
  const delay = Math.max(1000, slot.at.getTime() - Date.now());
  timer = setTimeout(async () => {
    await execute(slot.hour, config);
    try { scheduleNext(await repository.getElectricityConfig()); } catch (error) { safeLog('could not reschedule:', error); }
  }, delay);
  timer.unref?.();
}

async function catchUp(config) {
  if (!config.enabled || !credentialsConfigured()) return;
  const now = new Date();
  const slotHour = latestPassedScheduleHour(now, scheduleHours());
  if (slotHour === null) return;
  const state = await repository.getMonitorState();
  if (isPausedForBusinessDate(state, now)) return;
  const today = getBusinessDate(now);
  const dailySlot = notificationSlotForHour(slotHour, scheduleHours());
  const emailPending = config.dailyNotify && dailySlot && !hasSentNotificationSlot(state, today, dailySlot);
  if (!isSlotComplete(state.lastSuccessAt, now, slotHour) || emailPending) await execute(slotHour, config);
}

async function startElectricityScheduler() {
  try {
    const config = await repository.getElectricityConfig();
    scheduleNext(config);
    const startup = setTimeout(() => catchUp(config).catch((error) => safeLog('startup catch-up failed:', error)), 8000);
    startup.unref?.();
    const label = scheduleHours().map((hour) => `${String(hour).padStart(2, '0')}:00`).join(' / ');
    console.log(`[electricity] Scheduler ready for ${label} Asia/Shanghai.`);
  } catch (error) {
    safeLog('scheduler initialization failed:', error);
  }
}

async function reloadElectricitySchedule() {
  const config = await repository.getElectricityConfig();
  scheduleNext(config);
  await catchUp(config);
}

module.exports = { reloadElectricitySchedule, startElectricityScheduler };
