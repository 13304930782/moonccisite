const test = require('node:test');
const assert = require('node:assert/strict');

test('all outgoing email routes use the mooncci theme, button fallbacks and sender; SMTP is intercepted', async t => {
  process.env.SITE_URL = 'https://mooncci.site';
  process.env.NEWSLETTER_DELIVERY_ENABLED = 'true';
  process.env.JWT_SECRET = 'local-mail-render-only';
  const db = require('../src/db'), platform = require('../src/platformDb');
  const nodemailer = require('nodemailer'), express = require('express'), jwt = require('jsonwebtoken');
  const config = { enabled: 'true', smtp_host: 'smtp.example.invalid', smtp_user: 'user', smtp_pass: 'fake-only', smtp_from: 'Mooncci Blog <sender@example.invalid>', notify_to: 'owner@example.invalid', site_url: 'https://mooncci.site', early_access_download_url: 'https://mooncci.site/api/early-access/download' };
  const captured = [];
  t.mock.method(nodemailer, 'createTransport', () => ({ sendMail: async message => { captured.push(message); return { messageId: 'local-test-only' }; } }));
  t.mock.method(db, 'query', async sql => {
    if (sql.includes('FROM site_settings')) return [[{ setting_value: JSON.stringify(config) }]];
    if (sql.includes('COUNT(*)')) return [[{ count: 0 }]];
    if (sql.includes('FROM users')) return [[{ id: 1, username: '本机测试', email: 'recipient@example.invalid', role: 'owner', status: 'active', can_comment: 1 }]];
    return [{ affectedRows: 1, insertId: 1 }];
  });
  t.mock.method(platform, 'query', async () => [{ affectedRows: 1, insertId: 1 }]);
  const mailer = require('../src/lib/mailer'), electricity = require('../src/lib/electricityMailer');
  const { newsletterMessage } = require('../src/lib/contentMail');
  const app = express(); app.use(express.json());
  app.use('/auth', require('../src/routes/auth-cookie'));
  app.use('/settings', require('../src/routes/settings'));
  app.use('/content', require('../src/routes/subscriptions').router);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `mooncci_token=${jwt.sign({ id: 1 }, process.env.JWT_SECRET)}` }, body: JSON.stringify(body) });
  const names = [];
  async function capture(name, action) { const length = captured.length; await action(); assert.equal(captured.length, length + 1, name); names.push(name); }
  try {
    await capture('subscription', async () => assert.equal((await post('/content/subscriptions', { email: 'recipient@example.invalid' })).status, 200));
    assert.match(captured.at(-1).html, /确认订阅/); assert.match(captured.at(-1).html, /24 小时/);
    await capture('password-reset', async () => assert.equal((await post('/auth/forgot-password', { email: 'recipient@example.invalid' })).status, 200));
    await capture('mail-test', async () => assert.equal((await post('/settings/mail/test', {})).status, 200));
    await capture('custom-mail', async () => assert.equal((await post('/settings/mail/send-custom', { to: 'recipient@example.invalid', subject: '站点消息', content: '你可以访问 https://example.com/Notes?x=1&y=2 获取说明。' })).status, 200));
    const comment = { postId: 1, postTitle: '一篇技术手记', authorName: '读者', authorEmail: 'reader@example.invalid', ip: '203.0.113.1', content: '感谢分享。' };
    await capture('comment-review', () => mailer.sendCommentNotification(comment));
    await capture('comment-approved', () => mailer.sendCommentReviewNotification(comment, 'visible'));
    await capture('comment-rejected', () => mailer.sendCommentReviewNotification(comment, 'rejected'));
    await capture('account-permissions', () => mailer.sendUserPermissionsNotification({ role: 'user', status: 'active', can_comment: 1 }, { username: '读者', email: 'reader@example.invalid', role: 'editor', status: 'active', can_comment: 1 }));
    const application = { id: 1, name: '体验者', email: 'reader@example.invalid', occupation: '开发者', device: 'MacBook', macOSVersion: '15.5', desiredFeatures: ['Prompt 管理'] };
    await capture('early-access-review', () => mailer.sendEarlyAccessOwnerNotification(application));
    await capture('early-access-approved', () => mailer.sendEarlyAccessApprovalEmail(application));
    const snapshot = { snapshotDate: '2026-09-05', totalRemaining: 42.5, purchasedRemaining: 30, subsidyRemaining: 12.5, todayUse: 2.2, price: .5 };
    const metrics = { balanceChange: -2.2, averageDailyUse: 2.4, estimatedDaysRemaining: 17.7 };
    for (const period of ['morning', 'evening', 'test']) await capture(`electricity-${period}`, () => electricity.sendElectricityDailyReport({ snapshot, metrics, status: 'normal', period, test: period === 'test' }));
    for (const status of ['low', 'critical']) await capture(`electricity-${status}`, () => electricity.sendElectricityLowAlert({ snapshot: { ...snapshot, totalRemaining: 8.5, purchasedRemaining: 3 }, status }));
    await capture('newsletter', () => mailer.sendMail({ to: 'reader@example.invalid', subject: 'mooncci 周报 · 2026-08-31', config, ...newsletterMessage([{ type: 'post', title: '记录一次接口设计', excerpt: '从一次开发中的具体问题说起。', path: '/article/1' }, { type: 'update', title: '最近在做什么', excerpt: '整理代码与阅读笔记。', path: '/updates/1' }, { type: 'release', title: 'PromptDock · v1.0', excerpt: '一个正式版本的更新。', path: '/projects/promptdock#release-1' }], 'https://mooncci.site', 'https://mooncci.site/subscription/unsubscribe#' + 'a'.repeat(64)) }));
    await capture('fallback', () => mailer.sendMail({ to: 'reader@example.invalid', subject: '[Mooncci] 临时通知\r\n', text: '查看 https://example.com/help', config }));
    for (let i = 0; i < captured.length; i++) {
      const mail = captured[i];
      assert.deepEqual(mail.from, { name: 'mooncci', address: 'sender@example.invalid' }, names[i]);
      assert.match(mail.subject, /^\[mooncci\] /); assert.equal((mail.subject.match(/\[mooncci\]/g) || []).length, 1); assert.doesNotMatch(mail.subject, /[\r\n]/);
      assert.match(mail.html, /data-mail-theme="mooncci"/); assert.doesNotMatch(mail.html, /Mooncci Blog|黄黑|<script|text-transform:uppercase/);
      const buttons = (mail.html.match(/data-mail-button="true"/g) || []).length;
      assert.equal(buttons, (mail.html.match(/data-mail-fallback="true"/g) || []).length, names[i]);
      assert.equal((mail.html.match(/<a /g) || []).length, buttons * 2, names[i]);
      if (names[i] !== 'mail-test') assert.ok(buttons > 0, names[i]);
      assert.ok(mail.text);
    }
    assert.equal((captured[names.indexOf('newsletter')].html.match(/data-mail-button="true"/g) || []).length, 4);
    if (process.env.MAIL_PREVIEW_DIR) {
      const fs = require('node:fs'), path = require('node:path');
      fs.mkdirSync(process.env.MAIL_PREVIEW_DIR, { recursive: true });
      for (let i = 0; i < captured.length; i++) fs.writeFileSync(path.join(process.env.MAIL_PREVIEW_DIR, names[i] + '.html'), captured[i].html);
      fs.writeFileSync(path.join(process.env.MAIL_PREVIEW_DIR, 'checks.json'), JSON.stringify({ cases: names, smtp: 'intercepted; no email sent', from: captured[0].from, subjects: captured.map(m => m.subject) }, null, 2));
    }
  } finally { await new Promise(resolve => server.close(resolve)); await db.end(); await platform.end(); }
});
