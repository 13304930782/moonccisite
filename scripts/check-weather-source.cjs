// Run the bundled copy on the server; the existing Key is never printed.
const path = require('path');
const root = '/www/wwwroot/mooncci-source';
const env =
  require(path.join(root, 'server/node_modules/dotenv')).config({
    path: path.join(root, 'server/.env'),
  }).parsed || {};
const { createRegionalForecast } = require(
  path.join(__dirname, 'server/src/lib/weatherRegional'),
);
const db = require(path.join(root, 'server/src/db'));
const { createProtectionRepository } = require(
  path.join(__dirname, 'server/src/repositories/weatherProtectionRepository'),
);
const { createBudgetFetch } = require(
  path.join(__dirname, 'server/src/lib/weatherBudget'),
);
(async () => {
  const get = createRegionalForecast({
    key: () => env.AMAP_WEB_SERVICE_KEY,
    fetchImpl: createBudgetFetch({
      repository: createProtectionRepository(db),
    }),
  });
  const result = await get(new Date(), {
    name: '东城区',
    region: '中国 · 北京市',
    latitude: 39.9,
    longitude: 116.4,
    countryCode: 'CN',
    adcode: '110101',
  });
  console.log(
    `高德天气权限与数据校验通过：${result.date} · ${result.weather.label}`,
  );
})()
  .catch((error) => {
    console.error(
      error.publicCode
        ? `${error.publicCode}: ${error.message}`
        : '高德天气没有返回有效的当日预报，未部署。',
    );
    process.exitCode = 1;
  })
  .finally(() => db.end());
