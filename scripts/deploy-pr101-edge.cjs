#!/usr/bin/env node
'use strict';
// Separate reader/Nginx release. No package installation, builds, SQL, or PM2.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const REV = 'f9f9f10ae2513ec431568be2239b38b13435ac26';
const WEB = '/www/wwwroot/mooncci.site';
const NGINX = '/www/server/nginx/sbin/nginx';
const VHOST = '/www/server/panel/vhost/nginx/mooncci.site.conf';
const INC = '/www/server/panel/vhost/nginx/mooncci-blog-seo.inc';
const readerHash = '6fd07ac072f98febd8e9a896836c43334bf54f613eab420356444cb3e79b925e';
const policyHash = 'f052187a70d6bdde79f65924c57c668963c233acef360bf6df899e36d6d8f6f5';
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const read = p => fs.readFileSync(p);
let checkLog;
const output = args => cp.execFileSync(args[0], args.slice(1), {encoding:'utf8', stdio:['ignore','pipe','pipe'], timeout:120000, maxBuffer:8*1024*1024}).trim();
const headers = [
  ['X-Frame-Options', 'SAMEORIGIN'],
  ['Referrer-Policy', 'no-referrer'],
  ['Strict-Transport-Security', '"max-age=31536000; includeSubDomains"'],
  ['Content-Security-Policy', '"frame-ancestors \'self\'; object-src \'none\'; base-uri \'self\'"'],
];
function addHeaders(block) {
  const anchor = /(^[ \t]*)add_header X-Content-Type-Options "?nosniff"? always;$/m;
  const match = block.match(anchor);
  if (!match || (block.match(/add_header X-Content-Type-Options/g)||[]).length!==1) throw Error('Unexpected header anchor');
  const missing=[];
  for (const [name,value] of headers) {
    const found=[...block.matchAll(new RegExp('^[ \\t]*add_header '+name+' ([^\\n]+);$', 'gm'))];
    if (found.length && (found.length!==1 || found[0][1]!==value+' always')) throw Error('Conflicting '+name+' policy; unchanged');
    if (!found.length) missing.push(match[1]+'add_header '+name+' '+value+' always;');
  }
  return missing.length ? block.replace(anchor, '$&\n'+missing.join('\n')) : block;
}
function patchMain(text) {
  const re=/^location ~ \^\/\(admin[^\n]*\{\n[\s\S]*?^\}/gm;
  const matches=[...text.matchAll(re)];
  if(matches.length!==1 || !matches[0][0].includes('try_files /index.html =503;') || !matches[0][0].includes('X-Robots-Tag')) throw Error('Unexpected primary private-page location');
  return text.replace(re, block=>{
    if(!block.includes('add_header X-Content-Type-Options')) {
      const robots=/^([ \t]*)add_header X-Robots-Tag "noindex, nofollow" always;$/m;
      const anchor=block.match(robots);if(!anchor)throw Error('Unexpected primary robots header');
      block=block.replace(robots,'$&\n'+anchor[1]+'add_header X-Content-Type-Options nosniff always;');
    }
    return addHeaders(block);
  });
}
function patchGateway(text) {
  const re=/^[ \t]*add_header X-Content-Type-Options "?nosniff"? always;\n(?:[ \t]*add_header[^\n]*\n)*/gm;
  let count=0;
  const next=text.replace(re, block=>{
    if(!/add_header X-Mooncci-Node "?US"? always;/.test(block)) return block;
    if(!/add_header X-Mooncci-Route "?(?:primary|reader)"? always;/.test(block)) throw Error('Unexpected gateway route');
    count++;return addHeaders(block);
  });
  if(count!==4 || !text.includes('127.0.0.1:3102') || !text.includes('proxy_ssl_verify on;')) throw Error('Unexpected US gateway layout');
  return next;
}
function walk(root, prefix='') {
  const names=[];
  for(const ent of fs.readdirSync(root,{withFileTypes:true})) {
    const rel=path.posix.join(prefix,ent.name);
    if(ent.isDirectory()) names.push(...walk(path.join(root,ent.name),rel));
    else if(ent.isFile() && /^[A-Za-z0-9_./@-]+$/.test(rel)) names.push(rel);
    else throw Error('Unexpected package entry');
  }
  return names.sort();
}
function assertPath(file, root) {
  if(!file.startsWith(root+'/')) throw Error('Destination outside scope');
  for(let p=file;;p=path.dirname(p)) {
    if(fs.existsSync(p) && fs.lstatSync(p).isSymbolicLink()) throw Error('Symlink destination');
    if(p===root) break;
  }
}
function transaction(backup) {
  const rows=[];
  return {
    put(file,data,root,mode=0o644) {
      assertPath(file,root);
      const exists=fs.existsSync(file), old=exists?read(file):null;
      if(old && sha(old)===sha(data)) return;
      const stat=exists?fs.statSync(file):null, saved=path.join(backup,'file-'+rows.length);
      if(old) fs.writeFileSync(saved,old,{mode:0o600});
      fs.mkdirSync(path.dirname(file),{recursive:true});
      const tmp=file+'.pr101-'+crypto.randomBytes(5).toString('hex');
      fs.writeFileSync(tmp,data,{mode:stat?(stat.mode&0o777):mode});
      if(stat) fs.chownSync(tmp,stat.uid,stat.gid);
      const row={file,before:old?sha(old):null,after:sha(data),saved,stat};
      // Journal before rename, so a failed write never escapes rollback.
      rows.push(row);fs.renameSync(tmp,file);
    },
    rollback() {
      for(const row of [...rows].reverse()) {
        const current=fs.existsSync(row.file)?sha(read(row.file)):null;
        if(current===row.before) continue;
        if(current!==row.after) throw Error('Later modification prevents rollback');
        if(row.before===null) fs.unlinkSync(row.file);
        else {fs.writeFileSync(row.file,read(row.saved));fs.chmodSync(row.file,row.stat.mode);fs.chownSync(row.file,row.stat.uid,row.stat.gid);}
      }
    },
    verify() {for(const row of rows) if(sha(read(row.file))!==row.after) throw Error('Final file mismatch');},
    changed() {return rows.length>0;}
  };
}
function nginxTest() {
  try {output([NGINX,'-t']);} catch(error) {
    if(checkLog) fs.writeFileSync(checkLog,Buffer.concat([Buffer.from(error.stdout||''),Buffer.from(error.stderr||'')]),{mode:0o600});
    throw Error('Nginx validation failed; details are in the root-only backup');
  }
}
function reload() {output([NGINX,'-s','reload']);}
function probe(url, check, args=[]) {
  const response=output(['curl','--noproxy','*','-fsS','--max-time','15','-i',...args,url]);
  check(response);
}
function checkHeaders(response) {
  if(!/x-content-type-options: nosniff/i.test(response)) throw Error('HTTP nosniff header check failed');
  for(const [name,value] of headers) {
    const expected=value.replace(/^"|"$/g,'');
    if(!response.toLowerCase().includes((name+': '+expected).toLowerCase())) throw Error('HTTP security header check failed: '+name);
  }
}
async function ready(key,port) {
  for(let i=0;i<20;i++) {
    try {
      const response=await fetch('http://127.0.0.1:'+port+'/_reader/health',{headers:{'X-Mooncci-Reader-Key':key},signal:AbortSignal.timeout(1500)});
      if(response.status===200 && (await response.text())==='ok') {
        checkHeaders([...response.headers].map(([k,v])=>k+': '+v).join('\n'));
        const denied=await fetch('http://127.0.0.1:'+port+'/_reader/health',{signal:AbortSignal.timeout(1500)});
        if(denied.status!==403) throw Error('Unauthenticated reader health must remain forbidden');
        return;
      }
    } catch {}
    await new Promise(r=>setTimeout(r,500));
  }
  throw Error('Reader readiness/security check failed');
}
async function checkedProbe(url,check,args) {
  let failure;
  for(let i=0;i<4;i++) {
    try {probe(url,check,args);return;}catch(error){failure=error;}
    await new Promise(r=>setTimeout(r,300));
  }
  throw failure;
}
function envValues() {
  const result={};
  for(const line of read('/etc/mooncci-reader.env').toString().split('\n')) {
    const m=line.match(/^([A-Z_]+)=(.*)$/);if(!m)continue;
    let v=m[2].trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1);
    result[m[1]]=v;
  }
  if(!result.READER_KEY || result.READER_KEY.length<32 || Number(result.READER_PORT||3102)!==3102) throw Error('Unexpected reader environment');
  return result;
}
async function mainOrigin(backup) {
  const log=read('/tmp/mooncci-pr101-main.log').toString();
  if(!log.includes('REVISION='+REV) || !log.includes('EXIT_CODE=0')) throw Error('Main deployment is not confirmed complete');
  const stage=log.match(/^BUILD_STAGE=(.+)$/m)?.[1];
  if(!stage || !stage.startsWith('/www/wwwroot/.mooncci-pr101-build-') || fs.realpathSync(stage)!==stage || output(['git','-C',stage,'rev-parse','HEAD'])!==REV) throw Error('Unexpected prepared stage');
  const dist=path.join(stage,'dist'), files=walk(dist);
  if(!files.includes('index.html') || files.length<10) throw Error('Missing built frontend');
  for(const file of files) {assertPath(path.join(WEB,file),WEB);if(sha(read(path.join(WEB,file)))!==sha(read(path.join(dist,file)))) throw Error('Main built resource differs from live: '+file);}
  const source=read(path.join(stage,'edge/reader/server.mjs')), policy=read(path.join(stage,'edge/shared/public-policy.mjs'));
  if(sha(source)!==readerHash || sha(policy)!==policyHash) throw Error('Reader source checksum mismatch');
  const pkg=path.join(backup,'package');fs.mkdirSync(pkg);
  fs.cpSync(dist,path.join(pkg,'dist'),{recursive:true});
  fs.mkdirSync(path.join(pkg,'edge/reader'),{recursive:true});fs.mkdirSync(path.join(pkg,'edge/shared'),{recursive:true});
  fs.writeFileSync(path.join(pkg,'edge/reader/server.mjs'),source);fs.writeFileSync(path.join(pkg,'edge/shared/public-policy.mjs'),policy);
  const manifest={revision:REV,files:walk(pkg).map(file=>({file,sha256:sha(read(path.join(pkg,file)))}))};
  fs.writeFileSync(path.join(pkg,'MANIFEST.json'),JSON.stringify(manifest));
  const archive=path.join(backup,'reader.tgz');output(['tar','-czf',archive,'-C',pkg,'dist','edge','MANIFEST.json']);
  const name='mooncci-pr101-reader-'+crypto.randomBytes(8).toString('hex')+'.tgz';
  const url='https://mooncci.site/assets/'+name, digest=sha(read(archive));
  const old=read(INC),next=Buffer.from(patchMain(old.toString()));
  const tx=transaction(backup);
  nginxTest();
  probe('http://127.0.0.1:3001/api/health',r=>{if(!/"ok"\s*:\s*true/.test(r))throw Error('Main API health failed before release');});
  try {
    if(sha(read(INC))!==sha(old)) throw Error('Nginx snippet changed concurrently');
    tx.put(INC,next,path.dirname(INC));
    tx.put(path.join(WEB,'assets',name),read(archive),WEB);
    nginxTest();reload();
    await checkedProbe('https://mooncci.site/login',checkHeaders,['--resolve','mooncci.site:443:127.0.0.1']);
    const fetched=cp.execFileSync('curl',['--noproxy','*','-fsS','--max-time','30','--resolve','mooncci.site:443:127.0.0.1',url],{maxBuffer:16*1024*1024});
    if(sha(fetched)!==digest) throw Error('Reader transfer package HTTP checksum mismatch');
    probe('http://127.0.0.1:3001/api/health',r=>{if(!/"ok"\s*:\s*true/.test(r))throw Error('Main API health failed');});
    tx.verify();
    const transfer=JSON.stringify({url,sha256:digest,revision:REV});
    tx.put(path.join(WEB,'assets/mooncci-pr101-reader-transfer.json'),Buffer.from(transfer),WEB);
    tx.verify();
    fs.writeFileSync(path.join(backup,'transfer.json'),transfer);
  } catch(error) {
    try {tx.rollback();nginxTest();reload();console.error('ROLLBACK=PASS');}
    catch {throw Error('Release failed; rollback needs attention. Inspect the root-only backup locally.');}
    throw error;
  }
  console.log('PASS: primary Nginx headers verified; public reader package prepared without rebuilding.');
  console.log('PACKAGE_URL='+url+'\nPACKAGE_SHA256='+digest);
}
async function overseas(backup,url,digest) {
  if(!url && !digest) {
    const transfer=JSON.parse(output(['curl','--noproxy','*','-4','-fsS','--connect-timeout','10','--max-time','30','--resolve','mooncci.site:443:182.92.179.81','https://mooncci.site/assets/mooncci-pr101-reader-transfer.json?t='+Date.now()]));
    if(transfer.revision!==REV) throw Error('Primary transfer manifest has the wrong revision');
    url=transfer.url;digest=transfer.sha256;
  }
  if(!/^https:\/\/mooncci\.site\/assets\/mooncci-pr101-reader-[a-f0-9]{16}\.tgz$/.test(url||'') || !/^[a-f0-9]{64}$/.test(digest||'')) throw Error('Use the exact transfer URL and SHA256 from the primary log');
  const root=fs.realpathSync('/opt/mooncci-reader/current');
  if(!root.startsWith('/opt/mooncci-reader/releases/')) throw Error('Unexpected reader release path');
  const env=envValues();
  if(fs.realpathSync(env.READER_DIST)!==path.join(root,'dist')) throw Error('Reader dist does not match current release');
  const pid=Number(output(['systemctl','show','-p','MainPID','--value','mooncci-reader.service']));
  if(!pid) throw Error('Reader must be running before this scoped update');
  const serviceNode=fs.realpathSync('/proc/'+pid+'/exe');
  if(Number(output([serviceNode,'--version']).replace(/^v/,'').split('.')[0])<22) throw Error('Running reader requires Node 22+');
  const command=read('/proc/'+pid+'/cmdline').toString().split('\0');
  if(!command.some(x=>x.endsWith('/edge/reader/server.mjs') && fs.realpathSync(x)===path.join(root,'edge/reader/server.mjs'))) throw Error('Unexpected reader service command');
  const currentReader=sha(read(path.join(root,'edge/reader/server.mjs')));
  if(![readerHash,'b3808b630fd37eb0582c892518018359063c0771cdf56bba23cb71529dd4ee81','025e029575c5f128dd248780ae42e4a807e19cca257a846cd3331859ff2854b0','1ee2f9894a732d40b8ccac82c221a52297d1534de3e50666acada4c009bf4241','866408c3353b2bd0bc201df57331e7f5a64b4021a2f46da2810b7230bed120b3'].includes(currentReader)) throw Error('Reader source drift; stopped without changes');
  if(sha(read(path.join(root,'edge/shared/public-policy.mjs')))!==policyHash) throw Error('Reader policy drift');
  const health=await fetch('http://127.0.0.1:3102/_reader/health',{headers:{'X-Mooncci-Reader-Key':env.READER_KEY},signal:AbortSignal.timeout(3000)});
  if(health.status!==200 || (await health.text())!=='ok') throw Error('Existing reader health failed before release');
  const gateway=read(VHOST),next=Buffer.from(patchGateway(gateway.toString()));
  nginxTest();
  const archive=path.join(backup,'reader.tgz');
  output(['curl','--noproxy','*','-4','-fL','--connect-timeout','10','--max-time','120','--retry','2','--resolve','mooncci.site:443:182.92.179.81',url,'-o',archive]);
  if(sha(read(archive))!==digest) throw Error('Transfer package checksum mismatch');
  const names=output(['tar','-tzf',archive]).split('\n');
  if(names.some(x=>! /^(?:dist|edge)(?:\/[A-Za-z0-9_.@-]+)*\/?$|^MANIFEST\.json$/.test(x) || x.split('/').some(y=>y==='.'||y==='..'))) throw Error('Unsafe archive paths');
  if(output(['tar','-tvzf',archive]).split('\n').some(x=>!/^[-d]/.test(x))) throw Error('Archive links or special files are forbidden');
  const pkg=path.join(backup,'package');fs.mkdirSync(pkg);
  output(['tar','-xzf',archive,'--no-same-owner','--no-same-permissions','-C',pkg]);
  const manifest=JSON.parse(read(path.join(pkg,'MANIFEST.json')));
  if(manifest.revision!==REV || !Array.isArray(manifest.files)) throw Error('Wrong package revision');
  const expected=manifest.files.map(x=>x.file).sort(),actual=walk(pkg).filter(x=>x!=='MANIFEST.json');
  if(JSON.stringify(expected)!==JSON.stringify(actual) || new Set(expected).size!==expected.length) throw Error('Package manifest mismatch');
  for(const row of manifest.files) if(sha(read(path.join(pkg,row.file)))!==row.sha256) throw Error('Package file checksum mismatch');
  if(sha(read(path.join(pkg,'edge/reader/server.mjs')))!==readerHash || sha(read(path.join(pkg,'edge/shared/public-policy.mjs')))!==policyHash) throw Error('Wrong reader source');
  output([serviceNode,'--check',path.join(pkg,'edge/reader/server.mjs')]);
  const files=manifest.files.filter(x=>x.file.startsWith('dist/'));
  if(files.length<10 || !files.some(x=>x.file==='dist/index.html')) throw Error('Missing frontend assets');
  const tx=transaction(backup);let touched=false;
  try {
    if(sha(read(VHOST))!==sha(gateway) || sha(read(path.join(root,'edge/reader/server.mjs')))!==currentReader) throw Error('Live files changed concurrently');
    for(const row of files.filter(x=>x.file!=='dist/index.html')) {
      const dest=path.join(root,row.file);
      if(/\/assets\/.*-[A-Za-z0-9_-]{8,16}\.(js|css)$/.test(dest) && fs.existsSync(dest) && sha(read(dest))!==row.sha256) throw Error('Immutable asset collision');
      tx.put(dest,read(path.join(pkg,row.file)),root);
    }
    tx.put(path.join(root,'edge/reader/server.mjs'),read(path.join(pkg,'edge/reader/server.mjs')),root);
    tx.put(VHOST,next,path.dirname(VHOST));
    nginxTest();touched=true;
    output(['systemctl','restart','mooncci-reader.service']);await ready(env.READER_KEY,3102);
    reload();
    const local=['--resolve','mooncci.site:443:127.0.0.1'];
    for(const route of ['/','/login','/api/health']) await checkedProbe('https://mooncci.site'+route,r=>{checkHeaders(r);if(route!=='/'&&!/x-mooncci-route: primary/i.test(r))throw Error('Private/API route must remain primary');},local);
    const chunk=files.find(x=>/^dist\/assets\/.*\.js$/.test(x.file));
    if(!chunk) throw Error('Missing JavaScript asset');
    await checkedProbe('https://mooncci.site/'+chunk.file.slice(5),r=>{checkHeaders(r);if(!/x-mooncci-route: reader/i.test(r))throw Error('Asset did not use reader');},local);
    tx.put(path.join(root,'dist/index.html'),read(path.join(pkg,'dist/index.html')),root);
    tx.verify();
  } catch(error) {
    try {
      tx.rollback();
      if(touched) {nginxTest();reload();output(['systemctl','restart','mooncci-reader.service']);}
      console.error('ROLLBACK=PASS');
    } catch {throw Error('Release failed; rollback needs attention. Inspect the root-only backup locally.');}
    throw error;
  }
  console.log('PASS: overseas reader/assets and gateway headers verified; login and API remain on primary.');
}
async function cli() {
  if(process.getuid()!==0 || Number(process.versions.node.split('.')[0])<22) throw Error('Run as root with Node 22+; Python is not used');
  fs.mkdirSync('/www/backup',{recursive:true});
  const backup=fs.mkdtempSync('/www/backup/mooncci-pr101-edge-');fs.chmodSync(backup,0o700);console.log('BACKUP='+backup);
  checkLog=path.join(backup,'nginx-check.log');
  const args=process.argv.slice(2).filter(x=>x!=='--lock-held');
  if(args[0]==='main') await mainOrigin(backup);
  else if(args[0]==='us') await overseas(backup,args[1],args[2]);
  else throw Error('Expected main or us mode');
  console.log('REVISION='+REV+'\nEXIT_CODE=0');
}
module.exports={addHeaders,patchMain,patchGateway,transaction,walk,assertPath,mainOrigin,overseas,cli};
if(require.main===module) {
  if(!process.argv.includes('--lock-held')) {
    fs.mkdirSync('/www/backup',{recursive:true});
    const result=cp.spawnSync('flock',['-w','10','/www/backup/mooncci-deploy.lock',process.execPath,__filename,...process.argv.slice(2),'--lock-held'],{stdio:'inherit'});
    process.exitCode=result.status??1;
  } else cli().catch(error=>{console.error('STOPPED: '+error.message+'\nEXIT_CODE=1');process.exitCode=1;});
}
