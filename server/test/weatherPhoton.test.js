const {test}=require('node:test'),assert=require('node:assert/strict');
const {normalizePhoton}=require('../src/lib/weatherPhoton');
const {weatherSource}=require('../src/lib/weatherSource');
test('global reverse selects city labels, retains input coordinates and uses foreign weather source',()=>{
 const input={latitude:37.336,longitude:-121.881};
 const result=normalizePhoton({features:[{properties:{name:'A restaurant',countrycode:'US'}},{properties:{city:'San Jose',state:'California',country:'United States',countrycode:'US'}}]},input);
 assert.equal(result.name,'San Jose');assert.equal(result.longitude,-121.9);assert.equal(result.region,'United States · California');assert.equal(result.provider,'photon');assert.equal(weatherSource(result),'open-meteo');
 assert.throws(()=>normalizePhoton({features:[{properties:{name:'A restaurant',countrycode:'US',osm_value:'restaurant'}}]},input),e=>e.publicCode==='CITY_NO_CITY');
});
