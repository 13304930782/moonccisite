// Uses ONLY explicitly named local QA databases. Never supply production credentials.
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const env = { ...process.env, DB_HOST: '127.0.0.1', DB_PORT: process.env.TEST_DB_PORT || '33079',
  DB_USER: 'root', DB_PASSWORD: '', JWT_SECRET: 'integration-fixture-only', MAIL_ENABLED: 'false',
  NEWSLETTER_DELIVERY_ENABLED: 'false', GITHUB_SYNC_ENABLED: 'false', ELECTRICITY_ENABLED: 'false' };
function run(args, extra = {}) {
  const result = spawnSync(process.execPath, args, { cwd: root, env: { ...env, ...extra }, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`Integration command failed: ${args.join(' ')}`);
}
async function main() {
  const setup = await mysql.createConnection({ host: env.DB_HOST, port: Number(env.DB_PORT), user: 'root', password: '', multipleStatements: true });
  try {
    for (const database of ['mooncci_qa_audit_v2', 'mooncci_electricity_rss_qa', 'mooncci_electricity_rooms_qa']) {
      await setup.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4`);
      await setup.query(`USE \`${database}\``);
      if (database === 'mooncci_qa_audit_v2') {
        const [[row]] = await setup.query('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema=DATABASE()');
        if (Number(row.n) === 0) run(['scripts/init-db.js'], { DB_NAME: database });
        run(['scripts/migrate.js'], { DB_NAME: database });
      } else {
        await setup.query(fs.readFileSync(path.join(root, 'database/migrations/202609090002_auth_revocation.sql'), 'utf8'));
      }
    }
  } finally { await setup.end(); }
  run(['--test', '--test-concurrency=1', 'test/contentPlatform.integration.test.js', 'test/platformContracts.integration.test.js',
    'test/githubVisibility.integration.test.js', 'test/contentVisibility.integration.test.js', 'test/newsletter.integration.test.js', 'test/siteSettings.integration.test.js',
    'test/authRevocation.integration.test.js', 'test/updateComments.integration.test.js', 'test/adminCapacity.integration.test.js', 'test/usersCommentsPagination.integration.test.js', 'test/accountDisable.integration.test.js'], { DB_NAME: 'mooncci_qa_audit_v2', CONTENT_INTEGRATION: 'true', SITE_SETTINGS_INTEGRATION: 'true', AUTH_INTEGRATION: 'true' });
  run(['--test', 'test/electricityRss.integration.test.js'], { DB_NAME: 'mooncci_electricity_rss_qa', ELECTRICITY_RSS_INTEGRATION: 'true' });
  run(['--test', 'test/electricityHistorySync.integration.test.js'], { DB_NAME: 'mooncci_electricity_rss_qa', ELECTRICITY_HISTORY_INTEGRATION: 'true' });
  run(['--test', 'test/electricityRooms.integration.test.js'], { DB_NAME: 'mooncci_electricity_rooms_qa', ELECTRICITY_ROOMS_INTEGRATION: 'true' });
  run(['--test', 'test/companionInteractions.integration.test.js', 'test/weatherProtection.integration.test.js'], { COMPANION_INTEGRATION: 'true' });
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
