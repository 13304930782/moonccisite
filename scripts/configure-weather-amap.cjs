const fs = require('fs');
const path = require('path');
const { requestAmap, reverseAddress } = require(path.join(__dirname, 'server/src/lib/weatherAmap'));
const root='/www/wwwroot/mooncci-source';
const db=require(path.join(root,'server/src/db'));
const {createProtectionRepository}=require(path.join(__dirname,'server/src/repositories/weatherProtectionRepository'));
const {createBudgetFetch}=require(path.join(__dirname,'server/src/lib/weatherBudget'));
const envFile = '/www/wwwroot/mooncci-source/server/.env';
(async () => {
  const key = (process.env.MOONCCI_NEW_AMAP_KEY || '').trim();
  if (!/^[a-f0-9]{32}$/i.test(key)) throw Error('Key 应为高德控制台提供的 32 位字符，请重新粘贴 Web 服务 Key。');
  console.log('正在检查高德 Key、行政区查询及城市识别权限…');
  const options = { key, fetchImpl:createBudgetFetch({repository:createProtectionRepository(db)}) };
  const districts = await requestAmap('config/district', { keywords: '兴城市', subdistrict: '0', extensions: 'base' }, options);
  if (!districts.districts?.length) throw Error('行政区查询未返回数据，未修改配置。');
  const reverse = await requestAmap('geocode/regeo', { location: '120.7,40.6', extensions: 'base' }, options);
  const city = reverseAddress(reverse, { latitude: 40.6, longitude: 120.7 });
  let text = fs.readFileSync(envFile, 'utf8');
  const backup = `${envFile}.before-amap-${Date.now()}`;
  fs.copyFileSync(envFile, backup); fs.chmodSync(backup, 0o600);
  for (const [name, value] of Object.entries({ MOONCCI_CITY_PROVIDER: 'amap', AMAP_WEB_SERVICE_KEY: key })) {
    const line = new RegExp(`^(?:export\\s+)?${name}\\s*=.*$`, 'gm');
    text = text.replace(line, '').replace(/\n{3,}/g, '\n\n').trimEnd() + `\n${name}=${value}\n`;
  }
  const stat = fs.statSync(envFile), temporary = `${envFile}.amap-next`;
  fs.writeFileSync(temporary, text, { mode: 0o600 });
  fs.chownSync(temporary, stat.uid, stat.gid); fs.renameSync(temporary, envFile);
  console.log(`高德校验通过：${city.region} · ${city.name}`);
  console.log('服务器配置已保存，Key 未输出。原配置备份：' + backup);
})().catch(error => {
  console.error(error.publicCode ? `${error.publicCode}: ${error.message}` : '配置失败：' + error.message);
  process.exitCode = 1;
}).finally(()=>db.end());
