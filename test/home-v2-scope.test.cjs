const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const postcss=require('postcss');
const ts=require('typescript');

const file='src/styles/home-v2.css';
const palettes={
 '.home-v2':{
  '--home-tag-update-bg':'#eeedfe','--home-tag-update-text':'#534ab7',
  '--home-tag-release-bg':'#faeeda','--home-tag-release-text':'#854f0b',
 },
 '.home-v2:is(.dark *)':{
  '--home-tag-update-bg':'rgba(175,169,236,.16)','--home-tag-update-text':'#c7c2f5',
  '--home-tag-release-bg':'rgba(250,199,117,.16)','--home-tag-release-text':'#fac775',
 },
};
const normalize=value=>value.replace(/\s+/g,'').toLowerCase();
const paint=/^(?:color|background(?:-color)?|(?:border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?|outline)(?:-color)?|box-shadow|text-shadow|fill|stroke|text-decoration-color|caret-color|accent-color)$/;
const paintWords=new Set('none solid dashed dotted double hidden groove ridge inset outset transparent currentcolor inherit initial unset revert revert-layer color-mix in srgb srgb-linear oklab oklch lab lch hsl hwb xyz xyz-d50 xyz-d65 longer shorter increasing decreasing hue calc min max clamp linear-gradient radial-gradient conic-gradient repeating-linear-gradient repeating-radial-gradient repeating-conic-gradient to top right bottom left center circle ellipse closest-side closest-corner farthest-side farthest-corner at from deg turn rad px rem em vw vh svh dvh'.split(' '));

function assertScope(source){
 const css=postcss.parse(source);
 css.walkAtRules(rule=>{
  if(rule.name==='font-face'){
   assert.equal(rule.params,'');
   assert.equal(rule.nodes.length,5);
   const declarations={};
   for(const node of rule.nodes){assert.equal(node.type,'decl');assert.equal(Object.hasOwn(declarations,node.prop),false);declarations[node.prop]=node.value;}
   assert.deepEqual(declarations,{
    'font-family': "'JetBrains Mono Hero'",
    src: "url('../assets/fonts/JetBrainsMono-Bold.woff2') format('woff2')",
    'font-weight':'700','font-style':'normal','font-display':'swap',
   });
  }else assert.ok(['media','supports','container'].includes(rule.name),`Global at-rule: @${rule.name}`);
 });
 css.walkRules(rule=>{
  for(const selector of postcss.list.comma(rule.selector)){
   assert.doesNotMatch(selector,/:root\b/,selector);
   assert.match(selector,/^\.home-v2(?=[\s:.#>[\]]|$)/,`Unscoped selector: ${selector}`);
   assert.doesNotMatch(selector,/^\.home-v2(?:\:[\w-]+(?:\([^)]*\))?)*\s*[+~]/,`Selector escapes the homepage: ${selector}`);
  }
 });
 css.walkDecls(decl=>{
  const where=`${decl.source.start.line}: ${decl.toString()}`;
  assert.equal(Boolean(decl.important),false,where);
  if(decl.prop.startsWith('--')){
   assert.match(decl.prop,/^--home-[\w-]+$/,where);
   assert.ok(Object.hasOwn(palettes,decl.parent.selector),`Variables belong on the homepage root: ${where}`);
  }
  const palette=palettes[decl.parent.selector];
  if(palette&&Object.hasOwn(palette,decl.prop)){
   assert.equal(normalize(decl.value),normalize(palette[decl.prop]),where);
   return;
  }
  assert.doesNotMatch(decl.value,/#(?:[\da-f]{3,8})\b|\b(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)\s*\(/i,`Only activity type tokens introduce colors: ${where}`);
  if(paint.test(decl.prop)||decl.prop.startsWith('--home-')){
   const value=decl.value.replace(/var\(\s*--[\w-]+\s*\)/g,'');
   for(const word of value.match(/[a-z][a-z-]*/gi)||[])assert.ok(paintWords.has(word.toLowerCase()),`Use existing color variables: ${where} (${word})`);
  }
 });
 return css;
}

test('homepage stylesheet is opt-in, including media rules, dark mode and local variables',()=>{
 const css=assertScope(fs.readFileSync(file,'utf8'));
 for(const [selector,palette] of Object.entries(palettes)){
  const values={};
  css.walkRules(selector,rule=>rule.walkDecls(decl=>{values[decl.prop]=normalize(decl.value);}));
  for(const [name,value] of Object.entries(palette))assert.equal(values[name],normalize(value),`${selector} ${name}`);
 }
});

test('scope guard rejects leaked selectors, shared tokens and hard-coded neutral colors',()=>{
 for(const source of [
  '.home-v2, body {color:var(--foreground)}',
  '.home-v2 + .other-page {color:var(--foreground)}',
  '@media(max-width:760px){.dark .home-v2{color:var(--foreground)}}',
  ':root{--home-fill:var(--muted)}',
  '.home-v2{--background:var(--muted)}',
  '.home-v2 .child{--home-fill:var(--muted)}',
  '.home-v2{color:#666}',
  '.home-v2{background:color-mix(in srgb,var(--background),white)}',
  '.home-v2{--home-fill:gray}',
  '.home-v2{border:1px solid rgb(0 0 0 / .1)}',
  '@import "./theme.css";',
  "@font-face{font-family:'Global';src:url(https://example.com/font.woff2)}",
 ])assert.throws(()=>assertScope(source),source);
 assert.doesNotThrow(()=>assertScope('.home-v2{--home-fill:color-mix(in srgb,var(--foreground) 4%,var(--background));color:var(--foreground);border:1px solid var(--border)}@media(max-width:760px){.home-v2 .child{background:var(--home-fill)}}'));
});

test('the local licensed Bold face is only applied to the homepage headline',()=>{
 const css=assertScope(fs.readFileSync(file,'utf8'));
 let faces=0,uses=0;
 css.walkAtRules('font-face',()=>faces++);
 css.walkDecls('font-family',decl=>{
  if(decl.parent.type==='atrule')return;
  assert.equal(decl.parent.selector,'.home-v2 .home-hero h1');
  assert.match(decl.value,/^'JetBrains Mono Hero',/);
  uses++;
 });
 assert.equal(faces,1);assert.equal(uses,1);
 assert.equal(fs.readFileSync('src/assets/fonts/JetBrainsMono-Bold.woff2').subarray(0,4).toString(),'wOF2');
 assert.match(fs.readFileSync('src/assets/fonts/JetBrainsMono-OFL.txt','utf8'),/SIL OPEN FONT LICENSE/);
 assert.equal(fs.readFileSync('public/licenses/JetBrainsMono-OFL.txt','utf8'),fs.readFileSync('src/assets/fonts/JetBrainsMono-OFL.txt','utf8'));
});

test('only HomePage imports the new stylesheet, with no replacement global stylesheet',()=>{
 for(const name of fs.readdirSync('src/app/pages').filter(name=>name.endsWith('.tsx'))){
  const path='src/app/pages/'+name;
  const parsed=ts.createSourceFile(path,fs.readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const imports=parsed.statements.filter(ts.isImportDeclaration).map(node=>node.moduleSpecifier.text).filter(value=>value.endsWith('.css'));
  if(name==='HomePage.tsx')assert.deepEqual(imports,['../../styles/home-v2.css']);
  else assert.equal(imports.some(value=>value.endsWith('/home-v2.css')),false,path);
 }
});

test('shared shell, content components and theme retain pinned Git blobs (approved press-motion removal, updates navigation label, Early Access destination and article label style import)',()=>{
 // Canonical LF blobs work on Windows and in shallow CI without historical commits.
 const pins={
  'src/styles/theme.css':'b9fda97bdfd03ede21c72edb3d1d0c1c0a5da68a',
  'src/styles/globals.css':'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391',
  'src/styles/editorial.css':'9f8cedc46f1d2bb7310e77a7934ae122e456215a',
  'src/styles/project-card.css':'08306a6737ea3bbf30b5792d54fe0c43a12421b7',
  'src/app/components/Header.tsx':'0206f665b196f3698fa72f90aeed342d2db16fe1',
  'src/app/components/SiteFooter.tsx':'85bdf27069f292558f00aee14711f76254ea4add',
  'src/app/components/ContentUI.tsx':'f15932bb689b2f7190b97b2e3a6713d206287476',
  'src/app/components/BlogCard.tsx':'4d3d878a28ab56a42b16aa3b073118174840601c',
  'src/app/components/ProjectCard.tsx':'623c271e352de63b85cf74ac060da22d8684fbc8',
  'src/app/context/ThemeContext.tsx':'7a26de5852af1986d6dff091ac80336786633488',
 };
 for(const [path,pin] of Object.entries(pins)){
  let source=fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
  // The only approved shared presentation change is the source-return entry.
  if(path==='src/app/components/ContentUI.tsx')source=source.replace("import { SiteBack } from './SiteBack';\n",'').replace('      <SiteBack />\n','');
  // The approved domain migration changes only the status link and badge origin.
  if(path==='src/app/components/SiteFooter.tsx'){
   assert.equal((source.match(/status\.moooncci\.cn/g)||[]).length,2);
   source=source.replaceAll('status.moooncci.cn','status.mooncci.site');
  }
  const bytes=Buffer.from(source);
  assert.equal(crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),pin,path);
 }
});
