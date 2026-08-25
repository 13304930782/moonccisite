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
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /background:#ffe17c/);
  assert.match(html, /color:#000000 !important/);
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
