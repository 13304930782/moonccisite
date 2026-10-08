const {test}=require('node:test'),assert=require('node:assert/strict');
const {createWeatherGeocoder}=require('../src/lib/weatherGeocoder');
test('missing Amap city coverage falls back to the cached global geocoder; credentials and quota errors never do',async()=>{
 const previousProvider=process.env.MOONCCI_CITY_PROVIDER,previousKey=process.env.AMAP_WEB_SERVICE_KEY;
 process.env.MOONCCI_CITY_PROVIDER='amap';process.env.AMAP_WEB_SERVICE_KEY='fixture';
 const states=new Map();let mode='missing',amapCalls=0,globalCalls=0;
 const reverse=createWeatherGeocoder({repository:{withLock:async(key,fn)=>fn(states.get(key)||{},async value=>states.set(key,value))},fetchImpl:async url=>{
  if(url.hostname==='restapi.amap.com') {amapCalls++;return Response.json(mode==='invalid'?{status:'0',infocode:'10001'}:mode==='quota'?{status:'0',infocode:'10003'}:{status:'1',regeocode:{addressComponent:{}}});}
  globalCalls++;return Response.json({address:{country_code:'us',country:'美国',state:'纽约州',city:'纽约'}});
 }});
 const input={latitude:40.713,longitude:-74.006};
 try {
  const result=await reverse(input);assert.equal(result.name,'纽约');assert.equal(result.countryCode,'US');assert.equal(result.provider,'nominatim');
  await reverse(input);assert.equal(globalCalls,1);assert.equal(amapCalls,2);
  for(mode of ['invalid','quota'])await assert.rejects(reverse(input),e=>e.publicCode===(mode==='invalid'?'AMAP_10001':'AMAP_10003'));
  assert.equal(globalCalls,1);
 }finally{if(previousProvider===undefined)delete process.env.MOONCCI_CITY_PROVIDER;else process.env.MOONCCI_CITY_PROVIDER=previousProvider;if(previousKey===undefined)delete process.env.AMAP_WEB_SERVICE_KEY;else process.env.AMAP_WEB_SERVICE_KEY=previousKey;}
});
