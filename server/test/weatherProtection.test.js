
const test = require('node:test');
const assert = require('node:assert/strict');
const {createBudgetFetch, LIMITS} = require('../src/lib/weatherBudget');
const {locationKey} = require('../src/lib/weatherLocation');
const url='https://restapi.amap.com/v3/weather/weatherInfo?key=never-log';
function memory() { const states = new Map(); let tail=Promise.resolve(); return {states, mutate(group, cb) { const task=tail.then(()=>{const state=structuredClone(states.get(group)||{});const out=cb(state);states.set(group,state);return out;}); tail=task.catch(()=>{});return task; }}; }
test('upstream attempts consume shared persistent day/month budgets, failures are charged, cache identity ignores forged district coordinates', async()=>{
 const repository=memory();let now=Date.parse('2026-09-08T00:00:00Z'), calls=0;
 const options={repository,clock:()=>now,wait:async ms=>{now+=ms;},limits:{...LIMITS,'amap-weather':{day:2,month:3}},fetchImpl:async()=>{calls++;return new Response('{}');}};
 await createBudgetFetch(options)(url); now+=601;
 await assert.rejects(createBudgetFetch({...options,fetchImpl:async()=>{calls++;throw Error('network');}})(url));
 now+=601;await assert.rejects(createBudgetFetch(options)(url),e=>e.publicCode==='WEATHER_UPSTREAM_LIMIT');assert.equal(calls,2);
 now=Date.parse('2026-09-08T16:00:00Z');await createBudgetFetch(options)(url);assert.equal(calls,3);
 now=Date.parse('2026-09-09T16:00:00Z');await assert.rejects(createBudgetFetch(options)(url));assert.equal(calls,3);
 now=Date.parse('2026-09-30T16:00:00Z');await createBudgetFetch(options)(url);assert.equal(calls,4);
 const a={name:'兴城市',region:'中国',countryCode:'CN',adcode:'211481',latitude:40.6,longitude:120.7};
 assert.equal(locationKey(a),locationKey({...a,latitude:20,longitude:80}));
 assert.notEqual(locationKey(a),locationKey({...a,adcode:'210113'}));
});
test('shared start spacing and active leases bound concurrent upstream calls across independent clients; storage failure fails closed',async()=>{
 const repository=memory();let now=Date.parse('2026-09-08T00:00:00Z'), calls=0;const finish=[];
 const options={repository,clock:()=>now,wait:async()=>{},fetchImpl:()=>{calls++;return new Promise(resolve=>finish.push(()=>resolve(new Response('{}'))));}};
 const first=createBudgetFetch(options)(url);await new Promise(r=>setImmediate(r));
 await assert.rejects(createBudgetFetch(options)(url));assert.equal(calls,1);
 now+=600;const second=createBudgetFetch(options)(url);await new Promise(r=>setImmediate(r));assert.equal(calls,2);
 now+=600;await assert.rejects(createBudgetFetch(options)(url));assert.equal(calls,2);
 finish.forEach(fn=>fn());await Promise.all([first,second]);
 assert.equal(repository.states.get('amap-weather').leases.length,0);
 await assert.rejects(createBudgetFetch({...options,repository:{mutate:async()=>{throw Error('database unavailable');}}})(url));assert.equal(calls,2);
});
test('signed browser limits survive IP changes, separate campus visitors, enforce verified accounts and preserve other API limits',async t=>{
 const express=require('express'),jwt=require('jsonwebtoken');
 const {createClientIdentity,createClientLimiter,outsideWeatherGlobal,COOKIE}=require('../src/middleware/weatherClientLimit');
 const secret='test-only-campus-secret-0123456789';let now=Date.now();const app=express();app.set('trust proxy',1);
 app.use(require('express-rate-limit')({windowMs:60000,limit:5000}));
 let legacy=0;app.use('/api',outsideWeatherGlobal((_q,r)=>{legacy++;r.sendStatus(429);}));
 app.use('/api/weather-mood',createClientIdentity({secret:()=>secret,clock:()=>now}),createClientLimiter(3,{clock:()=>now}),(_q,r)=>r.json({ok:true}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}`;
 const request=(cookie='',ip='192.0.2.1',token='')=>fetch(base+'/api/weather-mood',{headers:{cookie,'X-Forwarded-For':ip,...(token?{Authorization:'Bearer '+token}:{})}});
 const first=await request();assert.equal(first.status,200);const cookie=first.headers.get('set-cookie').split(';')[0];assert.match(first.headers.get('set-cookie'),/HttpOnly/);
 assert.equal((await request(cookie,'192.0.2.2')).status,200);assert.equal((await request(cookie,'192.0.2.3')).status,200);
 const blocked=await request(cookie,'192.0.2.4');assert.equal(blocked.status,429);assert.equal(blocked.headers.get('retry-after'),'60');
 // 205 distinct browsers on one campus IP must not trip the legacy 200-request IP limit.
 for(let i=0;i<205;i++) assert.equal((await request()).status,200);
 assert.equal(legacy,0);
 const tampered=await request(cookie.slice(0,-1)+'!');assert.equal(tampered.status,200);assert.ok(tampered.headers.get('set-cookie'));
 const token=jwt.sign({id:7},secret);
 for(let i=0;i<3;i++)assert.equal((await request('',`192.0.2.${i+1}`,token)).status,200);
 assert.equal((await request('','192.0.2.100',token)).status,429);
 now+=60001;assert.equal((await request(cookie)).status,200);
 assert.equal((await fetch(base+'/api/posts')).status,429);assert.equal((await fetch(base+'/api/weather-mood-evil')).status,429);assert.equal(legacy,2);
 await require('../src/db').end();
});
