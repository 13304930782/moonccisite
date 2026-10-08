const {test}=require('node:test'),assert=require('node:assert/strict');
const {createWeatherGeocoder}=require('../src/lib/weatherGeocoder');
test('foreign browser coordinates use cached global lookup directly; domestic credentials and quota errors never fall back',async()=>{
 const previousProvider=process.env.MOONCCI_CITY_PROVIDER,previousKey=process.env.AMAP_WEB_SERVICE_KEY;
 process.env.MOONCCI_CITY_PROVIDER='amap';process.env.AMAP_WEB_SERVICE_KEY='fixture';
 const states=new Map();let mode='missing',amapCalls=0,globalCalls=0;
 const reverse=createWeatherGeocoder({sleep:async()=>{},repository:{withLock:async(key,fn)=>fn(states.get(key)||{},async value=>states.set(key,value))},fetchImpl:async url=>{
  if(url.hostname==='restapi.amap.com') {amapCalls++;return Response.json(mode==='invalid'?{status:'0',infocode:'10001'}:mode==='quota'?{status:'0',infocode:'10003'}:{status:'1',regeocode:{addressComponent:{}}});}
  globalCalls++;assert.equal(url.hostname,'photon.komoot.io');return Response.json({features:[{properties:{countrycode:'US',country:'美国',state:'纽约州',city:'纽约'}}]});
 }});
 const input={latitude:40.713,longitude:-74.006};
 try {
  const result=await reverse(input);assert.equal(result.name,'纽约');assert.equal(result.countryCode,'US');assert.equal(result.provider,'photon');
  await reverse(input);assert.equal(globalCalls,1);assert.equal(amapCalls,0);
  for(mode of ['invalid','quota'])await assert.rejects(reverse({latitude:30.274,longitude:120.155}),e=>e.publicCode===(mode==='invalid'?'AMAP_10001':'AMAP_10003'));
  assert.equal(globalCalls,1);
 }finally{if(previousProvider===undefined)delete process.env.MOONCCI_CITY_PROVIDER;else process.env.MOONCCI_CITY_PROVIDER=previousProvider;if(previousKey===undefined)delete process.env.AMAP_WEB_SERVICE_KEY;else process.env.AMAP_WEB_SERVICE_KEY=previousKey;}
});
test('real domestic position and Fake Location foreign position each return their own city without IP substitution',async()=>{
 const previousProvider=process.env.MOONCCI_CITY_PROVIDER,previousKey=process.env.AMAP_WEB_SERVICE_KEY;
 process.env.MOONCCI_CITY_PROVIDER='amap';process.env.AMAP_WEB_SERVICE_KEY='fixture';
 const states=new Map();let amapCalls=0,globalCalls=0;
 const reverse=createWeatherGeocoder({sleep:async()=>{},repository:{withLock:async(key,fn)=>fn(states.get(key)||{},async value=>states.set(key,value))},fetchImpl:async url=>{
  if(url.hostname==='restapi.amap.com'){amapCalls++;return Response.json({status:'1',regeocode:{addressComponent:{country:'中国',province:'辽宁省',city:'抚顺市',district:'新抚区',adcode:'210402'}}});}
  globalCalls++;assert.equal(url.hostname,'photon.komoot.io');assert.equal(url.searchParams.get('lat'),'37.336');assert.equal(url.searchParams.get('lon'),'-121.881');
  return Response.json({features:[{geometry:{coordinates:[0,0]},properties:{countrycode:'US',country:'United States',state:'California',city:'San Jose',name:'A nearby shop'}}]});
 }});
 try{
  const real=await reverse({latitude:41.862,longitude:123.921});assert.equal(real.name,'新抚区');assert.equal(real.adcode,'210402');
  const fake=await reverse({latitude:37.336,longitude:-121.881});assert.equal(fake.name,'San Jose');assert.equal(fake.countryCode,'US');assert.equal(fake.provider,'photon');assert.equal(fake.latitude,37.3);assert.equal(fake.longitude,-121.9);
  await reverse({latitude:37.336,longitude:-121.881});assert.equal(amapCalls,1);assert.equal(globalCalls,1);
  await assert.rejects(reverse({latitude:NaN,longitude:123}),e=>e.status===400);assert.equal(globalCalls,1);
 }finally{if(previousProvider===undefined)delete process.env.MOONCCI_CITY_PROVIDER;else process.env.MOONCCI_CITY_PROVIDER=previousProvider;if(previousKey===undefined)delete process.env.AMAP_WEB_SERVICE_KEY;else process.env.AMAP_WEB_SERVICE_KEY=previousKey;}
});
