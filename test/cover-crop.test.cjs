const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function load(file,requireModule=require){const mod={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('exports','module','require',code)(mod.exports,mod,requireModule);return mod.exports;}
const crop=load('src/app/lib/coverCrop.ts');
const {normalizeCoverCrop,normalizeCoverFrame,coverFrame,effectiveCoverFrame,coverGeometry,panCoverFrame,coverFrameStyle}=crop;
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} differs from ${expected}`);

test('legacy defaults retain centered cards and top-aligned detail, independently',()=>{
  assert.equal(normalizeCoverCrop(null),null);assert.equal(normalizeCoverCrop({card:null,detail:null}),null);
  assert.deepEqual(effectiveCoverFrame(null,'card'),{x:.5,y:.5,zoom:1});assert.deepEqual(effectiveCoverFrame(null,'detail'),{x:.5,y:0,zoom:1});
  const value={card:{x:.1,y:.8,zoom:2},detail:null};assert.deepEqual(coverFrame(value,'card'),value.card);assert.equal(coverFrame(value,'detail'),null);
  assert.equal(coverFrameStyle(null),undefined);assert.equal(crop.describeCoverCrop(null),'默认取景');
});

test('malformed frames are rejected and finite numeric positions are bounded',()=>{
  for(const value of [undefined,[],{},'bad',{x:'0',y:0,zoom:1},{x:NaN,y:0,zoom:1},{x:0,y:Infinity,zoom:1}])assert.equal(normalizeCoverFrame(value),null);
  assert.deepEqual(normalizeCoverFrame({x:-2,y:8,zoom:9}),{x:0,y:1,zoom:3});assert.deepEqual(normalizeCoverFrame({x:0,y:0,zoom:0}),{x:0,y:0,zoom:1});
  const original={card:{x:.1,y:.2,zoom:1.5},detail:{x:.9,y:.8,zoom:2}};const normalized=normalizeCoverCrop(original);normalized.card.x=1;assert.equal(original.card.x,.1);assert.equal(normalized.detail.x,.9);
});

test('portrait, panoramic and square images cover every viewport at all allowed edges',()=>{
  for(const image of [{width:400,height:1200},{width:2400,height:300},{width:500,height:500}])for(const viewport of [{width:180,height:112.5},{width:1000,height:400},{width:343,height:240}])for(const x of [0,.25,.5,1])for(const y of [0,.5,1])for(const zoom of [1,1.5,3]){
    const geometry=coverGeometry(image,viewport,{x,y,zoom});assert.ok(geometry);
    assert.ok(geometry.left<=1e-7 && geometry.top<=1e-7);assert.ok(geometry.left+geometry.width>=viewport.width-1e-7);assert.ok(geometry.top+geometry.height>=viewport.height-1e-7);
  }
  assert.equal(coverGeometry({width:0,height:500},{width:100,height:100},{x:.5,y:.5,zoom:1}),null);
});

test('pointer movement maps to pixels, clamps at edges and preserves axes with no travel',()=>{
  const image={width:1200,height:800},viewport={width:400,height:250},frame={x:.5,y:.5,zoom:2};
  const before=coverGeometry(image,viewport,frame),moved=panCoverFrame(frame,image,viewport,30,-25),after=coverGeometry(image,viewport,moved);near(after.left-before.left,30);near(after.top-before.top,-25);
  assert.deepEqual(panCoverFrame(frame,image,viewport,1e8,-1e8),{x:0,y:1,zoom:2});
  assert.deepEqual(panCoverFrame({x:.2,y:.8,zoom:1},{width:1600,height:1000},{width:160,height:100},40,-40),{x:.2,y:.8,zoom:1});
});

test('server CSS uses the same object position and scale origin as drag geometry',()=>{
  for(const image of [{width:320,height:960},{width:2400,height:300}])for(const viewport of [{width:180,height:112.5},{width:1000,height:400},{width:343,height:240}])for(const frame of [{x:.1,y:.9,zoom:1},{x:.7,y:.2,zoom:2.4}]){
    const css=coverFrameStyle(frame),base=coverGeometry(image,viewport,{...frame,zoom:1}),geometry=coverGeometry(image,viewport,frame);
    const x=parseFloat(css['--cover-x'])/100,y=parseFloat(css['--cover-y'])/100,z=css['--cover-zoom'];
    near(z*base.left-(z-1)*viewport.width*x,geometry.left);near(z*base.top-(z-1)*viewport.height*y,geometry.top);
  }
  const {CoverImage}=load('src/app/components/CoverImage.tsx',name=>name==='../lib/coverCrop'?crop:name.endsWith('.css')?{}:require(name));
  const old=renderToStaticMarkup(React.createElement(CoverImage,{src:'/old.png',alt:'旧封面',className:'content-image',frame:null}));assert.match(old,/class="content-image"/);assert.doesNotMatch(old,/style=|cover-image--framed/);
  const framed=renderToStaticMarkup(React.createElement(CoverImage,{src:'/new.png',alt:'封面',className:'content-image',frame:{x:.25,y:.75,zoom:2},width:800,height:500}));assert.match(framed,/content-image cover-image--framed/);assert.match(framed,/--cover-x:25%;--cover-y:75%;--cover-zoom:2/);assert.match(framed,/width="800" height="500"/);
  const css=fs.readFileSync('src/styles/cover-framing.css','utf8');assert.match(css,/object-position:var\(--cover-x\) var\(--cover-y\)/);assert.match(css,/transform-origin:var\(--cover-x\) var\(--cover-y\)/);
});
