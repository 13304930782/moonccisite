const assert = require('node:assert/strict');
const fs = require('node:fs');
const {createFixture, launch, ID} = require('./fixtures/admin-redesign.cjs');
const base = process.env.ADMIN_REDESIGN_URL || 'http://127.0.0.1:5323';
const url = 'https://www.youtube.com/watch?v=s-pZ2TzQb00';
const code = '<iframe width="560" height="315" src="https://www.youtube.com/embed/s-pZ2TzQb00?si=example&amp;start=27" title="YouTube video player" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>';
const paste = (page, text, html = '') => page.locator('.tiptap').evaluate((element, {text, html}) => {
  const clipboardData = new DataTransfer();
  if (text) clipboardData.setData('text/plain', text);
  if (html) clipboardData.setData('text/html', html);
  element.dispatchEvent(new ClipboardEvent('paste', {clipboardData, bubbles: true, cancelable: true}));
}, {text, html});
const newParagraph = async editor => {
  await editor.evaluate(element => {
    element.focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await editor.press('Enter');
};
const waitSaved = async (state, pattern) => {
  for (let i = 0; i < 100; i++) {
    if (pattern.test(state.draft.payload.content)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.match(state.draft.payload.content, pattern);
};

(async () => {
  const browser = await launch();
  fs.mkdirSync('.cache/youtube', {recursive: true});
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({viewport: {width, height: 1000}});
      const page = await context.newPage();
      const state = createFixture();
      const errors = [];
      state.resetDraft({title: 'YouTube 视频与链接预览', content: '<!--mooncci-richtext:v1--><p></p>'});
      await state.install(page);
      await page.route('https://**', route => route.abort());
      await page.route('https://i.ytimg.com/**', route => route.fulfill({contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270"><rect width="480" height="270" fill="#ddd"/><text x="120" y="140" font-size="26">Mod video preview</text></svg>'}));
      await page.route('**/api/youtube-preview/s-pZ2TzQb00', route => route.fulfill({json: {title: 'Mod 演示 · 测试视频', author: '测试作者'}}));
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${base}/admin/write?draft=${ID}`);
      const editor = page.locator('.tiptap');
      await editor.waitFor();
      await editor.click();
      await paste(page, url);
      await editor.locator(`a[href="${url}"]`).waitFor();
      assert.equal(await editor.locator('iframe').count(), 0, 'Ordinary URLs must stay links');
      await newParagraph(editor);
      await paste(page, code);
      await editor.locator('iframe').waitFor();
      assert.match(await editor.locator('iframe').getAttribute('src'), /start=27/);
      await waitSaved(state, /data-youtube-start="27"/);
      assert.doesNotMatch(state.draft.payload.content, /<iframe/);
      await page.reload();
      await editor.locator('iframe').waitFor();
      assert.match(await editor.locator('iframe').getAttribute('src'), /start=27/);
      assert.equal(await editor.locator(`a[href="${url}"]`).count(), 1);
      await page.getByRole('button', {name: '阅读预览', exact: true}).filter({visible: true}).click();
      await page.locator('.rich-youtube iframe').waitFor();
      const link = page.locator(`.rich-text-body a[href="${url}"]`).filter({hasText: url});
      await link.hover();
      await page.locator('.youtube-link-preview').getByText('Mod 演示 · 测试视频', {exact: true}).waitFor();
      assert.equal(await page.locator('.youtube-link-preview img').getAttribute('alt'), '视频封面');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({path: `.cache/youtube/${width}-reading-hover.png`});
      await page.mouse.move(0, 0);
      await page.getByRole('button', {name: '富文本编辑', exact: true}).filter({visible: true}).click();
      await newParagraph(editor);
      await paste(page, '<iframe src="https://evil.example/video"></iframe>');
      assert.equal(await editor.locator('iframe').count(), 1, 'Untrusted iframe must not become a player');
      assert.equal(await editor.locator('iframe[src*="evil.example"]').count(), 0);
      await page.screenshot({path: `.cache/youtube/${width}-editor.png`});
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({width, pass: true, ordinaryLink: true, embedStart: 27, saveReload: true, hoverPreview: true}));
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
