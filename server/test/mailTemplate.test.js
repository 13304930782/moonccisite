const test = require('node:test');
const assert = require('node:assert/strict');
const { renderBrandedEmail, safeHttpUrl } = require('../src/lib/mailTemplate');

test('branded email escapes content and renders a non-blue CTA', () => {
  const html = renderBrandedEmail({
    title: '<PromptDock>',
    intro: 'Hello <script>alert(1)</script>',
    details: [{ label: 'Email', value: 'person@example.com' }],
    cta: { label: 'Review now', url: 'https://mooncci.site/admin/early-access/1' },
  });

  assert.match(html, /&lt;PromptDock&gt;/);
  assert.doesNotMatch(html, /<script\b/i);
  assert.match(html, /data-mail-theme="mooncci"/);
  assert.match(html, /color:#ffffff !important/);
  assert.match(html, /data-mail-fallback="true"/);
  assert.doesNotMatch(html, /#2563eb|blue/i);
  assert.match(html, /https:\/\/mooncci\.site\/admin\/early-access\/1/);
});

test('branded email drops unsafe CTA protocols', () => {
  const html = renderBrandedEmail({
    title: 'Unsafe link',
    cta: { label: 'Open', url: 'javascript:alert(1)' },
  });

  assert.doesNotMatch(html, /javascript:/i);
  assert.doesNotMatch(html, />Open<\/a>/);
  assert.equal(safeHttpUrl('javascript:alert(1)'), '');
});


test('every action and authored HTTP link has a matching full fallback, preserving case and tokens', () => {
  const url = 'https://mooncci.site/subscription/confirm#AaBb0123456789';
  const html = renderBrandedEmail({ title: 'Mooncci 通知', paragraphs: ['自定义链接：https://example.com/Case?X=1&Y=2'], cta: { label: '确认订阅', url } });
  assert.equal((html.match(/data-mail-button="true"/g) || []).length, 2);
  assert.equal((html.match(/data-mail-fallback="true"/g) || []).length, 2);
  assert.equal((html.match(/https:\/\/mooncci.site\/subscription\/confirm#AaBb0123456789/g) || []).length, 3);
  assert.match(html, /https:\/\/example.com\/Case\?X=1&amp;Y=2/);
  assert.doesNotMatch(html, /Mooncci/);
  assert.equal(safeHttpUrl('https://user:secret@example.com'), '');
});
