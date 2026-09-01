const { getBusinessDate, hasReachedShanghaiHour, nextShanghaiHour } = require('../lib/electricityTime');
const repository = require('../repositories/electricityRepository');
const { credentialsConfigured, runElectricityCycle } = require('../services/electricityMonitor');

let timer = null;
let running = false;

function safeLog(message, error) {
  console.error(`[electricity] ${message}`, error?.code || 'ELECTRICITY_JOB_FAILED');
}

async function execute() {
  if (running) return;
  running = true;
  try {
    await runElectricityCycle({ daily: true });
  } catch (error) {
    safeLog('scheduled collection failed:', error);
  } finally {
    running = false;
  }
}

function scheduleNext(config) {
  if (timer) clearTimeout(timer);
  const delay = Math.max(1000, nextShanghaiHour(new Date(), config.notifyHour).getTime() - Date.now());
  timer = setTimeout(async () => {
    await execute();
    try { scheduleNext(await repository.getElectricityConfig()); } catch (error) { safeLog('could not reschedule:', error); }
  }, delay);
  timer.unref?.();
}

async function catchUp(config) {
  if (!config.enabled || !credentialsConfigured() || !hasReachedShanghaiHour(new Date(), config.notifyHour)) return;
  const state = await repository.getMonitorState();
  const today = getBusinessDate();
  const collectedToday = state.lastSuccessAt && getBusinessDate(state.lastSuccessAt) === today;
  const emailPending = config.dailyNotify && state.lastDailyEmailDate !== today;
  if (!collectedToday || emailPending) await execute();
}

async function startElectricityScheduler() {
  try {
    const config = await repository.getElectricityConfig();
    scheduleNext(config);
    const startup = setTimeout(() => catchUp(config).catch((error) => safeLog('startup catch-up failed:', error)), 8000);
    startup.unref?.();
    console.log(`[electricity] Scheduler ready for ${String(config.notifyHour).padStart(2, '0')}:00 Asia/Shanghai.`);
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
