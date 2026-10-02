const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { localPart, email, header, seal, open } = require('../src/lib/mailboxSecurity');

test('mailbox names reject reserved identities and injection', () => {
  assert.equal(localPart('Alice.Smith'), 'alice.smith');
  for (const value of ['root', 'postmaster', '.alice', 'a', 'a..b', 'a/b', 'a@mooncci.site']) {
    assert.equal(localPart(value), '', value);
  }
  assert.equal(email(' Person@Example.COM '), 'person@example.com');
  assert.equal(email('bad\r\nBcc:foo@example.com'), '');
  assert.equal(email('one@example.com,two@example.com'), '');
  assert.equal(header('Hi\r\nBcc: foo'), 'Hi  Bcc: foo');
});

test('mailbox SMTP secret is authenticated and bound to its address', () => {
  const original = process.env.MAILBOX_SECRET_KEY;
  process.env.MAILBOX_SECRET_KEY = crypto.randomBytes(32).toString('hex');
  try {
    const cipher = seal('test-pass', 'alice@mooncci.site');
    assert.equal(open(cipher, 'alice@mooncci.site'), 'test-pass');
    assert.throws(() => open(cipher, 'bob@mooncci.site'));
    assert.throws(() => open(cipher.slice(0, -2) + 'XX', 'alice@mooncci.site'));
  } finally {
    if (original === undefined) delete process.env.MAILBOX_SECRET_KEY;
    else process.env.MAILBOX_SECRET_KEY = original;
  }
});
