const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const moduleValue={exports:{}};
const code=ts.transpileModule(fs.readFileSync('src/app/lib/imageMotion.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
new Function('module','exports','require',code)(moduleValue,moduleValue.exports,name=>name==='motion/mini'?{}:name==='./motionPreference'?{}:name==='./motionDesign'?{}:require(name));
const {anchoredImageZoom,imageBounds,imageClamp,imageResistance,readImageIntrinsicWidth,visibleImageSource}=moduleValue.exports;
const fit={width:600,height:400,viewportWidth:800,viewportHeight:600,maxScale:3};
test('intrinsic measurement restores constraints, including when layout fails',()=>{
 const style={maxWidth:'50%',maxHeight:'300px'};
 const image={style,naturalWidth:835,getBoundingClientRect(){assert.equal(style.maxWidth,'none');assert.equal(style.maxHeight,'none');this.naturalWidth=2000;return{};}};
 assert.equal(readImageIntrinsicWidth(image),2000);
 assert.deepEqual(style,{maxWidth:'50%',maxHeight:'300px'});
 assert.throws(()=>readImageIntrinsicWidth({...image,getBoundingClientRect(){throw Error('unavailable layout');}}));
 assert.deepEqual(style,{maxWidth:'50%',maxHeight:'300px'});
});
test('image zoom keeps the inspected point fixed until a real boundary clamps it',()=>{
 const pose={x:0,y:0,scale:1},point={x:80,y:30},next=anchoredImageZoom(fit,pose,2,point);
 assert.deepEqual(next,{x:-80,y:-30,scale:2});
 assert.equal((point.x-next.x)/next.scale,(point.x-pose.x)/pose.scale);
 assert.equal((point.y-next.y)/next.scale,(point.y-pose.y)/pose.scale);
 assert.deepEqual(anchoredImageZoom(fit,next,1,point),pose);
 assert.equal(anchoredImageZoom(fit,next,10,point).scale,3);
});
test('direct pan has no damping inside bounds and bounded resistance outside',()=>{
 assert.deepEqual(imageBounds(fit,2),{x:200,y:100});
 for(const value of [-200,-90,0,90,200])assert.equal(imageResistance(value,200),value);
 const beyond=imageResistance(500,200);assert(beyond>200&&beyond<226);
 assert.equal(imageResistance(-500,200),-beyond);
 assert.equal(imageClamp(beyond,200),200);
});
test('source return rejects missing, detached and offscreen images in both axes',()=>{
 const previous={innerWidth:global.innerWidth,innerHeight:global.innerHeight,document:global.document};
 global.innerWidth=800;global.innerHeight=600;global.document={body:{}};
 const source=rect=>({isConnected:true,complete:true,naturalWidth:1200,parentElement:null,getBoundingClientRect:()=>({width:200,height:100,...rect})});
 try{
  assert.equal(visibleImageSource(null),false);
  assert.equal(visibleImageSource(source({left:50,right:250,top:50,bottom:150})),true);
  assert.equal(visibleImageSource(source({left:50,right:250,top:-600,bottom:1800,height:2400})),true,'a tall but visibly anchored article image can return spatially');
  assert.equal(visibleImageSource(source({left:1000,right:1200,top:1000,bottom:1100})),false);
  assert.equal(visibleImageSource({...source({}),isConnected:false}),false);
 }finally{for(const [name,value]of Object.entries(previous))value===undefined?delete global[name]:global[name]=value;}
});
