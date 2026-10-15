const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),{JSDOM}=require('jsdom');
function load(file,imports={}){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('require','module','exports',code)(name=>name.endsWith('.css')?{}:imports[name]||require(name),module,module.exports);return module.exports;}
function environment(){
 const dom=new JSDOM('<div id="host"></div><textarea id="body"></textarea>',{url:'https://mooncci.site/admin/write',pretendToBeVisual:true}),win=dom.window,saved=new Map();
 const values={window:win,document:win.document,navigator:win.navigator,HTMLElement:win.HTMLElement,HTMLInputElement:win.HTMLInputElement,HTMLButtonElement:win.HTMLButtonElement,Element:win.Element,Node:win.Node,NodeFilter:win.NodeFilter,DocumentFragment:win.DocumentFragment,CustomEvent:win.CustomEvent,Event:win.Event,MutationObserver:win.MutationObserver,getComputedStyle:win.getComputedStyle.bind(win),requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win),ResizeObserver:class{observe(){}disconnect(){}},IS_REACT_ACT_ENVIRONMENT:true};
 for(const [key,value]of Object.entries(values)){saved.set(key,Object.getOwnPropertyDescriptor(global,key));Object.defineProperty(global,key,{value,writable:true,configurable:true});}
 win.HTMLElement.prototype.scrollIntoView=function(){};
 const React=require('react'),{act}=React,{createRoot}=require('react-dom/client'),root=createRoot(document.getElementById('host'));
 return {React,act,root,win,settle:()=>act(async()=>new Promise(resolve=>setTimeout(resolve,25))),close:async()=>{await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(global,key,descriptor);else delete global[key];}}};
}

test('controlled editor modes preserve legacy content and source insertion uses the current selection',async()=>{
 const f=environment(),{React,act,root}=f;let setMode,setValue,insert,changes=[];
 function Visual(props){React.useEffect(()=>{props.registerImageInsert((url,alt)=>props.onChange('visual image '+url+' '+alt));},[props.registerImageInsert]);return React.createElement('div',{'data-visual':true},props.value);}
 const {ArticleEditor}=load('src/app/components/ArticleEditor.tsx',{'../lib/richText':{isRichText:v=>v.startsWith('<!--mooncci-richtext:v1-->')},'./MarkdownContent':{MarkdownContent:({content})=>React.createElement('div',{className:'markdown-body'},content)},'./admin/ArticleImageMenu':{ArticleImageMenu:()=>null},'./VisualMarkdownEditor':{__esModule:true,default:Visual}});
 function Harness({hide=false}){const [mode,changeMode]=React.useState('source'),[value,changeValue]=React.useState('before after');setMode=changeMode;setValue=changeValue;return React.createElement(ArticleEditor,{value,existing:true,mode,onModeChange:changeMode,hideModeControls:hide,onChange:v=>{changes.push(v);changeValue(v);},uploadImage:async()=>'',onError:()=>{},onBusy:()=>{},registerImageInsert:fn=>{insert=fn;}});}
 try{
  await act(async()=>root.render(React.createElement(Harness)));assert.equal(document.querySelector('textarea[aria-label="Markdown 正文"]').value,'before after');
  await act(async()=>setMode('visual'));await f.settle();assert(document.querySelector('[data-visual]'));assert.deepEqual(changes,[],'opening the visual editor must not convert stored Markdown');
  await act(async()=>setMode('preview'));assert.equal(document.querySelector('.article-editor-preview').textContent,'before after');assert.deepEqual(changes,[]);
  await act(async()=>setMode('source'));const source=document.querySelector('textarea[aria-label="Markdown 正文"]');source.focus();source.setSelectionRange(7,7);
  await act(async()=>insert('/api/uploads/a b.png','a[b]\n'));await f.settle();assert.equal(source.value,'before ![a\\[b\\] ](</api/uploads/a%20b.png>)after');assert.equal(document.activeElement,source);
  await act(async()=>root.render(React.createElement(Harness,{hide:true})));assert.equal(document.querySelector('[aria-label="正文编辑模式"]'),null);assert(document.querySelector('textarea[aria-label="Markdown 正文"]'));
  await act(async()=>setValue('<!--mooncci-richtext:v1-->\n<p>kept</p>'));await f.settle();assert(document.querySelector('[data-visual]'));assert.equal(document.querySelector('textarea[aria-label="Markdown 正文"]'),null,'HTML must never appear in the Markdown source editor');
  await act(async()=>root.render(React.createElement(ArticleEditor,{value:'old Markdown',existing:true,onChange:()=>{},uploadImage:async()=>'',onError:()=>{},onBusy:()=>{}})));assert.equal(document.querySelector('textarea[aria-label="Markdown 正文"]').value,'old Markdown');assert.match(document.querySelector('.article-editor-hint').textContent,/源码会原样保留/);assert(document.querySelector('[aria-label="正文编辑模式"]'));
 }finally{await f.close();}
});

test('image menu inserts an image URL, validates schemes, bounds uploads and ignores late results after unmount',async()=>{
 const f=environment(),{React,act,root,win}=f;const inserted=[],errors=[],busy=[];let finish,fail;
 const utils={'./utils':{cn:(...values)=>values.filter(Boolean).join(' ')}},dropdown=load('src/app/components/ui/dropdown-menu.tsx',utils),dialog=load('src/app/components/ui/dialog.tsx',utils),sheet=load('src/app/components/ui/sheet.tsx',utils),safe=load('src/app/lib/safeUrl.ts');
 const {ArticleImageMenu}=load('src/app/components/admin/ArticleImageMenu.tsx',{'../ui/dropdown-menu':dropdown,'../ui/dialog':dialog,'../ui/sheet':sheet,'@/hooks/use-is-breakpoint':{useIsBreakpoint:()=>false},'./AdminButton':{AdminButton:React.forwardRef(({variant,...props},ref)=>React.createElement('button',{...props,ref}))},'../../lib/safeUrl':safe});
 const props={disabled:false,onMediaLibrary:()=>inserted.push('library'),uploadImage:()=>new Promise((resolve,reject)=>{finish=resolve;fail=reject;}),onInsert:(url,alt)=>{inserted.push({url,alt});document.getElementById('body').focus();},onError:value=>errors.push(value),onBusy:value=>busy.push(value)};
 const open=async()=>{await act(async()=>{document.querySelector('.article-image-trigger').dispatchEvent(new win.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));});await f.settle();};
 const select=async text=>{await act(async()=>{Array.from(document.querySelectorAll('[role="menuitem"]')).find(item=>item.textContent===text).click();});await f.settle();};
 const input=async(el,value)=>{await act(async()=>{Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new win.Event('input',{bubbles:true}));});};
 const choose=async file=>{await act(async()=>{const el=document.querySelector('input[type=file]');Object.defineProperty(el,'files',{value:[file],configurable:true});el.dispatchEvent(new win.Event('change',{bubbles:true}));});};
 try{
  await act(async()=>root.render(React.createElement(ArticleImageMenu,props)));await open();await select('从媒体库选择');assert.deepEqual(inserted,['library']);
  await open();await select('插入链接');assert.equal(document.activeElement,document.querySelector('.article-image-dialog input'));
  const fields=document.querySelectorAll('.article-image-dialog input');await input(fields[0],'javascript:alert(1)');await act(async()=>document.querySelector('.article-image-dialog form').dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true})));assert.match(document.querySelector('[role=alert]').textContent,/有效的图片地址/);assert.equal(inserted.length,1);
  await input(fields[0],'/api/uploads/picture.png');await input(fields[1],' picture alt ');await act(async()=>document.querySelector('.article-image-dialog form').dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true})));await f.settle();assert.deepEqual(inserted.at(-1),{url:'/api/uploads/picture.png',alt:'picture alt'});assert.equal(document.querySelector('[role=dialog]'),null);assert.equal(document.activeElement,document.getElementById('body'));
  await choose(new win.File([new Uint8Array(5*1024*1024+1)],'big.png',{type:'image/png'}));assert.match(errors.at(-1),/5 MB/);assert.equal(busy.includes(true),false);
  await choose(new win.File(['pixels'],'small.png',{type:'image/png'}));assert.equal(busy.at(-1),true);assert(document.querySelector('.article-image-trigger').disabled);
  await act(async()=>finish('/api/uploads/uploaded.png'));assert.deepEqual(inserted.at(-1),{url:'/api/uploads/uploaded.png',alt:''});assert.equal(busy.at(-1),false);
  await choose(new win.File(['pixels'],'failure.png',{type:'image/png'}));await act(async()=>fail(Error('模拟上传失败')));await f.settle();assert.equal(errors.at(-1),'模拟上传失败');assert.equal(busy.at(-1),false);assert.equal(document.activeElement,document.querySelector('.article-image-trigger'));assert.equal(document.querySelector('.article-image-trigger').disabled,false);
  await open();await select('插入链接');await act(async()=>Array.from(document.querySelectorAll('.article-image-dialog button')).find(button=>button.textContent==='取消').click());await f.settle();assert.equal(document.activeElement,document.querySelector('.article-image-trigger'));
  await choose(new win.File(['pixels'],'later.png',{type:'image/png'}));const before=inserted.length;await act(async()=>root.unmount());await act(async()=>finish('/api/uploads/late.png'));assert.equal(inserted.length,before);assert.equal(busy.at(-1),false);
 }finally{await f.close();}
});


test('writing image trigger opens a phone Sheet and restores focus without changing shared desktop presentation',async()=>{
 const f=environment(),{React,act,root,win}=f;
 const utils={'./utils':{cn:(...values)=>values.filter(Boolean).join(' ')}},dropdown=load('src/app/components/ui/dropdown-menu.tsx',utils),dialog=load('src/app/components/ui/dialog.tsx',utils),sheet=load('src/app/components/ui/sheet.tsx',utils);
 const {ArticleImageMenu}=load('src/app/components/admin/ArticleImageMenu.tsx',{'../ui/dropdown-menu':dropdown,'../ui/dialog':dialog,'../ui/sheet':sheet,'@/hooks/use-is-breakpoint':{useIsBreakpoint:()=>true},'./AdminButton':{AdminButton:React.forwardRef(({variant,...props},ref)=>React.createElement('button',{...props,ref}))},'../../lib/safeUrl':load('src/app/lib/safeUrl.ts')});
 let libraries=0;
 const props={compact:true,disabled:false,onMediaLibrary:()=>libraries++,uploadImage:async()=>'',onInsert:()=>{},onError:()=>{},onBusy:()=>{}};
 const open=async()=>{await act(async()=>document.querySelector('.article-image-trigger').click());await f.settle();};
 const escape=async()=>{await act(async()=>document.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));await f.settle();};
 try{
  await act(async()=>root.render(React.createElement(ArticleImageMenu,props)));const trigger=document.querySelector('.article-image-trigger');assert.equal(trigger.tagName,'BUTTON');assert.equal(trigger.getAttribute('aria-label'),'插入图片');assert.equal(trigger.textContent,'');assert.equal(trigger.querySelectorAll('svg').length,1);assert.equal(trigger.querySelector('svg').getAttribute('width'),'22');assert.equal(trigger.querySelector('svg').getAttribute('stroke-width'),'1.8');
  await open();const panel=document.querySelector('.article-image-sheet');assert(panel);assert(panel.contains(document.activeElement));assert.deepEqual([...panel.querySelectorAll('.article-image-sheet-actions button')].map(button=>button.textContent),['从媒体库选择','上传图片','插入链接']);await escape();assert.equal(document.querySelector('.article-image-sheet'),null);assert.equal(document.activeElement,trigger);
  await open();await act(async()=>[...document.querySelectorAll('.article-image-sheet-actions button')].find(button=>button.textContent==='插入链接').click());await f.settle();assert.equal(document.querySelector('.article-image-sheet'),null);assert(document.querySelector('.article-image-dialog input')===document.activeElement);await escape();assert.equal(document.activeElement,trigger);
  await open();await act(async()=>[...document.querySelectorAll('.article-image-sheet-actions button')].find(button=>button.textContent==='从媒体库选择').click());await f.settle();assert.equal(libraries,1);assert.equal(document.querySelector('.article-image-sheet'),null);
  await act(async()=>root.render(React.createElement(ArticleImageMenu,{...props,compact:false})));const sharedTrigger=document.querySelector('.article-image-trigger');assert.match(sharedTrigger.textContent,/图片/);assert.equal(sharedTrigger.getAttribute('aria-haspopup'),'menu');assert.equal(sharedTrigger.getAttribute('aria-label'),null);
 }finally{await f.close();}
});
