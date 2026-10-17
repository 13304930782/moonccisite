const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const postcss=require('postcss');

test('note server render uses production-allowed resources and actual activity excerpts',()=>{
  const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
  const {isPublicResource}=require('../server/src/lib/publicDocument');
  const requested=[];
  const item={id:901,content:'当前近况',published_at:'2026-10-16T08:30:00Z'};
  const entries=[{id:901,excerpt:'当前近况'},{id:902,excerpt:'更多近况第一条'},{id:903,excerpt:'更多近况第二条'}].map(entry=>({...entry,published_at:item.published_at}));
  const module={exports:{}};
  const code=ts.transpileModule(fs.readFileSync('src/app/pages/NoteDetailPage.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
  const mock=name=>name==='react'?React:name==='react/jsx-runtime'?require(name):
    name==='react-router-dom'?{useParams:()=>({id:'901'}),Link:({to,children,...props})=>React.createElement('a',{href:to,...props},children)}:
    name.endsWith('/ContentUI')?{SitePage:({children,...props})=>React.createElement('main',props,children),ResourceState:({children})=>children,formatDate:value=>value,useResource:path=>{requested.push(path);assert.ok(isPublicResource(path),'Production SSR rejects '+path);return {data:path==='/updates/901'?item:{items:entries}};}}:
    name.endsWith('/RoutePosition')?{usePreviousSiteVisit:()=>null}:
    name.endsWith('/SiteSettingsContext')?{useSiteSettings:()=>({data:{brand:{site_title:'mooncci'}}})}:
    name.endsWith('/safeUrl')?{safeImageSrc:()=>''}:
    name.endsWith('/CommentSection')?{CommentSection:()=>null}:{};
  new Function('exports','require',code)(module.exports,mock);
  const html=renderToStaticMarkup(React.createElement(module.exports.default));
  assert.deepEqual(requested,['/updates/901','/activity?type=update&pageSize=3']);
  assert.match(html,/更多近况第一条/);assert.match(html,/更多近况第二条/);
  assert.ok(!html.includes('href="/updates/901"'),'Current note must not recommend itself');
  assert.match(html,/href="\/updates\/902"/);
});

test('note styles stay scoped and motion has a reduced-motion fallback',()=>{
  const sheet=postcss.parse(fs.readFileSync('src/styles/note-v2.css','utf8'));
  sheet.walkRules(rule=>{
    if(rule.parent.type==='atrule' && rule.parent.name==='keyframes') return;
    assert.ok(!rule.selector.includes(':root'));
    for(const selector of rule.selectors) assert.match(selector.trim(),/^\.note-v2(?:\s|$|[.:])/);
  });
  sheet.walkDecls(declaration=>{
    assert.ok(!/#[0-9a-f]{3,8}\b/i.test(declaration.value),'use theme variables, not fixed colors');
    if(!/^(animation|transition)/.test(declaration.prop) || declaration.value==='none')return;
    let node=declaration.parent;
    while(node && !(node.type==='atrule' && node.name==='media' && node.params.includes('prefers-reduced-motion:no-preference')))node=node.parent;
    assert.ok(node,'motion must be restricted to no-preference');
  });
  sheet.walkAtRules('keyframes',keyframes=>keyframes.walkDecls(declaration=>assert.ok(['opacity','transform'].includes(declaration.prop))));
});

test('note summaries and relative dates handle Markdown and calendar days',()=>{
  const source=fs.readFileSync('src/app/pages/NoteDetailPage.tsx','utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  new Function('exports','require',code)(module.exports,()=>({}));
  const {noteText,relativeNoteDate}=module.exports;
  assert.equal(noteText('## 一个标题\n\n[链接](https://example.com) **正文**\n```js\na()\n```'),'一个标题 链接 正文');
  const now=new Date(2026,9,17,12).getTime();
  assert.equal(relativeNoteDate(new Date(2026,9,17,0).toISOString(),now),'今天');
  assert.equal(relativeNoteDate(new Date(2026,9,16,23).toISOString(),now),'昨天');
  assert.equal(relativeNoteDate('bad-date',now),'');
  const originalTimezone=process.env.TZ;
  try {
    for(const timezone of ['Asia/Shanghai','America/Los_Angeles','UTC']) {
      process.env.TZ=timezone;
      assert.equal(relativeNoteDate('2026-10-17T01:00:00Z',Date.parse('2026-10-17T09:00:00Z')),'今天');
      assert.equal(relativeNoteDate('2026-10-16T15:00:00Z',Date.parse('2026-10-17T09:00:00Z')),'昨天');
    }
  } finally { if(originalTimezone===undefined)delete process.env.TZ;else process.env.TZ=originalTimezone; }
});
