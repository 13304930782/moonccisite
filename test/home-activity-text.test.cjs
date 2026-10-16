const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => name.startsWith('.') ? load(path.resolve(path.dirname(file), name) + '.ts') : require(name), loaded, loaded.exports);
  return loaded.exports;
}
const { plainActivityText, homeActivityText } = load('src/app/components/home/activityText.ts');

test('activity text strips Markdown, HTML, entities and excess whitespace without browser globals', () => {
  assert.equal(plainActivityText('# **标题** &amp; _说明_\n\n- [链接](https://example.com)\n- ~~旧文~~ `code`\n\n<p title="a>b">内容&nbsp;&copy;<br>下一行</p>'), '标题 & 说明 链接 旧文 code 内容 © 下一行');
  assert.equal(plainActivityText('![配图说明](https://example.com/a.png)\n\n&gt; &#x1F427; &#20013; &lt;div&gt;'), '配图说明 > 🐧 中 <div>');
  assert.equal(plainActivityText('<!-- 隐藏注释 -->\n<script>alert("隐藏")</script>\n\n正文'), '正文');
  assert.equal(plainActivityText('| A | B |\n| - | - |\n| C | D |'), 'A B C D');
  assert.equal(plainActivityText('拼<b>接</b>文本 `a<b>`'), '拼接文本 a<b>');
  assert.equal(plainActivityText('<div title="未闭合>内容'), '');
  assert.equal(plainActivityText(null), '');
});

test('release removes the duplicated project name and only an exact leading title', () => {
  assert.deepEqual(homeActivityText({ type: 'release', title: 'PromptDock · PromptDock 1.2.0', excerpt: '# PromptDock 1.2.0\n\n新增功能。' }), { title: 'PromptDock 1.2.0', excerpt: '新增功能。' });
  assert.deepEqual(homeActivityText({ type: 'release', title: 'PromptDock · PromptDock 1.2.0', excerpt: 'PromptDock · PromptDock 1.2.0：修复问题。' }), { title: 'PromptDock 1.2.0', excerpt: '修复问题。' });
});

test('release keeps a different first line and a title without a duplicated name', () => {
  assert.deepEqual(homeActivityText({ type: 'release', title: 'PromptDock · 1.1.0', excerpt: '这是旧版本的发布说明。\n\nPromptDock · 1.1.0' }), { title: 'PromptDock · 1.1.0', excerpt: '这是旧版本的发布说明。 PromptDock · 1.1.0' });
  assert.deepEqual(homeActivityText({ type: 'release', title: 'PromptDock · PromptDock 1.1.0', excerpt: '先安装旧版本，再更新。' }), { title: 'PromptDock 1.1.0', excerpt: '先安装旧版本，再更新。' });
  assert.deepEqual(homeActivityText({ type: 'release', title: '项目 v1', excerpt: '项目 v10 的版本说明。' }), { title: '项目 v1', excerpt: '项目 v10 的版本说明。' });
});

test('release handles empty excerpts and punctuation in project titles literally', () => {
  assert.deepEqual(homeActivityText({ type: 'release', title: 'C++/[ ] · C++/[ ] 2.0', excerpt: '**C++/[ ] 2.0**\n修复。' }), { title: 'C++/[ ] 2.0', excerpt: '修复。' });
  assert.deepEqual(homeActivityText({ type: 'release', title: '项目 · 项目 v1', excerpt: '' }), { title: '项目 v1', excerpt: '' });
  assert.deepEqual(homeActivityText({ type: 'release', title: '', excerpt: '保留内容' }), { title: '查看版本更新', excerpt: '保留内容' });
  assert.deepEqual(homeActivityText({ type: 'release', title: '版本', excerpt: '版本' }), { title: '版本', excerpt: '' });
});

test('posts and updates get plain text without release-specific deduplication', () => {
  for (const type of ['post', 'update']) {
    assert.deepEqual(homeActivityText({ type, title: '**项目 · 项目 v1**', excerpt: '# 项目 · 项目 v1\n正文' }), { title: '项目 · 项目 v1', excerpt: '项目 · 项目 v1 正文' });
  }
});

test('image-only activity still has a visible title for its link accessible name', () => {
  assert.deepEqual(homeActivityText({ type: 'update', title: '![](/image.png)', excerpt: '![](/image.png)' }), { title: '查看近况', excerpt: '' });
  assert.equal(homeActivityText({ type: 'post', title: '' }).title, '查看文章');
  assert.equal(homeActivityText({ type: 'release', title: '' }).title, '查看版本更新');
  assert.equal(homeActivityText({ type: 'unknown', title: '' }).title, '查看更新');
});
