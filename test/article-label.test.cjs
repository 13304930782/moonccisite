const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const postcss=require('postcss');
const {JSDOM}=require('jsdom');
const read=path=>fs.readFileSync(path,'utf8');
const css=postcss.parse(read('src/styles/article-label.css'));
const declarations=rule=>Object.fromEntries(rule.nodes.map(node=>[node.prop,node.value.replace(/\s+/g,'').toLowerCase()]));

test('article label palette has only explicit component scopes and shared light/dark colors',()=>{
 assert.equal(css.nodes.length,3);
 const [light,dark,label]=css.nodes;
 assert.deepEqual(light.selectors,['.home-v2','.updates-v2','.blog-card']);
 assert.deepEqual(dark.selectors,light.selectors.map(selector=>selector+':where(.dark *)'));
 assert.deepEqual(declarations(light),{'--article-label-bg':'rgba(15,110,86,.10)','--article-label-fg':'#0f6e56'});
 assert.deepEqual(declarations(dark),{'--article-label-bg':'rgba(79,195,161,.16)','--article-label-fg':'#7fd8bd'});
 assert.equal(label.selector,'.blog-card > small:not(:empty)');
 assert.equal(declarations(label).background,'var(--article-label-bg)');
 assert.equal(declarations(label).color,'var(--article-label-fg)');
 css.walkDecls(decl=>assert.equal(Boolean(decl.important),false));
});

test('article label paint excludes card dates, empty labels and unrelated tags',()=>{
 const dom=new JSDOM('<article class="blog-card"><small id="category">开发</small><small></small><div class="inline-actions"><small id="date">2026/10/18</small><small id="time">3 分钟</small></div></article><small class="tag" id="ordinary">普通标签</small><span class="updates-badge" data-type="update">近况</span>');
 try{assert.deepEqual([...dom.window.document.querySelectorAll(css.nodes[2].selector)].map(el=>el.id),['category']);}
 finally{dom.window.close();}
});

test('homepage and updates article badges consume the same palette without changing other types',()=>{
 for(const [path,selector]of[
  ['src/styles/home-v2.css',".home-v2 .home-activity-label[data-type='post']"],
  ['src/styles/updates-v2.css','.updates-v2 .updates-badge[data-type="post"]'],
 ]){
  const sheet=postcss.parse(read(path));let matches=0;
  sheet.walkRules(selector,rule=>{matches++;assert.equal(declarations(rule).background,'var(--article-label-bg)');assert.equal(declarations(rule).color,'var(--article-label-fg)');});
  assert.equal(matches,1);
  sheet.walkRules(rule=>{if(/data-type=['"](?:update|release)['"]/.test(rule.selector))rule.walkDecls(decl=>assert.doesNotMatch(decl.value,/--article-label-/));});
 }
 for(const path of ['src/app/components/BlogCard.tsx','src/app/components/home/HomeActivityList.tsx','src/app/pages/UpdatesPage.tsx'])assert.match(read(path),/import ['"][^'"]*\/article-label\.css['"]/);
});
