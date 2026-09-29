const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const apiStartedAt = new Date(Date.now() - process.uptime() * 1000).toISOString();
const stateDir = () => process.env.MOONCCI_RUNTIME_DIR || path.join(root, 'runtime');
async function readState(name) {
  try {
    const file = path.join(stateDir(), `${name}.json`);
    if ((await fs.stat(file)).size > 65536) return null;
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch { return null; }
}
async function writeWorkerState(startedAt, stopped = false) {
  const dir = stateDir();
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, 'worker.json');
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ startedAt, checkedAt: new Date().toISOString(), stopped }), { mode: 0o600 });
  await fs.rename(tmp, file);
}
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
function workerStatus(value, now = Date.now()) {
  const checkedAt = date(value?.checkedAt);
  const age = checkedAt ? now - Date.parse(checkedAt) : Infinity;
  return { startedAt: date(value?.startedAt), checkedAt, state: value?.stopped ? 'stopped' : age >= 0 && age < 90000 ? 'running' : 'unknown' };
}
async function runtimeStatus(db) {
  const [worker, deployment] = await Promise.all([readState('worker'), readState('deployment')]);
  let migrations = null;
  try {
    const [rows] = await db.query('SELECT filename, executed_at FROM schema_migrations ORDER BY filename DESC');
    migrations = rows.map(row => ({ filename: row.filename, executedAt: row.executed_at }));
  } catch (error) { if (error.code !== 'ER_NO_SUCH_TABLE') throw error; }
  let disk = null;
  try {
    const s = await fs.statfs(root);
    disk = { freeBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize };
  } catch { /* Unsupported filesystems remain unknown. */ }
  const revision = typeof deployment?.revision === 'string' && /^[a-f0-9]{40}$/.test(deployment.revision) ? deployment.revision : null;
  return { checkedAt: new Date().toISOString(), api: { startedAt: apiStartedAt, node: process.version }, worker: workerStatus(worker), migrations, disk,
    deployment: { revision, completedAt: date(deployment?.completedAt), result: ['success', 'failed', 'rolled-back'].includes(deployment?.result) ? deployment.result : 'unknown' } };
}
module.exports = { runtimeStatus, writeWorkerState, workerStatus };
