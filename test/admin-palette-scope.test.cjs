const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const postcss=require('postcss');
const {JSDOM}=require('jsdom');
const ts=require('typescript');

const theme=postcss.parse(fs.readFileSync('src/styles/admin-ui-v2.css','utf8'));
const paletteRules=[];
theme.walkRules(rule=>{
 if(rule.nodes.some(node=>node.type==='decl'&&node.prop.startsWith('--ui-')))paletteRules.push(rule);
});
const tokens=['fill','fill-strong','sidebar','text-muted','warn-bg','warn-text','ok','brand','on-brand','text-body','media-overlay','media-overlay-fill','media-overlay-text','surface','shadow-float'].map(name=>'--ui-'+name);

test('every opt-in stylesheet selector stays inside ui-v2 without important overrides',()=>{
 theme.walkDecls(decl=>assert.equal(Boolean(decl.important),false,`${decl.source.start.line}: ${decl.toString()}`));
 theme.walkRules(rule=>{
  for(const selector of postcss.list.comma(rule.selector)) {
   assert.match(selector,/^(?:\.dark\s+)?\.ui-v2(?=[\s:.#>[+~]|$)/,`${rule.source.start.line}: ${selector}`);
  }
 });
});

test('legacy compact paint cannot override explicitly opted-in action buttons',()=>{
 const button='<button class="admin-button admin-button--solid admin-button--soft admin-button--ghost ui-btn ui-btn--solid ui-btn--danger writing-generate-summary writing-menu-danger" disabled></button>';
 const dom=new JSDOM(`<div class="admin-frame"><div class="admin-content"><div class="ui-v2 writing-workspace admin-media-page"><header class="writing-topbar">${button}</header><div class="writing-summary-actions">${button}</div><div class="media-status-tabs">${button}</div><div class="media-batch-bar">${button}</div></div></div></div><div class="admin-portal ui-v2 writing-settings-sheet writing-settings-bottom media-detail-drawer"><div class="writing-draft-actions">${button}</div></div>`);
 try {
  for(const dark of [false,true]) {
   dom.window.document.documentElement.classList.toggle('dark',dark);
   for(const file of ['admin-media.css','admin-writing.css']) {
    postcss.parse(fs.readFileSync('src/styles/'+file,'utf8')).walkRules(rule=>{
     const legacyPaint=rule.nodes.some(node=>node.type==='decl'&&['background','background-color','color'].includes(node.prop)&&(node.important||rule.selector.includes('writing-menu-danger')));
     if(legacyPaint)for(const node of dom.window.document.querySelectorAll('.ui-btn'))assert.equal(node.matches(rule.selector),false,`${file}:${rule.source.start.line} ${rule.selector}`);
    });
   }
  }
 } finally {dom.window.close();}
});

test('the palette defines exactly the UI tokens referenced by the approved admin styles and editor',()=>{
 const referenced=new Set(),declared=new Set();
 for(const file of ['admin-media.css','admin-posts.css','admin-writing.css','article-editor.css','admin-users.css','admin-publishing-queue.css','editor-applications.css','admin-banned-words.css','admin-series.css','admin-taxonomy.css']) {
  postcss.parse(fs.readFileSync('src/styles/'+file,'utf8')).walkDecls(decl=>{
   for(const match of decl.value.matchAll(/var\(\s*(--ui-[\w-]+)/g))referenced.add(match[1]);
  });
 }
 for(const rule of paletteRules)rule.walkDecls(decl=>{if(decl.prop.startsWith('--ui-'))declared.add(decl.prop);});
 assert.deepEqual([...declared].sort(),[...referenced].sort(),'Referenced UI tokens must all be scoped and defined without unused palette entries');
});

test('theme keeps the original site baseline while shell navigation remains permission scoped',()=>{
 // Canonical LF Git blobs allow Windows checkouts and shallow CI without old commit history.
 const pins={
  'src/styles/theme.css':'b9fda97bdfd03ede21c72edb3d1d0c1c0a5da68a',
 };
 for(const [file,pin] of Object.entries(pins)) {
  const bytes=Buffer.from(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'));
  assert.equal(crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),pin,file);
 }
 for(const file of ['src/styles/admin-shell.css','test/admin-shell.test.cjs'])assert.equal(fs.existsSync(file),false,file+' did not exist in PR101');
 const file='src/app/components/admin/AdminShell.tsx',source=fs.readFileSync(file,'utf8'),parsed=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const values=new Map(),icons=new Set();
 function visit(node){
  if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer)values.set(node.name.text,node.initializer.getText(parsed));
  if(ts.isPropertyAssignment(node)&&node.name.getText(parsed)==='icon'&&ts.isIdentifier(node.initializer))icons.add(node.initializer.text);
  ts.forEachChild(node,visit);
 }
 visit(parsed);
 const names=['role','owner','manager','writer','dashboard','commonItems','menuGroups'];
 const readNavigation=new Function('user','publishing','operations','t',...icons,names.map(name=>`const ${name}=${values.get(name)};`).join('')+'return {commonItems,menuGroups};');
 const navigation=(role,publishing=true,operations=true)=>readNavigation({role},publishing,operations,text=>text,...[...icons].map(()=>null));
 const paths=nav=>[...nav.commonItems,...nav.menuGroups.flatMap(group=>group.items)].map(item=>item.to);
 const ownerOnly=['/admin/mailbox','/admin/mailbox-requests','/admin/newsletter','/admin/login-settings','/admin/ai-settings','/admin/node-monitor','/admin/electricity'];
 const owner=navigation('owner'),ownerPaths=paths(owner),routes=fs.readFileSync('src/app/RoutePages.tsx','utf8');
 assert.deepEqual(owner.menuGroups.map(group=>group.id),['content','publishing','users','mail','site','system']);
 assert.equal(new Set(ownerPaths).size,ownerPaths.length,'Every destination must have one navigation entry');
 for(const path of ownerPaths)assert.ok(routes.includes(`path="${path}"`),path+' must remain an actual route');
 for(const path of ['/admin/users','/admin/editor-applications','/admin/banned-words','/admin/reviews','/admin/schedules'])assert.ok(ownerPaths.includes(path),path);
 const adminPaths=paths(navigation('admin'));
 for(const path of ownerOnly){assert.ok(ownerPaths.includes(path),path);assert.equal(adminPaths.includes(path),false,path+' must remain owner only');}
 assert.ok(adminPaths.includes('/admin/users'),'Administrators retain user management');
 assert.deepEqual(paths(navigation('editor')),['/admin','/admin/posts']);
 for(const role of ['user','teacher'])assert.deepEqual(paths(navigation(role)),['/admin/editor-apply']);
 const disabled=paths(navigation('owner',false,false));
 for(const path of ['/admin/reviews','/admin/schedules','/admin/series'])assert.equal(disabled.includes(path),false,path+' respects the publishing feature');
 assert.ok(disabled.includes('/admin'),'Disabled operations return to the existing dashboard');
});

test('only approved admin pages import the palette and opt in their roots and detached controls',()=>{
 const pages={AdminMediaPage:'admin-media-page',AdminPostsPage:'admin-posts-page',AdminWritePage:'writing-workspace',AdminTaxonomyPage:'taxonomy-page',AdminSeriesPage:'series-admin-page',AdminUsersPage:'admin-users-page',AdminUserSettingsPage:'admin-user-settings',AdminBannedWordsPage:'banned-words-page',AdminEditorApplicationsPage:'editor-applications-page',EditorApplyPage:'editor-apply-page',PublishingQueuePage:'queue-page'};
 const withPortals=new Set(['AdminMediaPage','AdminPostsPage','AdminWritePage','AdminTaxonomyPage','AdminEditorApplicationsPage','PublishingQueuePage']);
 for(const filename of fs.readdirSync('src/app/pages').filter(name=>name.endsWith('.tsx'))) {
  const file='src/app/pages/'+filename,source=fs.readFileSync(file,'utf8'),name=filename.slice(0,-4);
  const parsed=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const paletteImports=parsed.statements.filter(node=>ts.isImportDeclaration(node)&&node.moduleSpecifier.text.endsWith('/admin-ui-v2.css'));
  assert.equal(paletteImports.length,name in pages?1:0,file+' palette import');
  if(!(name in pages))continue;
  const roots=[],portals=[];
  function visit(node) {
   if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)) {
    const attribute=node.attributes.properties.find(prop=>ts.isJsxAttribute(prop)&&prop.name.text==='className');
    const classes=attribute?.initializer?.getText(parsed)||'';
    if(classes.split(/[\s"'`{}]+/).includes(pages[name]))roots.push(classes);
    if(['DialogContent','SheetContent','DropdownMenuContent'].includes(node.tagName.getText(parsed)))portals.push(classes);
   }
   ts.forEachChild(node,visit);
  }
  visit(parsed);
  assert.equal(roots.length,name==='AdminWritePage'?2:1,file+' root count');
  if(withPortals.has(name))assert.ok(portals.length,file+' detached portals');
  for(const classes of [...roots,...portals])assert.match(classes,/\bui-v2\b/,file+' '+classes);
  assert.doesNotMatch(source,/admin-shell\.css/);
 }
});

test('new palette exists only on opted-in content and detached portals in both themes',()=>{
 const dom=new JSDOM(`<div id="public"><p>公开页面</p></div><div class="admin-frame"><aside class="admin-sidebar"></aside><main class="admin-content"><input><div class="settings-section"></div></main></div><div class="admin-portal admin-user-dropdown"></div><div class="admin-portal admin-sheet"></div><main class="ui-v2 admin-media-page"></main><main class="ui-v2 admin-posts-page"></main><main class="ui-v2 writing-workspace"></main><div class="ui-v2 admin-portal media-detail-drawer"></div><div class="ui-v2 admin-portal admin-posts-import-dialog"></div><div class="ui-v2 admin-portal writing-settings-sheet"></div><div class="ui-v2 admin-portal writing-history-dialog"></div><div class="ui-v2 article-image-menu"></div><div class="ui-v2 article-image-sheet"></div><div class="ui-v2 writing-toolbar-more"></div>`);
 try {
  const doc=dom.window.document;
  assert.ok(paletteRules.length,'Palette declarations must exist');
  const values=node=>{
   const result={};
   for(const rule of paletteRules)if(node.matches(rule.selector))rule.walkDecls(decl=>{if(decl.prop.startsWith('--ui-'))result[decl.prop]=decl.value;});
   return result;
  };
  for(const dark of [false,true]) {
   doc.documentElement.classList.toggle('dark',dark);
   for(const node of doc.querySelectorAll(':not(.ui-v2)'))assert.deepEqual(values(node),{},`${dark?'dark':'light'}: ${node.outerHTML.slice(0,120)}`);
   for(const node of doc.querySelectorAll('.ui-v2')) {
    assert.deepEqual(Object.keys(values(node)).sort(),tokens.slice().sort(),node.className);
    assert.equal(values(node)['--ui-fill-strong'],`color-mix(in srgb,var(--foreground) ${dark?10:8}%,var(--background))`);
   }
  }
 } finally {dom.window.close();}
});

test('neutral palette reuses the original site colors without introducing warm gray values',()=>{
 const aliases={
  '--ui-fill':'var(--muted)',
  '--ui-text-muted':'var(--muted-foreground)',
  '--ui-text-body':'var(--foreground)',
  '--ui-on-brand':'var(--primary-foreground)',
  '--ui-surface':'var(--background)',
 };
 const base=paletteRules.find(rule=>rule.selector==='.ui-v2');
 assert.ok(base,'Palette must be an explicit opt-in');
 const values=Object.fromEntries(base.nodes.filter(node=>node.type==='decl').map(decl=>[decl.prop,decl.value]));
 for(const [name,value] of Object.entries(aliases))assert.equal(values[name],value,name);
 const editorial=postcss.parse(fs.readFileSync('src/styles/editorial.css','utf8'));
 for(const selector of [':root','.dark']) {
  const site={};
  editorial.walkRules(selector,rule=>rule.walkDecls(decl=>{site[decl.prop]=decl.value;}));
  for(const name of ['--muted','--muted-foreground','--foreground','--background','--primary-foreground']) {
   const value=site[name];assert.match(value,/^#[a-f\d]{3}(?:[a-f\d]{3})?$/i,`${selector} ${name}`);
   const hex=value.slice(1).length===3?value.slice(1).split('').map(c=>c+c).join(''):value.slice(1);
   const rgb=hex.match(/../g).map(c=>parseInt(c,16));assert.equal(rgb[0],rgb[1],`${selector} ${name}`);assert.equal(rgb[1],rgb[2],`${selector} ${name}`);
  }
 }
 for(const rule of paletteRules)rule.walkDecls(decl=>{
  if(['--ui-fill-strong','--ui-sidebar'].includes(decl.prop))assert.match(decl.value,/^color-mix\(in srgb,var\(--foreground\) \d+%,var\(--background\)\)$/);
 });
});
