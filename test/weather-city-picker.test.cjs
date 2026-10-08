const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs');
const React=require('react'),{act,create}=require('react-test-renderer');
function load(file,requireMock){const m={exports:{}};new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(m.exports,requireMock);return m.exports;}
test('city lookup accepts coarse desktop positions, requires confirmation and preserves a working city on failure',async()=>{
 const city={name:'杭州市',region:'中国 · 浙江省',countryCode:'CN',adcode:'330100',latitude:30.3,longitude:120.2};
 const positions={coords:{latitude:30.274,longitude:120.155,accuracy:5000}};
 let fail=false,picked=[],calls=0,positionCalls=0,lastLocation;
 const locations=load('src/app/lib/weatherLocation.ts',require);
 const {WeatherCityPicker}=load('src/app/components/WeatherCityPicker.tsx',name=>name==='lucide-react'?{LocateFixed:'svg',Search:'svg',X:'svg'}:name.endsWith('/weatherLocation')?locations:name.endsWith('/weatherGeolocation')?{locateWeatherDevice:async()=>{positionCalls++;return positions}}:name.endsWith('/api')?{ApiError:class extends Error{},api:async(_path,options)=>{calls++;lastLocation=JSON.parse(options.body).location;assert.equal(options.readOnly,true);if(fail)throw Error('offline');return {data:city}}}:require(name));
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
  assert.match(JSON.stringify(root.toJSON()),/设备仅提供了大致位置/);
  await act(async()=>root.unmount());
  await act(async()=>{root=create(React.createElement(WeatherCityPicker,{...props,selected:{name:'当前位置附近',region:'',latitude:0,longitude:0}}),{createNodeMock:element=>element.type==='dialog'?{open:false,showModal(){this.open=true},close(){this.open=false}}:null});});
  await act(async()=>button('切换城市').props.onClick());
  await act(async()=>button('使用当前位置').props.onClick());
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

test('city editor keeps the weather card compact and ignores results arriving after close',async()=>{
 const city={name:'San Jose',region:'美国 · California',countryCode:'US',provider:'dbip',latitude:37.3,longitude:-121.9};
 const locations=load('src/app/lib/weatherLocation.ts',require);
 let respond,work,root,saved=0;
 const {WeatherCityPicker}=load('src/app/components/WeatherCityPicker.tsx',name=>name==='lucide-react'?{LocateFixed:'svg',Search:'svg',X:'svg'}:name.endsWith('/weatherLocation')?locations:name.endsWith('/weatherGeolocation')?{}:name.endsWith('/api')?{ApiError:class extends Error{},api:async()=>new Promise(resolve=>{respond=resolve})}:require(name));
 const button=text=>root.root.findAllByType('button').find(b=>b.children.includes(text));
 try {
  await act(async()=>{root=create(React.createElement(WeatherCityPicker,{selected:city,onChange(){saved++;return true},onAttributionChange(){}}),{createNodeMock:e=>e.type==='dialog'?{open:false,showModal(){this.open=true},close(){this.open=false}}:null});});
  assert.equal(root.root.findAllByType('input').length,0);
  assert.equal(root.root.findAllByType('form').length,0);
  await act(async()=>button('切换城市').props.onClick());
  const editor=root.root.findAllByType('dialog').find(d=>d.props['aria-labelledby']==='weather-city-editor-title');
  assert.equal(editor.findAllByType('input').length,1);
  const field=editor.findByType('input');
  await act(async()=>field.props.onChange({target:{value:'San Jose'}}));
  await act(async()=>{work=editor.findByType('form').props.onSubmit({preventDefault(){}})});
  await act(async()=>editor.findAllByType('button').find(b=>b.props['aria-label']==='关闭城市选择').props.onClick());
  await act(async()=>{respond({data:[{...city,id:'sjc'}]});await work;});
  assert.equal(root.root.findAllByType('form').length,0);
  assert.equal(root.root.findAllByType('input').length,0);
  assert.equal(root.root.findAllByType('ul').length,0);
  assert.equal(saved,0);
  assert(button('切换城市'),'the weather card remains usable after dismissing the editor');
 }finally{if(root)await act(async()=>root.unmount());}
});
test('device failures use IP but valid coordinates are never replaced when city lookup fails',async()=>{
 const city={name:'San Jose',region:'美国 · California',countryCode:'US',provider:'dbip',latitude:37.3,longitude:-121.9};
 const locations=load('src/app/lib/weatherLocation.ts',require);
 class ApiError extends Error {constructor(code){super(code);this.code=code;this.kind='http'}}
 let mode='missing',paths=[],picked=[],root;
 const {WeatherCityPicker}=load('src/app/components/WeatherCityPicker.tsx',name=>name==='lucide-react'?{LocateFixed:'svg',Search:'svg',X:'svg'}:name.endsWith('/weatherLocation')?locations:name.endsWith('/weatherGeolocation')?{locateWeatherDevice:async()=>{if(mode==='unavailable')throw {code:2};if(mode==='denied')throw {code:1};if(mode==='timeout')throw {code:3};if(mode==='invalid')return {coords:{latitude:NaN,longitude:116,accuracy:0}};return {coords:{latitude:40,longitude:116,accuracy:5000}}}}:name.endsWith('/api')?{ApiError,api:async(path,options)=>{paths.push(path);assert.equal(options.readOnly,true);if(path.endsWith('/locate'))throw new ApiError(mode==='quota'?'AMAP_10003':'AMAP_NO_CITY');return {data:city}}}:require(name));
 const descriptor=Object.getOwnPropertyDescriptor(global,'navigator');
 Object.defineProperty(global,'navigator',{configurable:true,value:{geolocation:{}}});
 try {
  for(mode of ['missing','unavailable','denied','timeout','invalid','no-api','quota']) {
   Object.defineProperty(global,'navigator',{configurable:true,value:mode==='no-api'?{}:{geolocation:{}}});
   paths=[];
   await act(async()=>{root=create(React.createElement(WeatherCityPicker,{selected:null,onAttributionChange(){},onChange:(...v)=>{picked.push(v);return true}}),{createNodeMock:e=>e.type==='dialog'?{open:false,showModal(){this.open=true},close(){this.open=false}}:null});});
   await act(async()=>root.root.findAllByType('button').find(b=>b.children.includes('选择城市')).props.onClick());
   await act(async()=>root.root.findAllByType('button').find(b=>b.children.includes('使用当前位置')).props.onClick());
   if(['unavailable','denied','timeout','invalid','no-api'].includes(mode)){
    assert.deepEqual(paths,['/weather-mood/locate-network']);
    const view=JSON.stringify(root.toJSON());
    assert.match(view,/市一级城市/);assert.match(view,/更细致的定位和天气/);
    if(mode==='denied')assert.match(view,/未获得位置权限/);
    else {assert.match(view,/无法获取设备位置/);assert.doesNotMatch(view,/未获得位置权限/);}
   }
   else assert(!paths.includes('/weather-mood/locate-network'));
   assert.equal(picked.length,0,'candidate is not saved without confirmation');
   await act(async()=>root.unmount());root=null;
  }
 }finally{if(root)await act(async()=>root.unmount());if(descriptor)Object.defineProperty(global,'navigator',descriptor);else delete global.navigator;}
});

test('domestic IP permission notice opens only in a dialog and never saves a guessed city',async()=>{
 const locations=load('src/app/lib/weatherLocation.ts',require);
 const prompt='境内网络不使用 IP 推测城市。请允许此网站使用位置权限，以获取更细致的定位和天气服务；也可手动搜索城市。';
 class ApiError extends Error {constructor(){super(prompt);this.code='CITY_NETWORK_LOCATION_PERMISSION';this.kind='http'}}
 let saved=0,root,dialogMocks={};
 const {WeatherCityPicker}=load('src/app/components/WeatherCityPicker.tsx',name=>name==='lucide-react'?{LocateFixed:'svg',Search:'svg',X:'svg'}:name.endsWith('/weatherLocation')?locations:name.endsWith('/weatherGeolocation')?{locateWeatherDevice:async()=>{throw {code:1}}}:name.endsWith('/api')?{ApiError,api:async path=>{assert.equal(path,'/weather-mood/locate-network');throw new ApiError()}}:require(name));
 const descriptor=Object.getOwnPropertyDescriptor(global,'navigator');
 Object.defineProperty(global,'navigator',{configurable:true,value:{geolocation:{}}});
 try{
  await act(async()=>{root=create(React.createElement(WeatherCityPicker,{selected:null,onChange(){saved++;return true},onAttributionChange(){}}),{createNodeMock:e=>{if(e.type!=='dialog')return null;const node={open:false,showModal(){this.open=true},close(){this.open=false}};dialogMocks[e.props['aria-labelledby']]=node;return node}});});
  assert.doesNotMatch(JSON.stringify(root.toJSON()),/位置权限|市一级|境内网络/);
  await act(async()=>root.root.findAllByType('button').find(b=>b.children.includes('选择城市')).props.onClick());
   await act(async()=>root.root.findAllByType('button').find(b=>b.children.includes('使用当前位置')).props.onClick());
  assert.match(JSON.stringify(root.toJSON()),/需要位置权限/);
  const dialogs=root.root.findAllByType('dialog');
  const confirmation=dialogs.find(d=>d.props['aria-labelledby']==='weather-city-confirm-title');
  const notice=dialogs.find(d=>d.props['aria-labelledby']==='weather-city-notice-title');
  assert.equal(confirmation.children.length,0);
  assert.equal(dialogMocks['weather-city-notice-title'].open,true);
  assert.match(notice.findByType('p').children.join(''),/允许位置权限/);
  assert.equal(root.root.findAll(n=>n.props.className==='weather-city-message').length,0);
  for(const paragraph of root.root.findAllByType('p')){
   let owner=paragraph.parent;
   while(owner&&owner.type!=='dialog')owner=owner.parent;
   assert(owner,'explanatory text must stay inside a dialog');
  }
  assert.doesNotMatch(JSON.stringify(root.toJSON()),/确认使用/);
  assert.equal(saved,0);
  await act(async()=>notice.props.onCancel());
  assert.equal(notice.children.length,0);
  assert(root.root.findByType('input'),'search remains available after dismissing permission notice');
 }finally{if(root)await act(async()=>root.unmount());if(descriptor)Object.defineProperty(global,'navigator',descriptor);else delete global.navigator;}
});
