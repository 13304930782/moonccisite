const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs');
const React=require('react'),{act,create}=require('react-test-renderer');
function load(file,requireMock){const m={exports:{}};new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(m.exports,requireMock);return m.exports;}
test('city lookup accepts coarse desktop positions, requires confirmation and preserves a working city on failure',async()=>{
 const city={name:'杭州市',region:'中国 · 浙江省',countryCode:'CN',adcode:'330100',latitude:30.3,longitude:120.2};
 const positions={coords:{latitude:30.274,longitude:120.155,accuracy:5000}};
 let fail=false,picked=[],calls=0,positionCalls=0,lastLocation;
 const locations=load('src/app/lib/weatherLocation.ts',require);
 const {WeatherCityPicker}=load('src/app/components/WeatherCityPicker.tsx',name=>name==='lucide-react'?{LocateFixed:'svg',Search:'svg'}:name.endsWith('/weatherLocation')?locations:name.endsWith('/weatherGeolocation')?{locateWeatherDevice:async()=>{positionCalls++;return positions}}:name.endsWith('/api')?{ApiError:class extends Error{},api:async(_path,options)=>{calls++;lastLocation=JSON.parse(options.body).location;assert.equal(options.readOnly,true);if(fail)throw Error('offline');return {data:city}}}:require(name));
 const descriptor=Object.getOwnPropertyDescriptor(global,'navigator');
 Object.defineProperty(global,'navigator',{configurable:true,value:{geolocation:{}}});
 let root;
 const props={selected:city,onAttributionChange(){},onChange:(...values)=>{picked.push(values);return true}};
 const button=text=>root.root.findAllByType('button').find(b=>b.children.includes(text));
 try {
  await act(async()=>{root=create(React.createElement(WeatherCityPicker,props),{createNodeMock:element=>element.type==='dialog'?{open:false,showModal(){this.open=true},close(){this.open=false}}:null});});
  await act(async()=>button('切换城市').props.onClick());
  await act(async()=>button('使用当前位置').props.onClick());
  assert.equal(calls,1);assert.equal(picked.length,0);
  assert.match(JSON.stringify(root.toJSON()),/设备返回的是大致位置/);
  await act(async()=>root.unmount());
  await act(async()=>{root=create(React.createElement(WeatherCityPicker,{...props,selected:{name:'当前位置附近',region:'',latitude:0,longitude:0}}),{createNodeMock:element=>element.type==='dialog'?{open:false,showModal(){this.open=true}}:null});});
  await act(async()=>button('重新定位并识别城市').props.onClick());
  assert.equal(positionCalls,2,'retry must call the browser again');
  assert.equal(lastLocation.latitude,30.274,'do not reuse the saved coordinate');
  assert.equal(lastLocation.longitude,120.155);
  assert.equal(picked.length,0);
  await act(async()=>root.unmount());
  fail=true;
  await act(async()=>{root=create(React.createElement(WeatherCityPicker,props));});
  await act(async()=>button('切换城市').props.onClick());
  await act(async()=>button('使用当前位置').props.onClick());
  assert.equal(picked.length,0);
  assert.match(JSON.stringify(root.toJSON()),/暂时无法识别城市名称/);
  assert(root.root.findByType('input'));
  assert.doesNotMatch(JSON.stringify(root.toJSON()),/附近天气仍可用|尚未确认操作结果/);
 } finally {if(root)await act(async()=>root.unmount());if(descriptor)Object.defineProperty(global,'navigator',descriptor);else delete global.navigator;}
});
