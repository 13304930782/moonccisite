const assert = require('node:assert/strict');
const {chromium} = require('playwright');
(async () => {
 const server = await (await import('vite')).createServer({server:{host:'127.0.0.1',port:4268,strictPort:true,hmr:false},logLevel:'error'});
 await server.listen();
 const browser = await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
 try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4268/');
  await page.addStyleTag({url:'http://127.0.0.1:4268/src/styles/rich-text.css'});
  const colors = await page.evaluate(async () => {
   const {richTextFragment,sanitizeRichText} = await import('/src/app/lib/richText.ts');
   const source='<p><mark data-color="var(--tt-color-highlight-blue)" style="background-color:var(--tt-color-highlight-blue)">蓝色</mark></p>';
   const copy=document.createElement('div');copy.className='rich-text-body';copy.append(richTextFragment(sanitizeRichText(source)));document.body.append(copy);
   const mark=copy.querySelector('mark');const light=getComputedStyle(mark).backgroundColor;document.documentElement.classList.add('dark');const dark=getComputedStyle(mark).backgroundColor;
   return {light,dark,html:copy.innerHTML};
  });
  assert.equal(colors.light,'rgb(224, 242, 254)');assert.equal(colors.dark,'rgb(110, 146, 170)');assert.match(colors.html,/tt-color-highlight-blue/);
  console.log('PASS: blue highlight survives saving and displays in light and dark themes.');
 } finally {await browser.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
