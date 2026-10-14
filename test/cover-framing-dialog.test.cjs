const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

function loadTs(file, imports = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true},
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => name.endsWith('.css') ? {} : imports[name] || require(name), module, module.exports);
  return module.exports;
}

test('detail focus keeps cards complete and preserves legacy card data while committing only confirmation', async () => {
  const dom = new JSDOM('<div id="host"></div>', {url:'http://localhost/admin/write',pretendToBeVisual:true});
  const win=dom.window,globals=new Map(),observers=[];
  class ResizeObserverMock {
    constructor(callback) {this.callback=callback;this.targets=[];this.disconnected=false;observers.push(this);}
    observe(target) {this.targets.push(target);}
    disconnect() {this.disconnected=true;}
  }
  class LoadedImage {
    constructor() {this.naturalWidth=1200;this.naturalHeight=800;}
    set src(value) {this.url=value;queueMicrotask(()=>this.onload?.());}
  }
  const values={window:win,document:win.document,localStorage:win.localStorage,HTMLElement:win.HTMLElement,HTMLInputElement:win.HTMLInputElement,HTMLButtonElement:win.HTMLButtonElement,Element:win.Element,Node:win.Node,NodeFilter:win.NodeFilter,DocumentFragment:win.DocumentFragment,CustomEvent:win.CustomEvent,Event:win.Event,MutationObserver:win.MutationObserver,getComputedStyle:win.getComputedStyle.bind(win),requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win),ResizeObserver:ResizeObserverMock,Image:LoadedImage,IS_REACT_ACT_ENVIRONMENT:true};
  for(const [key,value] of Object.entries(values)) {globals.set(key,Object.getOwnPropertyDescriptor(global,key));Object.defineProperty(global,key,{value,writable:true,configurable:true});}
  const bounds=win.HTMLElement.prototype.getBoundingClientRect;
  win.HTMLElement.prototype.getBoundingClientRect=function(){return this.classList.contains('cover-framing-source-stage')?new win.DOMRect(0,0,400,300):bounds.call(this);};
  win.HTMLElement.prototype.setPointerCapture=function(id){this.captured=id;};
  win.HTMLElement.prototype.hasPointerCapture=function(id){return this.captured===id;};
  win.HTMLElement.prototype.releasePointerCapture=function(){this.captured=null;};
  const React=require('react'),{act}=React,{createRoot}=require('react-dom/client');
  let root;
  const settle=()=>act(async()=>new Promise(resolve=>setTimeout(resolve,0)));
  try {
    const crop=loadTs('src/app/lib/coverCrop.ts');
    const image=loadTs('src/app/components/CoverImage.tsx',{'../lib/coverCrop':crop});
    const safeUrl=loadTs('src/app/lib/safeUrl.ts');
    const responsiveImage=loadTs('src/app/lib/responsiveImage.ts');
    const cardImage=loadTs('src/app/components/CardCoverImage.tsx',{'../lib/safeUrl':safeUrl,'../lib/responsiveImage':responsiveImage});
    const {CoverFramingDialog}=loadTs('src/app/components/CoverFramingDialog.tsx',{'../lib/coverCrop':crop,'./CoverImage':image,'./CardCoverImage':cardImage,'../lib/safeUrl':safeUrl});
    const commits=[];
    function Harness({initial}) {
      const [open,setOpen]=React.useState(false),[saved,setSaved]=React.useState(initial);
      return React.createElement(React.Fragment,null,
        React.createElement('button',{id:'trigger',onClick:()=>setOpen(true)},'Open framing'),
        open&&React.createElement(CoverFramingDialog,{src:'/api/uploads/framing-test.png',value:saved,onClose:()=>setOpen(false),onConfirm:value=>{commits.push(value);setSaved(value);setOpen(false);}}));
    }
    const dialog=()=>document.querySelector('[role="dialog"]');
    const marker=()=>dialog().querySelector('.cover-framing-focus[data-target="detail"]');
    const confirm=()=>dialog().querySelector('.cover-framing-confirm');
    const trigger=()=>document.getElementById('trigger');
    async function open(){await act(async()=>{trigger().focus();trigger().click();});assert.ok(marker());assert.equal(confirm().disabled,false);assert.equal(document.activeElement,dialog().querySelector('h2'));}
    async function close(button){await act(async()=>button.click());await settle();assert.equal(dialog(),null);assert.equal(document.activeElement,trigger());}
    async function move(key,shiftKey=false){await act(async()=>{marker().focus();marker().dispatchEvent(new win.KeyboardEvent('keydown',{key,shiftKey,bubbles:true,cancelable:true}));});}
    function near(actual,expected){assert.ok(Math.abs(actual-expected)<1e-7,`${actual} differs from ${expected}`);}
    async function scenario(initial,key){await act(async()=>root.render(React.createElement(Harness,{initial,key})));await open();}
    root=createRoot(document.getElementById('host'));

    const initial={card:{x:.527382,y:.7428351275037598,zoom:2.1389},detail:{x:.7,y:.1,zoom:1.47}};
    await scenario(initial,'old');
    assert.ok(document.getElementById(dialog().getAttribute('aria-describedby')),'dialog description must retain the Radix accessible relationship');
    assert.equal(dialog().querySelectorAll('[role="switch"]').length,0);
    assert.equal(dialog().querySelectorAll('.cover-framing-focus').length,1);
    assert.equal(dialog().querySelectorAll('input[type="range"]').length,1);
    assert.equal(dialog().querySelector('.cover-framing-description').textContent,'卡片完整显示原图，焦点和缩放仅影响详情头图');
    assert.equal(dialog().querySelectorAll('.cover-framing-previews figure').length,3);
    assert.equal(dialog().querySelectorAll('[role="tab"]').length,0);
    assert.ok(observers.some(observer=>observer.targets.includes(dialog().querySelector('.cover-framing-source-stage'))));
    const box=dialog().querySelector('.cover-framing-source-bounds');
    near(parseFloat(box.style.width),356);near(parseFloat(box.style.height),356*2/3);near(parseFloat(box.style.top),(300-356*2/3)/2);
    const completeCard=dialog().querySelector('.cover-card-full img');
    assert.ok(completeCard.classList.contains('card-cover-image'));
    assert.equal(completeCard.style.getPropertyValue('--cover-x'),'');assert.equal(completeCard.style.transform,'');
    assert.equal(completeCard.closest('.cover-framing-preview').style.aspectRatio,'','card must not impose the historical cropped ratio');
    assert.equal(dialog().querySelectorAll('.cover-framing-previews img')[1].style.getPropertyValue('--cover-zoom'),'1.47','opening old off-step zoom must not round the rendered image');
    await close(confirm());assert.deepEqual(commits.at(-1),initial,'untouched confirmation must preserve all old coordinates and zoom');
    await open();
    await act(async()=>{const slider=dialog().querySelector('input[type="range"]');Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype,'value').set.call(slider,'2.1');slider.dispatchEvent(new win.Event('input',{bubbles:true}));});
    for(const preview of Array.from(dialog().querySelectorAll('.cover-framing-previews img')).slice(1))assert.equal(preview.style.getPropertyValue('--cover-zoom'),'2.1');
    assert.equal(dialog().querySelector('.cover-card-full img').style.getPropertyValue('--cover-zoom'),'','zoom never affects the complete card preview');
    await close(confirm());assert.deepEqual(commits.at(-1),{card:initial.card,detail:{...initial.detail,zoom:2.1}},'zoom saves only detail');
    const committedBeforeCancel=commits.length;
    await open();await move('ArrowRight');await move('ArrowUp',true);
    assert.equal(marker().style.left,'71%');assert.equal(marker().style.top,'5%');
    await close(dialog().querySelector('.cover-framing-header > button:first-child'));
    assert.equal(commits.length,committedBeforeCancel,'cancel does not commit');
    await open();assert.equal(marker().style.left,'70%');await move('ArrowRight');await close(confirm());
    assert.deepEqual(commits.at(-1),{card:initial.card,detail:{...initial.detail,x:.71,zoom:2.1}},'moving focus must update only detail and retain exact legacy card values');
    await open();await act(async()=>dialog().querySelector('.cover-framing-footer button').click());
    assert.equal(marker().style.top,'30%');
    assert.equal(commits.length,committedBeforeCancel+1,'reset remains a temporary draft');await close(confirm());
    assert.deepEqual(commits.at(-1),{card:initial.card,detail:{x:.5,y:.3,zoom:1}},'restore default never changes legacy card data');

    const partial={card:{x:.62,y:.41,zoom:1.23},detail:null};
    await scenario(partial,'partial');assert.equal(marker().style.top,'0%');
    await close(confirm());assert.deepEqual(commits.at(-1),partial,'old missing side is preserved');
    await open();await move('ArrowLeft');await close(confirm());
    assert.deepEqual(commits.at(-1),{card:partial.card,detail:{x:.49,y:0,zoom:1}},'card-only legacy crop starts from the historical top-aligned detail and leaves card unchanged');

    const detailOnly={card:null,detail:{x:.375,y:.8123456789,zoom:1.739}};
    await scenario(detailOnly,'detail-only');await close(confirm());assert.deepEqual(commits.at(-1),detailOnly,'null card and untouched off-step detail stay exact');
    await open();await act(async()=>dialog().querySelector('.cover-framing-footer button').click());await close(confirm());
    assert.deepEqual(commits.at(-1),{card:null,detail:{x:.5,y:.3,zoom:1}},'reset retains a null legacy card');

    await scenario(null,'new');assert.equal(marker().style.left,'50%');assert.equal(marker().style.top,'30%');
    await move('ArrowRight');await move('ArrowDown',true);
    const previews=dialog().querySelectorAll('.cover-framing-previews img');
    assert.equal(previews[0].style.getPropertyValue('--cover-x'),'');assert.equal(previews[0].style.getPropertyValue('--cover-zoom'),'');
    for(const preview of Array.from(previews).slice(1)){assert.equal(preview.style.getPropertyValue('--cover-x'),'51%');assert.equal(preview.style.getPropertyValue('--cover-y'),'35%');}
    // Pointer deltas use the contained image (356x237.33), excluding letterbox and hit-target gutters.
    function pointer(type,props){const event=new win.Event(type,{bubbles:true,cancelable:true});Object.assign(event,{pointerId:7,button:0,isPrimary:true,clientX:100,clientY:100,...props});marker().dispatchEvent(event);}
    await act(async()=>pointer('pointerdown',{}));await act(async()=>pointer('pointermove',{clientX:171.2,clientY:171.2}));await act(async()=>pointer('pointerup',{clientX:171.2,clientY:171.2}));
    near(parseFloat(marker().style.left),71);near(parseFloat(marker().style.top),65);
    await close(confirm());assert.equal(commits.at(-1).card,null);near(commits.at(-1).detail.x,.71);near(commits.at(-1).detail.y,.65);assert.equal(commits.at(-1).detail.zoom,1);
    await open();await move('ArrowUp',true);
    near(parseFloat(marker().style.top),60);await close(confirm());
    assert.equal(commits.at(-1).card,null);near(commits.at(-1).detail.y,.6);
    await open();const beforeEsc=commits.length;
    await act(async()=>document.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));await settle();
    assert.equal(dialog(),null);assert.equal(commits.length,beforeEsc);assert.equal(document.activeElement,trigger());
  } finally {
    try {if(root)await act(async()=>root.unmount());await settle();}
    finally {win.HTMLElement.prototype.getBoundingClientRect=bounds;dom.window.close();for(const [key,descriptor] of globals){if(descriptor)Object.defineProperty(global,key,descriptor);else delete global[key];}}
    assert.ok(observers.every(observer=>observer.disconnected),'portal measurements clean up after closing');
  }
});
