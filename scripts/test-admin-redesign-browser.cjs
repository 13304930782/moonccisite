const {spawnSync}=require('node:child_process');
const path=require('node:path');
const base=process.env.ADMIN_REDESIGN_URL||'http://127.0.0.1:5195';
const parsed=new URL(base);
if(!['127.0.0.1','localhost'].includes(parsed.hostname)||parsed.protocol!=='http:')throw Error('Use a local built preview; this suite must not target production.');
for(const file of ['test-admin-redesign-layout-browser.cjs','test-admin-posts-redesign-browser.cjs','test-admin-writing-redesign-browser.cjs','test-admin-writing-polish-browser.cjs','test-admin-writing-sheet-browser.cjs','test-admin-media-redesign-browser.cjs','test-admin-media-touch-browser.cjs']){
 const result=spawnSync(process.execPath,[path.join(__dirname,file)],{cwd:path.join(__dirname,'..'),env:{...process.env,PLAYWRIGHT_CHANNEL:process.env.PLAYWRIGHT_CHANNEL||'chrome',ADMIN_REDESIGN_URL:base,ADMIN_POSTS_QA_URL:base},stdio:'inherit',timeout:240000});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status||1);
}
console.log('PASS: administration layout, article list, writing and media workflows; all API writes used local fixtures.');
