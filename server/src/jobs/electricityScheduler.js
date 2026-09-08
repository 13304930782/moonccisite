const db = require('../db');
const rooms = require('../repositories/electricityRoomRepository');
const repository = require('../repositories/electricityRepository');
const { runElectricityCycle } = require('../services/electricityMonitor');
const { getBusinessDate, getShanghaiParts } = require('../lib/electricityTime');
const {
  scheduleFromConfig,
  isPausedForBusinessDate,
} = require('../lib/electricitySchedule');
const { isMidnightWindow } = require('../lib/electricityDailyUsage');
let timer = null,
  running = false;
function dueEntry(room, now) {
  const config =
    typeof room.config === 'string' ? JSON.parse(room.config) : room.config;
  if (!room.active || config.enabled === false) return null;
  const hour = getShanghaiParts(now).hour;
  const entry = scheduleFromConfig(config)
    .filter((row) => row.hour <= hour)
    .at(-1);
  if (!entry) return null;
  if (entry.hour === 0 && !isMidnightWindow(now)) return null;
  const at = new Date(
    `${getBusinessDate(now)}T${String(entry.hour).padStart(2, '0')}:00:00+08:00`,
  );
  // New and edited schedules begin with future slots, not past reports.
  if (room.updated_at && new Date(room.updated_at) > at) return null;
  return entry;
}
async function claim(scope, date, hour, now) {
  const [insert] = await db.query(
    'INSERT IGNORE INTO electricity_room_runs(scope_key,run_date,run_hour,started_at) VALUES(?,?,?,?)',
    [scope, date, hour, now],
  );
  if (insert.affectedRows) return true;
  const [retry] = await db.query(
    "UPDATE electricity_room_runs SET status='running',attempts=attempts+1,started_at=? WHERE scope_key=? AND run_date=? AND run_hour=? AND status<>'complete' AND attempts<3 AND started_at<?",
    [now, scope, date, hour, new Date(now.getTime() - 15 * 60000)],
  );
  return Boolean(retry.affectedRows);
}
async function tick(nowOverride) {
  if (running) return;
  running = true;
  try {
    const [list] = await db.query(
      'SELECT * FROM electricity_rooms WHERE active=1 ORDER BY created_at,id',
    );
    for (const room of list) {
      const now = nowOverride || new Date();
      let entry;
      try {
        entry = dueEntry(room, now);
        if (!entry) continue;
        await rooms.inRoom(
          room,
          async () => {
            const state = await repository.getMonitorState();
            if (isPausedForBusinessDate(state, now)) return;
            if (
              !(await claim(
                room.scope_key,
                getBusinessDate(now),
                entry.hour,
                now,
              ))
            )
              return;
            try {
              // Re-check after queueing: removed/disabled rooms must not execute stale work.
              const latest = await rooms.getRoom(room.id);
              if (!latest || !dueEntry(latest, now)) return;
              const current = dueEntry(latest, now);
              if (current.hour !== entry.hour || current.type !== entry.type)
                return;
              await runElectricityCycle({
                dailySlot: ['morning', 'evening'].includes(entry.type)
                  ? entry.type
                  : null,
                midnight: entry.hour === 0,
                now,
              });
              await db.query(
                "UPDATE electricity_room_runs SET status='complete',error_code=NULL WHERE scope_key=? AND run_date=? AND run_hour=?",
                [room.scope_key, getBusinessDate(now), entry.hour],
              );
            } catch (error) {
              await db.query(
                "UPDATE electricity_room_runs SET status='failed',error_code=? WHERE scope_key=? AND run_date=? AND run_hour=?",
                [
                  String(error.code || 'ELECTRICITY_JOB_FAILED').slice(0, 100),
                  room.scope_key,
                  getBusinessDate(now),
                  entry.hour,
                ],
              );
              throw error;
            }
          },
          { credentials: true },
        );
      } catch (error) {
        console.error(
          `[electricity] Room ${room.id} scheduled task failed:`,
          error.code || 'ELECTRICITY_JOB_FAILED',
        );
      }
    }
  } catch (error) {
    console.error(
      '[electricity] Schedule scan failed:',
      error.code || 'ELECTRICITY_JOB_FAILED',
    );
  } finally {
    running = false;
  }
}
async function startElectricityScheduler() {
  if (process.env.MOONCCI_TASK_PROCESS !== 'true') return;
  if (timer) clearInterval(timer);
  await tick();
  timer = setInterval(() => tick(), 15000);
  timer.unref?.();
  console.log(
    '[electricity] Room scheduler ready; Asia/Shanghai, midnight history, per-room plans.',
  );
}
// API and worker are independent: the worker scans saved plans every 15 seconds.
async function reloadElectricitySchedule() {}
module.exports = {
  startElectricityScheduler,
  reloadElectricitySchedule,
  dueEntry,
  tick,
};
