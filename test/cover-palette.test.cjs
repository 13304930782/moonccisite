const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs');
const mod={exports:{}};
new Function('exports','module',ts.transpileModule(fs.readFileSync('src/app/lib/coverPalette.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(mod.exports,mod);
const {edgeColor,bandGradient,loadCoverGradient}=mod.exports;
test('palette uses only the outer two rings, not a bright center',()=>{
 const data=new Uint8ClampedArray(32*32*4);
 for(let y=0;y<32;y++)for(let x=0;x<32;x++){const p=(y*32+x)*4;data.set(x>1&&x<30&&y>1&&y<30?[255,255,255,255]:[30,40,50,255],p);}
 assert.deepEqual(edgeColor(data),[30,40,50]);assert.equal(edgeColor(new Uint8ClampedArray(32*32*4)),null);assert.equal(edgeColor(new Uint8ClampedArray(4)),null);
});
test('white, black and saturated covers stay within the specified saturation and lightness limits',()=>{
 for(const rgb of [[255,255,255],[0,0,0],[255,0,0],[0,255,0],[0,0,255],[255,255,0]]){
  const gradient=bandGradient(rgb),colors=[...gradient.matchAll(/hsl\((\d+) ([\d.]+)% ([\d.]+)%\)/g)];
  assert.equal(colors.length,2);assert.ok(Number(colors[0][2])<=40);assert.ok(Number(colors[1][3])>=8&&Number(colors[1][3])<=28);assert.ok(Math.abs(Number(colors[0][3])-Number(colors[1][3])-7)<.01);
 }
});
test('CORS, canvas failures and cancelled loads keep the fallback without applying stale colors',()=>{
 const OriginalImage=global.Image,originalDocument=global.document;let image,applied=0;
 global.Image=class{constructor(){image=this;}};
 global.document={createElement:()=>({getContext:()=>({drawImage(){throw Error('tainted')},getImageData(){throw Error('not reached')}})})};
 try{
  const dispose=loadCoverGradient('/cover.png',()=>applied++);assert.equal(image.crossOrigin,'anonymous');image.onload();assert.equal(applied,0);
  const pending=image.onload;dispose();assert.equal(image.onload,null);pending();assert.equal(applied,0);
 }finally{global.Image=OriginalImage;global.document=originalDocument;}
});
