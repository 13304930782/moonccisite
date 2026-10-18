const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createFixture, launch, ID } = require('./fixtures/admin-redesign.cjs');
const base = process.env.ADMIN_REDESIGN_URL || 'http://127.0.0.1:5322';
const title = 'Cities: Skylines II 都市天际线2 基础Mod推荐：完整安装方法与常见问题排查';
(async () => {
  const browser = await launch();
  fs.mkdirSync('.cache/editor-title', { recursive: true });
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 960 } });
      const page = await context.newPage();
      page.on('pageerror', error => console.error('PAGE ERROR', error.message));
      const state = createFixture();
      state.resetDraft({ title, content: '<!--mooncci-richtext:v1-->\n<p>标题换行回归检查。</p>' });
      await state.install(page);
      await page.route('https://**', route => route.abort());
      await page.goto(base + '/admin/write?draft=' + ID);
      const input = page.locator('#article-title');
      await input.waitFor();
      const fits = async label => {
        await page.waitForFunction(() => { const e = document.getElementById('article-title'); return e.clientHeight >= e.scrollHeight; });
        const geometry = await input.evaluate(e => ({ tag: e.tagName, height: e.clientHeight, scroll: e.scrollHeight, width: e.clientWidth, scrollWidth: e.scrollWidth, font: parseFloat(getComputedStyle(e).fontSize), line: parseFloat(getComputedStyle(e).lineHeight) }));
        assert.equal(geometry.tag, 'TEXTAREA');
        assert.equal(await input.inputValue(), title);
        assert(geometry.height >= geometry.line * 2, label + ' wraps');
        assert(geometry.scrollWidth <= geometry.width + 1, label + ' horizontal fit');
        assert.equal(geometry.font, width < 768 ? 28 : 38);
        console.log(label, geometry);
      };
      await fits(width + ' editing');
      await page.getByRole('button', { name: '阅读预览', exact: true }).filter({ visible: true }).click();
      await fits(width + ' reading preview');
      await page.screenshot({ path: `.cache/editor-title/${width}-preview.png`, fullPage: false });
      if (width === 1440) {
        await page.getByRole('button', { name: '收起文章设置', exact: true }).click();
        await fits(width + ' collapsed settings');
        await page.setViewportSize({ width: 1000, height: 960 });
        await fits(width + ' resized');
      }
      await input.fill('A'.repeat(255));
      await page.waitForFunction(() => { const e = document.getElementById('article-title'); return e.clientHeight >= e.scrollHeight && e.scrollWidth <= e.clientWidth + 1; });
      if (width === 1440) {
        await page.setViewportSize({ width: 600, height: 960 });
        await page.waitForFunction(() => { const e = document.getElementById('article-title'); return e.clientHeight >= e.scrollHeight && e.scrollWidth <= e.clientWidth + 1; });
      }
      await input.fill('短标题');
      await page.waitForFunction(() => document.getElementById('article-title').clientHeight <= 49);
      await input.fill('粘贴第一行\n第二行');
      assert.equal(await input.inputValue(), '粘贴第一行 第二行');
      await page.waitForFunction(() => document.querySelector('.writing-save-state')?.dataset.state === 'saved');
      assert.equal(state.draft.payload.title, '粘贴第一行 第二行');
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
