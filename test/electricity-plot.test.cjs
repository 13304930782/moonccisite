const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {buildSync}=require('esbuild');
const {JSDOM}=require('jsdom');
const target=path.resolve('.cache/electricity-plot-test.cjs');
fs.mkdirSync(path.dirname(target),{recursive:true});
buildSync({entryPoints:['src/app/components/ElectricityChart.tsx'],outfile:target,bundle:true,platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom']});
const {Plot}=require(target),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const point=(total,usage=total,date='2026-10-01')=>({date,total,usage,usageStatus:'暂无数据'});
const props={width:560,height:300,chartMode:'balance',tooltipTrigger:'click',reduceMotion:true};
test('chart keeps gaps, finite zero/single/negative geometry and true zero usage',()=>{
 for(const data of [[],[point(0)],[point(-2)], [point(3),point(null,null,'2026-10-02'),point(4,4,'2026-10-03')]]){
  const html=renderToStaticMarkup(React.createElement(Plot,{...props,plotData:data}));
  assert.doesNotMatch(html,/NaN|Infinity/);
 }
 const dom=new JSDOM(renderToStaticMarkup(React.createElement(Plot,{...props,plotData:[point(3),point(null,null,'2026-10-02'),point(4,4,'2026-10-03')]})));
 assert.equal(dom.window.document.querySelector('path[fill="none"]').getAttribute('d').match(/M/g).length,2);
 const bars=new JSDOM(renderToStaticMarkup(React.createElement(Plot,{...props,chartMode:'usage',plotData:[point(0),point(null,null,'2026-10-02')]})));
 assert.equal(bars.window.document.querySelectorAll('.elec-usage-bar').length,1);
 assert.equal(bars.window.document.querySelector('.elec-usage-bar').getAttribute('height'),'0');
});
test('keyboard selects data and Escape dismisses the accessible tooltip',async()=>{
 const dom=new JSDOM('<div id="root"></div>');
 const previous={window:global.window,document:global.document,IS_REACT_ACT_ENVIRONMENT:global.IS_REACT_ACT_ENVIRONMENT};
 global.window=dom.window;global.document=dom.window.document;global.IS_REACT_ACT_ENVIRONMENT=true;
 const {createRoot}=require('react-dom/client');
 const root=createRoot(document.getElementById('root'));
 try{
  await React.act(()=>root.render(React.createElement(Plot,{...props,plotData:[point(0),point(null,null,'2026-10-02')]})));
  const svg=document.querySelector('svg');
  await React.act(()=>svg.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Home',bubbles:true})));
  assert.match(document.querySelector('[role="status"]').textContent,/0.00 kWh/);
  await React.act(()=>svg.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
  assert.match(document.querySelector('[role="status"]').textContent,/暂无数据/);
  await React.act(()=>svg.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  assert.equal(document.querySelector('[role="status"]'),null);
 }finally{await React.act(()=>root.unmount());Object.assign(global,previous);dom.window.close();}
});

test('latest valid point remains labeled within mobile bounds and styling uses theme variables',()=>{
 const html=renderToStaticMarkup(React.createElement(Plot,{...props,width:260,plotData:[point(3,1,'2026-10-01'),point(9,4,'2026-10-02'),point(null,null,'2026-10-03')]}));
 const dom=new JSDOM(html),doc=dom.window.document,label=doc.querySelector('.elec-v2Chart-tooltip');
 assert.match(label.textContent,/10-02 · 9.00 kWh/);
 assert.equal(doc.querySelectorAll('.elec-v2Chart-latest').length,1);
 assert(Number.parseFloat(label.style.left)>=0);
 assert(Number.parseFloat(label.style.left)+Number.parseFloat(label.style.width)<=260);
 assert.equal(doc.querySelector('path[fill="none"]').getAttribute('stroke-width'),'2.5');
 assert.deepEqual([...doc.querySelectorAll('stop')].map(x=>x.getAttribute('stop-opacity')),['0.12','0']);
 assert.equal(doc.querySelector('line').getAttribute('stroke-dasharray'),'2 5');
 assert.equal(doc.querySelector('.elec-v2Chart-plot').style.animation,'none');
 assert.equal(doc.querySelector('.elec-v2Chart-plot').dataset.motion,'reduced');
 assert(doc.querySelector('g[clip-path]'));
 assert(doc.querySelector('clipPath .elec-curve-reveal'));
 const bars=new JSDOM(renderToStaticMarkup(React.createElement(Plot,{...props,chartMode:'usage',plotData:[point(3,1,'2026-10-01'),point(9,4,'2026-10-02')]}))).window.document.querySelectorAll('.elec-usage-bar');
 assert.deepEqual([...bars].map(x=>[x.getAttribute('rx'),x.getAttribute('fill-opacity')]),[['4','0.55'],['4','1']]);
});

test('click selects a date, range updates retain its identity, and hover leave restores latest',async()=>{
 const dom=new JSDOM('<div id="root"></div>');
 const previous={window:global.window,document:global.document,IS_REACT_ACT_ENVIRONMENT:global.IS_REACT_ACT_ENVIRONMENT};
 global.window=dom.window;global.document=dom.window.document;global.IS_REACT_ACT_ENVIRONMENT=true;
 const {createRoot}=require('react-dom/client'),root=createRoot(document.getElementById('root'));
 const rows=[point(3,1,'2026-10-02'),point(9,4,'2026-10-03')];
 try{
  const draw=data=>React.createElement(Plot,{...props,tooltipTrigger:'hover',plotData:data});
  await React.act(()=>root.render(draw(rows)));
  const svg=document.querySelector('svg');svg.getBoundingClientRect=()=>({left:0,width:560});
  await React.act(()=>svg.dispatchEvent(new window.MouseEvent('click',{clientX:42,bubbles:true})));
  assert.match(document.querySelector('[role="status"]').textContent,/10-02 · 3.00/);
  await React.act(()=>root.render(draw([point(1,1,'2026-10-01'),...rows])));
  assert.match(document.querySelector('[role="status"]').textContent,/10-02 · 3.00/);
  await React.act(()=>svg.dispatchEvent(new window.Event('pointerout',{bubbles:true})));
  assert.equal(document.querySelector('[role="status"]'),null);
  assert.match(document.querySelector('.elec-v2Chart-tooltip').textContent,/10-03 · 9.00/);
 }finally{await React.act(()=>root.unmount());Object.assign(global,previous);dom.window.close();}
});
