const db = require('../platformDb');
const LOCK =
  'mooncci-worker-' +
  require('crypto')
    .createHash('sha256')
    .update(process.env.DB_NAME || '')
    .digest('hex')
    .slice(0, 16);
async function acquireWorkerLease() {
  const connection = await db.getConnection();
  try {
    const [[result]] = await connection.query('SELECT GET_LOCK(?,0) acquired', [LOCK]);
    if (!result.acquired) {
      connection.release();
      return null;
    }
    return connection;
  } catch (error) {
    connection.release();
    throw error;
  }
}
async function releaseWorkerLease(connection) {
  try {
    await connection.query('SELECT RELEASE_LOCK(?)', [LOCK]);
  } finally {
    connection.release();
  }
}
module.exports = { acquireWorkerLease, releaseWorkerLease };
