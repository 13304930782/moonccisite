const { createHash } = require('node:crypto');

function poolingEnabled(account, protocol, env = process.env) {
  if (env.MAILBOX_POOLS_ENABLED === 'false' || env[`MAILBOX_${protocol}_POOL_ENABLED`] !== 'true'
    || env[`MAILBOX_${protocol}_POOL_API_PROCESSES`] !== '1'
    || (env.NODE_APP_INSTANCE && env.NODE_APP_INSTANCE !== '0')) return false;
  if (!account.mailbox_address || !account.smtp_secret || !account.user_id
    || (account.change_status && account.change_status !== 'complete')) return false;
  if (account.role === 'owner' && account.mailbox_address === 'mooncci@mooncci.site') return true;
  const ids = String(env.MAILBOX_POOL_TEST_USER_IDS || '').split(',').filter(id => /^\d+$/.test(id));
  if (ids.includes(String(account.user_id))) return true;
  const percent = Number(env.MAILBOX_POOL_ROLLOUT_PERCENT || 0);
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) return false;
  const bucket = createHash('sha256').update('mooncci-mail-pool-v1:' + String(account.user_id)).digest().readUInt32BE(0) % 100;
  return bucket < percent;
}
function budget(protocol, env = process.env) {
  const maximum = protocol === 'IMAP' ? 6 : 4;
  const value = Number(env[`MAILBOX_${protocol}_POOL_GLOBAL_MAX`] || maximum);
  return Number.isInteger(value) && value >= 1 && value <= maximum ? value : maximum;
}
async function validateAccount(account, timing) {
  const check = async () => {
    const [rows] = await require('../db').query(`SELECT m.mailbox_address,m.smtp_secret FROM mailbox_access m
      JOIN users u ON u.id=m.user_id LEFT JOIN mailbox_password_changes p ON p.user_id=m.user_id
      WHERE m.user_id=? AND m.status='active' AND u.status='active'
      AND (p.status IS NULL OR p.status='complete')`, [account.user_id]);
    return !!rows[0]?.smtp_secret && rows[0].mailbox_address === account.mailbox_address && rows[0].smtp_secret === account.smtp_secret;
  };
  return timing ? timing.measure('account_lookup_ms', check) : check();
}
module.exports = { poolingEnabled, budget, validateAccount };
