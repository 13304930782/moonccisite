const test = require('node:test');
const assert = require('node:assert/strict');
test(
  'newsletter scheduling, suppression, retries, uncertain delivery and restart recovery',
  { skip: process.env.CONTENT_INTEGRATION !== 'true' },
  async () => {
    assert.match(process.env.DB_NAME || '', /^mooncci_qa(?:_|$)/);
    process.env.NEWSLETTER_DELIVERY_ENABLED = 'true';
    const db = require('../src/platformDb');
    const legacy = require('../src/db');
    const mailer = require('../src/lib/mailer');
    const original = {
      sendMail: mailer.sendMail,
      getMailConfig: mailer.getMailConfig,
      isMailEnabled: mailer.isMailEnabled,
    };
    let mode = 'sent',
      calls = [];
    mailer.getMailConfig = async () => ({ site_url: 'https://example.invalid' });
    mailer.isMailEnabled = () => true;
    mailer.sendMail = async (message) => {
      calls.push(message);
      if (mode === 'timeout')
        throw Object.assign(Error('Ambiguous DATA timeout'), { code: 'ETIMEDOUT' });
      if (mode === 'rejected') throw Object.assign(Error('Rejected'), { responseCode: 550 });
      return { sent: true };
    };
    delete require.cache[require.resolve('../src/services/newsletter')];
    const { deliverWeek } = require('../src/services/newsletter');
    const now = new Date('2026-09-07T01:00:00Z');
    let subscriberId, updateId;
    try {
      await db.query("UPDATE subscribers SET status='unsubscribed'");
      await db.query('UPDATE newsletter_settings SET enabled=1 WHERE id=1');
      const [s] = await db.query(
        "INSERT INTO subscribers (email,status,confirmed_at) VALUES (?,'active','2026-09-01')",
        [`newsletter-${Date.now()}@example.invalid`],
      );
      subscriberId = s.insertId;
      const [u] = await db.query(
        "INSERT INTO updates (content,status,author_id,published_at) VALUES ('Newsletter QA','published',1,'2026-09-02')",
      );
      updateId = u.insertId;
      assert.equal((await deliverWeek(new Date('2026-09-07T00:59:59Z'))).skipped, true);
      assert.equal(calls.length, 0);
      await deliverWeek(now);
      assert.equal(calls.length, 1);
      assert.match(calls[0].text, /Newsletter QA/);
      assert.ok(!calls[0].text.includes('v1'));
      assert.match(calls[0].html, /取消订阅/);
      await deliverWeek(now);
      assert.equal(calls.length, 1, 'successful delivery is not repeated');
      await db.query(
        "UPDATE newsletter_deliveries SET status='pending',attempts=0 WHERE subscriber_id=?",
        [subscriberId],
      );
      await db.query("UPDATE subscribers SET status='unsubscribed' WHERE id=?", [subscriberId]);
      await deliverWeek(now);
      assert.equal(calls.length, 1, 'unsubscribed recipient is suppressed');
      await db.query("UPDATE subscribers SET status='active' WHERE id=?", [subscriberId]);
      mode = 'rejected';
      for (let i = 0; i < 5; i++) {
        await db.query(
          'UPDATE newsletter_deliveries SET next_attempt_at=NULL WHERE subscriber_id=?',
          [subscriberId],
        );
        await deliverWeek(now);
      }
      const [[failed]] = await db.query(
        'SELECT status,attempts FROM newsletter_deliveries WHERE subscriber_id=?',
        [subscriberId],
      );
      assert.equal(failed.status, 'failed');
      assert.equal(failed.attempts, 4);
      assert.equal(calls.length, 5, 'initial attempt plus three retries');
      await db.query(
        "UPDATE newsletter_deliveries SET status='pending',attempts=0,next_attempt_at=NULL WHERE subscriber_id=?",
        [subscriberId],
      );
      mode = 'timeout';
      await deliverWeek(now);
      await deliverWeek(now);
      const [[uncertain]] = await db.query(
        'SELECT status,attempts FROM newsletter_deliveries WHERE subscriber_id=?',
        [subscriberId],
      );
      assert.equal(uncertain.status, 'uncertain');
      assert.equal(uncertain.attempts, 1);
      await db.query(
        "UPDATE newsletter_deliveries SET status='sending',updated_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 16 MINUTE) WHERE subscriber_id=?",
        [subscriberId],
      );
      await deliverWeek(now);
      const [[recovered]] = await db.query(
        'SELECT status FROM newsletter_deliveries WHERE subscriber_id=?',
        [subscriberId],
      );
      assert.equal(recovered.status, 'uncertain');
      const before = calls.length;
      await db.query('UPDATE newsletter_settings SET enabled=0 WHERE id=1');
      await deliverWeek(now);
      assert.equal(calls.length, before, 'paused newsletter sends nothing');
      // Unsubscribe while preparing the message: the final recipient check must suppress SMTP.
      await db.query('UPDATE newsletter_settings SET enabled=1 WHERE id=1');
      await db.query("UPDATE newsletter_deliveries SET status='pending',attempts=0,next_attempt_at=NULL WHERE subscriber_id=?",[subscriberId]);
      await db.query("UPDATE subscribers SET status='active' WHERE id=?",[subscriberId]);
      const originalQuery = db.query.bind(db);
      db.query = async (...args) => {
        const result=await originalQuery(...args);
        if(String(args[0]).startsWith('INSERT INTO newsletter_tokens')) await originalQuery("UPDATE subscribers SET status='unsubscribed' WHERE id=?",[subscriberId]);
        return result;
      };
      try { await deliverWeek(now); } finally { db.query=originalQuery; }
      assert.equal(calls.length,before,'last-moment unsubscribe never reaches SMTP');

    } finally {
      Object.assign(mailer, original);
      if (subscriberId)
        await db.query("UPDATE subscribers SET status='unsubscribed' WHERE id=?", [subscriberId]);
      if (updateId) await db.query("UPDATE updates SET status='draft' WHERE id=?", [updateId]);
      await db.query('UPDATE newsletter_settings SET enabled=0 WHERE id=1');
      await db.end();
      await legacy.end();
    }
  },
);
