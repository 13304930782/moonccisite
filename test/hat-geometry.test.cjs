const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync('src/app/components/Halloween/geometry.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const loaded={};new Function('exports',code)(loaded);
test('hat camera keeps all faces finite, sorted and clipped to the correct head layer',()=>{
 for(let pitch=-.6;pitch<=.4;pitch+=.05)for(let yaw=-.4;yaw<=.4;yaw+=.05){
  const faces=loaded.hatGeometry(pitch,yaw);
  assert.ok(faces.length>40);
  assert.ok(faces.filter(f=>f.r).length<=128);
  assert.ok(faces.filter(f=>!f.r).length<=128);
  faces.forEach((face,i)=>{
   assert.ok(!/NaN|Infinity/.test(face.d));
   assert.ok(face.r?face.z<=0:face.z>=0);
   if(i)assert.ok(face.z>=faces[i-1].z);
  });
 }
});
test('the camera rotates band and buckle as well as the purple crown',()=>{
 const a=loaded.hatGeometry(0,0),b=loaded.hatGeometry(-.55,.3);
 for(const color of ['gold','orange','purple'])assert.notDeepEqual(a.filter(f=>f.c===color).map(f=>f.d),b.filter(f=>f.c===color).map(f=>f.d));
});

test('neutral camera preserves the frontal buckle without a built-in tilt',()=>{
 const gold=loaded.hatGeometry(0,0).filter(f=>f.c==='gold');
 assert.equal(gold.length,1);
 const coordinates=gold[0].d.match(/-?\d+(?:\.\d+)?/g).map(Number);
 assert.deepEqual(coordinates.filter((_,i)=>i%2),[-8,-8,17,17]);
});

test('front brim keeps vertices exactly on the head depth plane',()=>{
 assert.ok(loaded.hatGeometry(0,0).some(f=>!f.r && f.c==='purple' && f.d.includes('177.00 20.00')));
});

test('hat opening retains its width throughout a complete turn instead of pivoting as a flattened ellipse',()=>{
 const widths=[];
 for(let yaw=0;yaw<Math.PI*2;yaw+=Math.PI/40){
  const x=loaded.hatGeometry(0,yaw).filter(f=>f.c==='orange').flatMap(f=>f.d.match(/-?\d+(?:\.\d+)?/g).map(Number).filter((_,i)=>i%2===0));
  widths.push(Math.max(...x)-Math.min(...x));
 }
 assert.ok(Math.min(...widths)>124, 'hat opening must remain fitted to the spherical head at side and rear angles');
 assert.ok(Math.max(...widths)-Math.min(...widths)<2, 'allow only the twenty-segment circle approximation');
});
