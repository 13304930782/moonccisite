const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),{JSDOM}=require('jsdom');
function fixture(file){
 const dom=new JSDOM('<!doctype html><body></body>',{pretendToBeVisual:true}),saved=new Map(),frames=new Map(),animations=[];let frame=0,reduce=false;
 const media=new dom.window.EventTarget();media.matches=false;
 const globals={window:dom.window,document:dom.window.document,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,MutationObserver:dom.window.MutationObserver,innerWidth:1440,innerHeight:900,matchMedia:()=>media,getComputedStyle:dom.window.getComputedStyle.bind(dom.window),requestAnimationFrame:fn=>{frames.set(++frame,fn);return frame;},cancelAnimationFrame:id=>frames.delete(id)};
 for(const[key,value]of Object.entries(globals)){saved.set(key,Object.getOwnPropertyDescriptor(global,key));Object.defineProperty(global,key,{value,configurable:true,writable:true});}
 Object.assign(dom.window.HTMLElement.prototype,{animate(){},getClientRects(){return this.isConnected?[{}]:[];},getBoundingClientRect(){return {x:200,y:150,left:200,top:150,right:600,bottom:450,width:400,height:300};}});
 const motionValue=value=>{const listeners=new Set();return {get:()=>value,set:n=>{value=n;listeners.forEach(fn=>fn(n));},on:(_,fn)=>{listeners.add(fn);return()=>listeners.delete(fn);}};};
 const animate=(value,target,options)=>{let finish;const promise=new Promise(resolve=>finish=resolve),entry={value,target,options,stopped:false,stop(){this.stopped=true;},then:promise.then.bind(promise),finish(){value.set(target);finish();}};animations.push(entry);return entry;};
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,module={exports:{}};
 const presets={press:{duration:.065},releaseSpring:{type:'spring'},surfaceSpring:{type:'spring'},surfaceExit:{duration:.12},opacity:{duration:.13}};
 new Function('exports','require',code)(module.exports,name=>name==='motion'?{animate,motionValue}:name.endsWith('motionPreference')?{reducedMotion:()=>reduce}:{motionDesign:presets});
 const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn());await new Promise(resolve=>setImmediate(resolve));};
 const pointer=(node,type='pointerdown')=>{const event=new dom.window.Event(type,{bubbles:true});Object.defineProperties(event,{isPrimary:{value:true},button:{value:0}});node.dispatchEvent(event);};
 return {...module.exports,document:dom.window.document,animations,presets,flush,pointer,setReduced(){reduce=true;dom.window.dispatchEvent(new dom.window.Event('mooncci:motion-change'));},close(){dom.window.close();for(const[key,descriptor]of saved){if(descriptor)Object.defineProperty(global,key,descriptor);else delete global[key];}}};
}
test('held press and physical release are distinct; an old completion cannot reset a newer press',async()=>{
 const f=fixture('src/app/lib/controlMotion.ts'),stop=f.installControlMotion();try{
  const button=f.document.createElement('button');button.className='quiet-button';button.style.scale='.985';f.document.body.append(button);
  f.pointer(button);assert.equal(f.animations[0].value.get(),.985);assert.equal(f.animations[0].target,.96);assert.equal(f.animations[0].options,f.presets.press);
  f.animations[0].value.set(.96);f.pointer(button,'pointerup');const old=f.animations.at(-1);assert.equal(old.target,1);assert.equal(old.options,f.presets.releaseSpring);
  f.pointer(button);old.finish();await Promise.resolve();assert.equal(button.dataset.motionPressed,'true');
  f.setReduced();assert.equal(button.style.scale,'.985');assert.equal(button.dataset.motionPressed,undefined);
 }finally{stop();f.close();}
});
test('disabled controls never animate and cleanup removes delegated listeners',()=>{
 const f=fixture('src/app/lib/controlMotion.ts'),stop=f.installControlMotion();try{const button=f.document.createElement('button');button.className='ui-btn';button.disabled=true;f.document.body.append(button);f.pointer(button);assert.equal(f.animations.length,0);stop();button.disabled=false;f.pointer(button);assert.equal(f.animations.length,0);}finally{stop();f.close();}
});
test('surface exit is an inert presentation without modal ownership and reopening reuses its current values',async()=>{
 const f=fixture('src/app/lib/surfaceMotion.ts'),stop=f.installSurfaceMotion();try{
  const make=()=>{const node=f.document.createElement('div');node.id='stable-dialog';node.dataset.slot='dialog-content';node.dataset.state='open';node.setAttribute('role','dialog');node.innerHTML='<button>Close</button><iframe src="about:blank"></iframe>';f.document.body.append(node);return node;};
  const first=make();await f.flush();assert.equal(first.dataset.motionSurfaceActive,'true');const movement=f.animations.find(a=>a.options===f.presets.surfaceSpring);movement.value.set(.63);first.remove();await f.flush();
  const ghost=f.document.querySelector('[data-motion-presentation]');assert(ghost);assert.equal(ghost.inert,true);assert.equal(ghost.querySelector('[role=dialog]'),null);assert.equal(ghost.querySelector('iframe'),null);assert.equal(ghost.querySelector('#stable-dialog'),null);assert.equal(f.document.body.style.pointerEvents,'');
  make();await f.flush();const next=f.animations.filter(a=>a.options===f.presets.surfaceSpring).at(-1);assert.equal(next.value,movement.value);assert.equal(next.value.get(),.63);assert.equal(f.document.querySelector('[data-motion-presentation]'),null);
  f.setReduced();assert.equal(f.document.querySelector('[data-slot=dialog-content]').style.opacity,'1');
 }finally{stop();f.close();}
});
test('pending surfaces settle visibly when motion is disabled and images opt out of generic motion',async()=>{
 const f=fixture('src/app/lib/surfaceMotion.ts'),stop=f.installSurfaceMotion();try{
  const node=f.document.createElement('div');node.dataset.slot='dialog-content';node.dataset.state='open';f.document.body.append(node);await new Promise(r=>setImmediate(r));assert.equal(node.style.opacity,'0');f.setReduced();await f.flush();assert.equal(node.style.opacity,'1');
  const image=node.cloneNode();image.dataset.motionSurface='image';f.document.body.append(image);await f.flush();assert.equal(f.animations.length,0);
 }finally{stop();f.close();}
});
test('a kept-mounted disclosure restores its base transform before reentering',async()=>{
 const f=fixture('src/app/lib/surfaceMotion.ts'),stop=f.installSurfaceMotion();try{
  const node=f.document.createElement('div');node.className='nav-popover';node.dataset.state='open';node.style.transform='translate(-50%, -50%)';f.document.body.append(node);await f.flush();
  f.animations.find(a=>a.options===f.presets.surfaceSpring).value.set(.5);node.dataset.state='closed';await f.flush();assert.equal(node.style.transform,'translate(-50%, -50%)');
  node.dataset.state='open';await f.flush();assert.equal((node.style.transform.match(/translate\(-50%/g)||[]).length,1);
 }finally{stop();f.close();}
});

test('positioned surfaces wait for placement and exit from their latest position and theme',async()=>{
 const f=fixture('src/app/lib/surfaceMotion.ts'),stop=f.installSurfaceMotion();try{
  const node=f.document.createElement('div');node.className='rs-panel';node.dataset.motionReady='false';node.style.backgroundColor='white';f.document.body.append(node);await f.flush();assert.equal(f.animations.length,0);assert.equal(node.style.opacity,'');
  node.dataset.motionReady='true';await f.flush();const movement=f.animations.find(a=>a.options===f.presets.surfaceSpring);movement.finish();await Promise.resolve();
  node.getBoundingClientRect=()=>({left:785,top:261,width:400,height:300,right:1185,bottom:561});node.style.backgroundColor='rgb(32, 32, 32)';f.pointer(node);node.remove();await f.flush();
  const ghost=f.document.querySelector('[data-motion-presentation] .rs-panel');assert(ghost);assert.equal(ghost.style.left,'785px');assert.equal(ghost.style.top,'261px');assert.equal(ghost.style.backgroundColor,'rgb(32, 32, 32)');
 }finally{stop();f.close();}
});

test('closing before the first animation frame cannot leave a hidden kept-mounted panel',async()=>{
 const f=fixture('src/app/lib/surfaceMotion.ts'),stop=f.installSurfaceMotion();try{
  const node=f.document.createElement('div');node.className='nav-popover';node.dataset.state='open';f.document.body.append(node);await new Promise(r=>setImmediate(r));assert.equal(node.style.opacity,'0');node.dataset.state='closed';await f.flush();assert.equal(node.style.opacity,'1');f.setReduced();node.dataset.state='open';await f.flush();assert.equal(node.style.opacity,'1');assert.equal(f.animations.length,0);
 }finally{stop();f.close();}
});

test('lazy enhancement waits for an existing CSS press and cancels a pending start on unmount',async()=>{
 const React=require('react'),{act,create}=require('react-test-renderer'),originals=new Map(),frames=new Map();let held=true,frame=0,installed=0,stopped=0,root;
 const globals={document:{querySelector:()=>held?{}:null},requestAnimationFrame:fn=>{frames.set(++frame,fn);return frame;},cancelAnimationFrame:id=>frames.delete(id)};
 for(const[key,value]of Object.entries(globals)){originals.set(key,Object.getOwnPropertyDescriptor(global,key));Object.defineProperty(global,key,{value,writable:true,configurable:true});}
 const code=ts.transpileModule(fs.readFileSync('src/app/components/MotionExperience.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,module={exports:{}};
 const install=()=>{installed++;return()=>stopped++;};new Function('exports','require',code)(module.exports,name=>name==='react'?React:{installControlMotion:install,installSurfaceMotion:install});
 try{await act(async()=>{root=create(React.createElement(module.exports.default));});assert.equal(installed,0);held=false;await act(async()=>{const jobs=[...frames.values()];frames.clear();jobs.forEach(fn=>fn());});assert.equal(installed,2);await act(async()=>root.unmount());assert.equal(stopped,2);
  held=true;await act(async()=>{root=create(React.createElement(module.exports.default));});assert.equal(frames.size,1);await act(async()=>root.unmount());assert.equal(frames.size,0);assert.equal(installed,2);
 }finally{if(root)await act(async()=>root.unmount());for(const[key,value]of originals){if(value)Object.defineProperty(global,key,value);else delete global[key];}}
});
