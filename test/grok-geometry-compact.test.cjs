const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

test('build compression preserves every Grok expression coordinate',async()=>{
 const {compactGrokGeometry}=await import('../scripts/compact-grok-geometry.mjs');
 const source=fs.readFileSync('src/vendor/grok-ball/grok-ball.js','utf8');
 const transformed=compactGrokGeometry(source);
 function rings(code){const start=code.indexOf('window.EB_RINGS = '),end=code.indexOf('\n};',start)+3;const context={window:{},atob:encoded=>Buffer.from(encoded,'base64').toString('latin1')};vm.runInNewContext(code.slice(start,end),context);return JSON.stringify(context.window.EB_RINGS);}
 assert.equal(rings(transformed),rings(source));
 assert.ok(transformed.length<source.length-20000);
 assert.throws(()=>compactGrokGeometry('window.EB_RINGS = {};'));
});
