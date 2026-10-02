const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync('src/app/lib/revisionDiff.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const mod={exports:{}};new Function('exports','module',code)(mod.exports,mod);const {revisionDiff}=mod.exports;
test('diff can reconstruct both source texts including blank, repeated and long lines',()=>{
 const cases=[['',''],['alpha\nend','alpha\ninserted\nend'],['a\na\nb\n','a\nb\n'],['<script>alert(1)</script>','纯文本\n'],['start\n'+Array(30000).fill('a').join('\n'),'start\n'+Array(30000).fill('b').join('\n')]];
 let seed=11;const rand=()=>{seed=(seed*16807)%2147483647;return seed%8;};
 for(let i=0;i<80;i++)cases.push([Array.from({length:60},()=>String(rand())).join('\n'),Array.from({length:55},()=>String(rand())).join('\n')]);
 for(const [a,b] of cases){const d=revisionDiff(a,b);assert.equal(d.filter(l=>l.kind!=='added').map(l=>l.text).join('\n'),a);assert.equal(d.filter(l=>l.kind!=='removed').map(l=>l.text).join('\n'),b);}
});
