// Read-only upstream check: no database writes, email, RSS item or credential output.
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { fetchElectricityDailyUsage } = require('../src/lib/electricity');
fetchElectricityDailyUsage().then((days) => {
  console.log(JSON.stringify({ source: 'gettimeusedetail/dayuselist', days: days.map(({ usageDate, usage, status }) => ({ usageDate, usage, status })) }, null, 2));
}).catch((error) => {
  console.error('学校日明细验证失败：', error.code || 'ELECTRICITY_DAILY_HISTORY_FAILED');
  process.exitCode = 1;
});
