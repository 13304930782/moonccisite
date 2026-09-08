require('dotenv').config();
const { acquireWorkerLease, releaseWorkerLease } = require('./jobs/workerLease');
async function main() {
  const lease = await acquireWorkerLease();
  if (!lease) throw new Error('Another background worker already holds the task lock');
  process.env.MOONCCI_TASK_PROCESS = 'true';
  lease.on('error', () => {
    console.error('[worker] Task lock connection lost');
    process.exit(1);
  });
  const { startContentScheduler } = require('./jobs/contentScheduler');
  const { startElectricityScheduler } = require('./jobs/electricityScheduler');
  const stopContent = startContentScheduler();
  await startElectricityScheduler();
  // Keep the independent worker alive and fail closed if its dedicated lock connection is lost.
  const heartbeat = setInterval(
    () => lease.query('SELECT 1').catch(() => process.exit(1)),
    30000,
  );
  const shutdown = async () => {
    clearInterval(heartbeat);
    stopContent();
    await releaseWorkerLease(lease).catch(() => {});
    process.exit(0);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  console.log('[worker] mooncci background tasks ready');
}
main().catch((error) => {
  console.error('[worker]', error.code || error.message);
  process.exit(1);
});
