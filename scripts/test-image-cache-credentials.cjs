// Real browser HTTP cache: anonymous -> cookie -> Authorization -> Range.
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
(async () => {
  const browser = await chromium.launch(process.platform === 'win32' ? {channel:'msedge'} : {});
  try {
    const page = await browser.newPage();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    const cached = new Set();
    cdp.on('Network.requestServedFromCache', e => cached.add(e.requestId));
    const records = [];
    cdp.on('Network.responseReceived', e => {
      if (e.response.url.includes('/api/uploads/')) records.push({id:e.requestId, disk:e.response.fromDiskCache, url:e.response.url});
    });
    await page.goto(`http://127.0.0.1:${process.argv[2]}/`);
    async function fetchImage(name, headers) {
      const before = records.length;
      await page.evaluate(async ({name,headers}) => {const r=await fetch('/api/uploads/'+name+'.webp',{headers}); await r.arrayBuffer();}, {name,headers});
      await page.waitForTimeout(100);
      assert.equal(records.length, before + 1);
      const r = records[records.length-1];
      return Boolean(r.disk || cached.has(r.id));
    }
    assert.equal(await fetchImage('cookie-sequence'), false);
    assert.equal(await fetchImage('cookie-sequence'), true, 'anonymous repeat must actually use cache');
    await page.evaluate(() => {document.cookie='mooncci_cache_test=1; path=/';});
    assert.equal(await fetchImage('cookie-sequence'), false, 'new cookie must bypass anonymous cached representation');
    await page.evaluate(() => {document.cookie='mooncci_cache_test=; Max-Age=0; path=/';});
    for (const header of ['Authorization', 'Range']) {
      const name=header.toLowerCase()+'-sequence';
      assert.equal(await fetchImage(name), false);
      assert.equal(await fetchImage(name), true);
      assert.equal(await fetchImage(name, {[header]:header==='Range'?'bytes=0-1':'Bearer fixture'}), false, header+' must reach server');
    }
    console.log('PASS: actual browser cache hits and credential/range partition');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
