const {createFixture,launch,ID}=require('./fixtures/admin-redesign.cjs');
const assert=require('node:assert/strict');
// Public detail acceptance now lives in test-ai-summary-browser.cjs; this protects the unchanged admin preview.
(async()=>{const browser=await launch();try{
 for(const theme of ['light','dark']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.addInitScript(t=>localStorage.setItem('mooncci-theme',t),theme);
  const fixture=createFixture();fixture.resetDraft({title:'后台简介预览',summary:'介绍都市天际线 2 基础 Mod 与使用场景。',summary_mode:'ai',content:'<!--mooncci-richtext:v1--><h2>安装说明</h2><p>请按步骤安装，并确认当前游戏版本。</p>'});await fixture.install(page);
  await page.goto(`${process.env.PREVIEW_URL||'http://127.0.0.1:5324'}/admin/write?draft=${ID}`);
  await page.getByRole('button',{name:'发布',exact:true}).click();
  const frame=page.frameLocator('iframe[title="文章设备预览"]'),intro=frame.locator('.article-summary');await intro.waitFor();
  assert.equal(await intro.locator('.article-summary-source').count(),1);
  assert.equal(await frame.locator('section[aria-label="AI 简介"]').count(),0);
  const style=await intro.evaluate(e=>{const s=getComputedStyle(e),label=getComputedStyle(e.querySelector('.article-summary-source'));return {tag:e.tagName,size:s.fontSize,labelSize:label.fontSize,font:s.fontFamily,labelFont:label.fontFamily,line:s.lineHeight,labelLine:label.lineHeight,mask:getComputedStyle(e.querySelector('.article-summary-deepseek')).maskImage}});
  assert.equal(style.tag,'P');assert.equal(style.size,'15px');assert.equal(style.labelSize,style.size);assert.equal(style.labelFont,style.font);assert.equal(style.labelLine,style.line);assert(style.mask.includes('deepseek.svg'));assert.equal(fixture.publishes,0);
  console.log({theme,adminPreviewUnchanged:true,...style});await page.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
