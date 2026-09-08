
const test=require('node:test'),assert=require('node:assert/strict');
test('real MySQL serializes reservations across connections and retains quota after pool restart', {skip:process.env.COMPANION_INTEGRATION!=='true'},async t=>{
 const mysql=require('mysql2/promise');
 const opts={host:'127.0.0.1',port:Number(process.env.DB_PORT || 33079),user:'root',password:'',database:'mooncci_weather_budget_qa',connectionLimit:8};
 const setup=await mysql.createConnection({...opts,database:undefined});await setup.query('CREATE DATABASE IF NOT EXISTS mooncci_weather_budget_qa');await setup.end();
 let pool=mysql.createPool(opts);
 await pool.query('CREATE TABLE IF NOT EXISTS site_settings(setting_key VARCHAR(100) PRIMARY KEY, setting_value LONGTEXT NOT NULL)');
 const key='weather_budget:v1:amap-weather';await pool.query('DELETE FROM site_settings WHERE setting_key=?',[key]);
 t.after(async()=>{await pool.query('DELETE FROM site_settings WHERE setting_key=?',[key]);await pool.end();});
 const {createProtectionRepository}=require('../src/repositories/weatherProtectionRepository');
 await Promise.all(Array.from({length:30},()=>createProtectionRepository(pool).mutate('amap-weather',s=>{s.count=(s.count||0)+1;})));
 await pool.end();pool=mysql.createPool(opts);
 const count=await createProtectionRepository(pool).mutate('amap-weather',s=>s.count);assert.equal(count,30);
 // Real budget path with fresh controller instances shares the same persisted allowance.
 await pool.query('DELETE FROM site_settings WHERE setting_key=?',[key]);
 const {createBudgetFetch,LIMITS}=require('../src/lib/weatherBudget');let now=Date.now(),calls=0;
 const options={repository:createProtectionRepository(pool),clock:()=>now,wait:async ms=>{now+=ms;},limits:{...LIMITS,'amap-weather':{day:2,month:2}},fetchImpl:async()=>{calls++;return new Response('{}');}};
 const url='https://restapi.amap.com/v3/weather/weatherInfo';
 await createBudgetFetch(options)(url);now+=601;await createBudgetFetch(options)(url);now+=601;
 await pool.end();pool=mysql.createPool(opts);
 await assert.rejects(createBudgetFetch({...options,repository:createProtectionRepository(pool)})(url),e=>e.publicCode==='WEATHER_UPSTREAM_LIMIT');assert.equal(calls,2);
});
