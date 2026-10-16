const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { JSDOM } = require('jsdom');
const requests = [];

function load(file) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const imports = name => {
    if (name === 'react-router-dom') return { Link: ({ to, children, ...props }) => React.createElement('a', { ...props, href: to }, children) };
    if (name === '../ContentUI') return { labels: { post: '文章', update: '近况', release: '项目版本' }, formatDate: value => value || '', useResource: (url, enabled) => { requests.push({ url, enabled }); return { data: null }; } };
    return name.startsWith('.') ? load(path.resolve(path.dirname(file), name) + '.ts') : require(name);
  };
  new Function('require', 'module', 'exports', code)(imports, mod, mod.exports);
  return mod.exports;
}
const { HomePostList, HomeActivityList } = load('src/app/components/home/HomeActivityList.tsx');
const render = (component, props) => new JSDOM(renderToStaticMarkup(React.createElement(component, props))).window.document;

test('homepage articles preserve published data, links and update dates without additional requests', () => {
  requests.length = 0;
  const posts = [{ id: 7, title: '**真实文章**', summary: '<p>两行摘要 &amp; **正文**</p>', category: '技术', tags: ['保留标签'], updated_at: '2026-10-16', published_at: '2026-10-15', cover_image: '/api/uploads/portrait.webp', cover_crop: { card: { x: .2, y: .7, zoom: 1.5 }, detail: null } }];
  const before = JSON.stringify(posts);
  const doc = render(HomePostList, { posts });
  const link = doc.querySelector('a'), title = doc.querySelector('h3'), image = doc.querySelector('img');
  assert.equal(link.getAttribute('href'), '/article/7');
  assert.equal(link.getAttribute('aria-labelledby'), title.id);
  assert.equal(title.textContent, '真实文章');
  assert.equal(doc.querySelector('.home-activity-meta').textContent, '技术');
  assert.equal(doc.querySelector('.home-activity-excerpt').textContent, '两行摘要 & 正文');
  assert.equal(doc.querySelector('time').dateTime, '2026-10-16');
  assert.equal(doc.querySelector('time').textContent, '更新于 2026-10-16');
  assert.equal(image.getAttribute('src'), '/api/image-variants/180/portrait.webp');
  assert.match(image.getAttribute('srcSet'), /360\/portrait.webp 360w/);
  assert.equal(image.getAttribute('sizes'), '(max-width: 760px) 168px, 270px');
  assert.equal(image.style.objectPosition, '20% 70%');
  assert.equal(image.style.transform, 'scale(1.5)');
  assert.deepEqual(requests, []);
  assert.equal(JSON.stringify(posts), before);
});

test('homepage articles keep coverless rows and reject unsafe image URLs', () => {
  const doc = render(HomePostList, { posts: [
    { id: 1, title: '无封面', tags: ['一', '二', '三', '四'], published_at: '2026-10-15' },
    { id: 2, title: '安全边界', tags: '旧数据', cover_image: 'javascript:alert(1)', created_at: '2026-10-14' },
  ] });
  assert.equal(doc.querySelectorAll('.home-post-row').length, 2);
  assert.equal(doc.querySelectorAll('img').length, 0);
  assert.equal(doc.querySelectorAll('.home-activity-meta')[0].textContent, '一 / 二 / 三');
  assert.equal(doc.querySelectorAll('.home-activity-meta')[1].textContent, '文章');
  assert.equal(doc.querySelectorAll('time')[1].dateTime, '2026-10-14');
  assert.equal(doc.querySelectorAll('.home-activity-excerpt').length, 0);
});

test('homepage activity and article covers share crop fallback and fixed image dimensions', () => {
  requests.length = 0;
  const post = { id: 3, cover_image: '/cover.webp', cover_crop: { card: null, detail: { x: .8, y: .1, zoom: 2 } } };
  const doc = render(HomeActivityList, { items: [{ activity_id: 'post-3', id: 3, type: 'post', title: '文章', excerpt: '摘要', published_at: '2026-10-15', path: '/article/3' }], posts: [post], postsLoading: false });
  const image = doc.querySelector('img');
  assert.equal(image.style.objectPosition, '80% 10%');
  assert.equal(image.style.transform, 'scale(2)');
  assert.equal(image.width, 168);
  assert.equal(image.height, 105);
  assert.deepEqual(requests, [{ url: '/posts/3', enabled: false }]);
});
