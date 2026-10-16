const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react'),{act,create}=require('react-test-renderer'),fs=require('node:fs'),ts=require('typescript');
function compile(file,imports){const module={exports:{}};new Function('module','exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText)(module,module.exports,name=>Object.hasOwn(imports,name)?imports[name]:require(name));return module.exports;}
function fixture(){
 const saved=new Map(),listeners=new Set(),runs=[];let reduced=false;
 for(const [key,value]of Object.entries({window:{addEventListener:(_,fn)=>listeners.add(fn),removeEventListener:(_,fn)=>listeners.delete(fn)},matchMedia:()=>({addEventListener:(_,fn)=>listeners.add(fn),removeEventListener:(_,fn)=>listeners.delete(fn)})})){saved.set(key,Object.getOwnPropertyDescriptor(global,key));Object.defineProperty(global,key,{value,writable:true,configurable:true});}
 const motion={motionValue(current){const observers=new Set();return{current,velocity:0,on(_,fn){observers.add(fn);return()=>observers.delete(fn);},get(){return this.current;},jump(value){this.current=value;this.velocity=0;this.stop();observers.forEach(fn=>fn());},stop(){this.stopped=true;},step(value,velocity){this.current=value;this.velocity=velocity;observers.forEach(fn=>fn());}};},animate(value,target,options){const callbacks=[],run={value,target,options,from:value.current,velocity:value.velocity,then(fn){callbacks.push(fn);return this;},finish(){value.step(target,0);callbacks.forEach(fn=>fn());}};runs.push(run);return run;}};
 const imports={'motion':motion,'./motionPreference':{reducedMotion:()=>reduced},'../lib/motionPreference':{reducedMotion:()=>reduced},'./motionDesign':{motionDesign:{selectionSpring:{type:'spring'},disclosureSpring:{type:'spring'},opacity:{duration:.13}}},'../lib/motionDesign':{motionDesign:{selectionSpring:{type:'spring'},disclosureSpring:{type:'spring'},opacity:{duration:.13}}},'../../styles/selection-fold.css':{}};
 return{imports,runs,reduce(){reduced=true;listeners.forEach(fn=>fn());},close(){for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(global,key,descriptor);else delete global[key];}}};
}
test('one selection marker keeps its in-flight position and velocity on rapid reversal',async()=>{
 const f=fixture(),{useMovingIndicator}=compile('src/app/lib/useMovingIndicator.ts',f.imports);let root,selected={x:0,width:28};const marker={style:{},hasAttribute:()=>false},group={dataset:{},scrollLeft:0,getBoundingClientRect:()=>({left:10}),querySelector:selector=>selector==='[data-selection-indicator]'?marker:{matches:()=>false,getBoundingClientRect:()=>({left:selected.x+10,width:selected.width})},querySelectorAll:()=>[]};
 function Probe({value}){useMovingIndicator({current:group},value);return null;}
 try{await act(async()=>{root=create(React.createElement(Probe,{value:'all'}));});assert.equal(marker.style.width,'28px');assert.equal(f.runs.length,0);
  selected={x:80,width:56};await act(async()=>root.update(React.createElement(Probe,{value:'post'})));f.runs[0].value.step(35,500);f.runs[2].value.step(42,100);
  selected={x:0,width:28};await act(async()=>root.update(React.createElement(Probe,{value:'all'})));assert.equal(f.runs[4].from,35);assert.equal(f.runs[4].velocity,500);assert.equal(f.runs[4].target,0);assert.equal(marker.style.transform,'translateX(35px)');
  f.reduce();assert.equal(marker.style.transform,'translateX(0px)');assert.equal(marker.style.width,'28px');assert.equal(f.runs[4].value.velocity,0);
 }finally{await act(async()=>root?.unmount());f.close();}
});
test('filled selection follows wrapped rows using layout geometry, unaffected by button press scale',async()=>{
 const f=fixture(),{useMovingIndicator}=compile('src/app/lib/useMovingIndicator.ts',f.imports);let root,index=0;const marker={style:{},hasAttribute:()=>true},group={dataset:{},scrollLeft:0,scrollTop:0,getBoundingClientRect:()=>({left:0,top:0}),querySelector:selector=>selector==='[data-selection-indicator]'?marker:buttons[index],querySelectorAll:()=>buttons};
 const buttons=[{offsetLeft:0,offsetTop:0,offsetWidth:84,offsetHeight:44},{offsetLeft:0,offsetTop:52,offsetWidth:120,offsetHeight:44}].map(button=>({...button,offsetParent:group,clientLeft:1,clientTop:1,clientWidth:button.offsetWidth-2,clientHeight:42,style:{setProperty(key,value){this[key]=value;}},matches:()=>false,getBoundingClientRect:()=>{throw Error('press-scaled visual bounds are not the layout target');}}));
 function Probe({value}){useMovingIndicator({current:group},value);return null;}
 try{await act(async()=>{root=create(React.createElement(Probe,{value:0}));});assert.equal(marker.style.height,'44px');assert.equal(buttons[0].style['--selection-clip'],'inset(-1px -1px -1px -1px round var(--selection-radius,10px))');index=1;
  await act(async()=>root.update(React.createElement(Probe,{value:1})));assert.equal(f.runs[1].target,52);assert.equal(f.runs[2].target,120);f.runs[1].value.step(26,100);assert.equal(buttons[0].style['--selection-clip'],'inset(25px -1px -27px -1px round var(--selection-radius,10px))','partial coverage clips at the actual marker edge rather than changing the whole label');await act(async()=>f.runs.forEach(run=>run.finish()));assert.equal(marker.style.transform,'translate(0px,52px)');assert.equal(buttons[1].style['--selection-clip'],'inset(-1px -1px -1px -1px round var(--selection-radius,10px))');
 }finally{await act(async()=>root?.unmount());f.close();}
});
test('a newly mounted page-current marker initializes even when its target matches the previous group',async()=>{
 const f=fixture(),{useMovingIndicator}=compile('src/app/lib/useMovingIndicator.ts',f.imports);let root,marker={style:{},hasAttribute:()=>false};const selected={matches:()=>false,getBoundingClientRect:()=>({left:10,top:0,width:80,height:44})},group={dataset:{},scrollLeft:0,getBoundingClientRect:()=>({left:10,top:0}),querySelector:selector=>selector==='[data-selection-indicator]'?marker:selector.includes('[aria-current="page"]')?selected:null,querySelectorAll:()=>[]};
 function Probe({value}){useMovingIndicator({current:group},value);return null;}
 try{await act(async()=>{root=create(React.createElement(Probe,{value:'short'}));});assert.equal(marker.style.width,'80px');marker=null;await act(async()=>root.update(React.createElement(Probe,{value:'native'})));marker={style:{},hasAttribute:()=>false};delete group.dataset.indicatorReady;await act(async()=>root.update(React.createElement(Probe,{value:'short'})));assert.equal(marker.style.width,'80px');assert.equal(group.dataset.indicatorReady,'true');assert.equal(f.runs.length,0,'new markers initialize rather than animate from a detached element');
 }finally{await act(async()=>root?.unmount());f.close();}
});
test('disclosure reversal keeps measured height, current velocity and live child identity',async()=>{
 const f=fixture(),{MotionDisclosure}=compile('src/app/components/MotionDisclosure.tsx',f.imports);let root;const outer={style:{},dataset:{},animate(){}},inner={style:{},getBoundingClientRect:()=>({height:120})};
 const render=open=>React.createElement(MotionDisclosure,{open,id:'fold'},React.createElement('input',{defaultValue:'keep input'}));
 try{await act(async()=>{root=create(render(false),{createNodeMock:node=>node.props.className==='motion-disclosure-content'?inner:outer});});await act(async()=>{f.runs[1].finish();});
  await act(async()=>root.update(render(true)));const input=root.root.findByType('input');const opening=f.runs.at(-1);opening.value.step(46,330);
  await act(async()=>root.update(render(false)));const closing=f.runs.at(-1);assert.equal(closing.from,46);assert.equal(closing.velocity,330);assert.equal(outer.inert,true);assert.equal(root.root.findByType('input'),input);
  closing.value.step(30,-220);await act(async()=>root.update(render(true)));const reopened=f.runs.at(-1);assert.equal(reopened.from,30);assert.equal(reopened.velocity,-220);assert.equal(outer.inert,false);
  await act(async()=>closing.finish());assert.equal(root.root.findByType('input'),input,'obsolete close cannot remove reopened content');
  await act(async()=>reopened.finish());assert.equal(outer.style.height,'auto');assert.equal(root.root.findAllByType('div')[0].props.hidden,false);
  await act(async()=>root.update(render(false)));await act(async()=>f.runs.at(-1).finish());assert.equal(root.root.findAllByType('input').length,0);assert.equal(root.root.findAllByType('div')[0].props.hidden,true);
 }finally{await act(async()=>root?.unmount());f.close();}
});
test('disclosures remain complete without animation support and when motion is reduced mid-flight',async()=>{
 const f=fixture(),{MotionDisclosure}=compile('src/app/components/MotionDisclosure.tsx',f.imports);let root;const outer={style:{},dataset:{}},inner={style:{},getBoundingClientRect:()=>({height:120})};const render=open=>React.createElement(MotionDisclosure,{open},'content');
 try{await act(async()=>{root=create(render(false),{createNodeMock:node=>node.props.className==='motion-disclosure-content'?inner:outer});});await act(async()=>root.update(render(true)));assert.equal(outer.style.height,'auto');assert.equal(outer.inert,false);assert.equal(f.runs.length,0);
  outer.animate=()=>{};await act(async()=>root.update(render(false)));assert.ok(f.runs.length>0);await act(async()=>f.reduce());assert.equal(outer.style.height,'0px');assert.equal(root.root.findAllByType('div')[0].props.hidden,true);
 }finally{await act(async()=>root?.unmount());f.close();}
});
test('a settled disclosure follows an animated descendant without a second delayed size animation',async()=>{
 const f=fixture(),{MotionDisclosure}=compile('src/app/components/MotionDisclosure.tsx',f.imports);let root,notifyResize,size=120,nested=false;const saved=Object.getOwnPropertyDescriptor(global,'ResizeObserver');
 Object.defineProperty(global,'ResizeObserver',{configurable:true,value:class{constructor(fn){notifyResize=fn;}observe(){}disconnect(){}}});
 let queued;const owner={requestAnimationFrame(fn){queued=fn;return 1;},cancelAnimationFrame(){queued=undefined;}},outer={style:{},dataset:{},animate(){},ownerDocument:{defaultView:owner}},inner={style:{},getBoundingClientRect:()=>({height:size}),querySelector:()=>nested?{}:null};
 try{await act(async()=>{root=create(React.createElement(MotionDisclosure,{open:true},'content'),{createNodeMock:node=>node.props.className==='motion-disclosure-content'?inner:outer});});size=170;nested=true;notifyResize();await act(async()=>queued());assert.equal(outer.style.height,'auto');assert.equal(f.runs.length,0);
  nested=false;size=220;notifyResize();await act(async()=>queued());assert.equal(f.runs.at(-1).target,220);assert.equal(outer.style.height,'170px');
 }finally{await act(async()=>root?.unmount());if(saved)Object.defineProperty(global,'ResizeObserver',saved);else delete global.ResizeObserver;f.close();}
});
test('disclosure size observations coalesce outside observer delivery and cancel in their owner window',async()=>{
 const f=fixture(),{MotionDisclosure}=compile('src/app/components/MotionDisclosure.tsx',f.imports);let root,notifyResize,size=100,next=0;const queued=new Map(),cancelled=[],saved=Object.getOwnPropertyDescriptor(global,'ResizeObserver');
 Object.defineProperty(global,'ResizeObserver',{configurable:true,value:class{constructor(fn){notifyResize=fn;}observe(){}disconnect(){}}});
 const owner={requestAnimationFrame(fn){queued.set(++next,fn);return next;},cancelAnimationFrame(id){queued.delete(id);cancelled.push(id);}},outer={style:{},dataset:{},animate(){},ownerDocument:{defaultView:owner}},inner={style:{},getBoundingClientRect:()=>({height:size}),querySelector:()=>null};
 try{await act(async()=>{root=create(React.createElement(MotionDisclosure,{open:true},'content'),{createNodeMock:node=>node.props.className==='motion-disclosure-content'?inner:outer});});size=160;notifyResize();size=190;notifyResize();assert.equal(queued.size,1);assert.equal(f.runs.length,0,'observer delivery never writes dimensions');
  const frame=queued.values().next().value;queued.clear();await act(async()=>frame());assert.equal(f.runs.at(-1).target,190,'one owner frame reads the latest size');size=230;notifyResize();const id=next;await act(async()=>root.update(React.createElement(MotionDisclosure,{open:false},'content')));assert.deepEqual(cancelled,[id]);assert.equal(f.runs.at(-1).target,0,'explicit close starts immediately without waiting for observer frame');assert.equal(queued.size,0);
 }finally{await act(async()=>root?.unmount());if(saved)Object.defineProperty(global,'ResizeObserver',saved);else delete global.ResizeObserver;f.close();}
});
test('the existing directory arrow reverses from its current angle and settles when motion is reduced',async()=>{
 const f=fixture(),{MotionChevron}=compile('src/app/components/MotionDisclosure.tsx',f.imports);let root;const span={style:{}};
 try{await act(async()=>{root=create(React.createElement(MotionChevron,{open:false}),{createNodeMock:()=>span});});await act(async()=>root.update(React.createElement(MotionChevron,{open:true})));f.runs.at(-1).value.step(65,300);await act(async()=>root.update(React.createElement(MotionChevron,{open:false})));assert.equal(f.runs.at(-1).from,65);assert.equal(f.runs.at(-1).velocity,300);assert.equal(f.runs.at(-1).target,0);
  f.reduce();assert.equal(span.style.rotate,'0deg');const count=f.runs.length;await act(async()=>root.update(React.createElement(MotionChevron,{open:true})));assert.equal(f.runs.length,count);assert.equal(span.style.rotate,'180deg');
 }finally{await act(async()=>root?.unmount());f.close();}
});
