const test = require('node:test'), assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { validateEmail, mobileconfig } = require('../src/lib/mailClient');
const { createRouter } = require('../src/routes/mailSetup');
const valid = "Ada.O'Neil&work+tag@MOONCCI.SITE";
test('validation preserves local-part, accepts safe XML special chars, rejects invalid input', () => {
  assert.equal(validateEmail(valid), "Ada.O'Neil&work+tag@mooncci.site");
  for (const value of [null, {}, '', 'x@gmail.com', 'a@mooncci.site.evil', 'x@@mooncci.site', '.x@mooncci.site', 'x..y@mooncci.site', 'x.@mooncci.site', ' x@mooncci.site', 'x@mooncci.site\n', 'x\0@mooncci.site', 'x\x7f@mooncci.site', 'x'.repeat(65)+'@mooncci.site', '<key>Injected</key>@mooncci.site', '"x"@mooncci.site']) assert.equal(validateEmail(value), null, String(value));
});
test('Apple profile parses with typed official payload, actual account, UUIDs and no secrets', () => {
  const profile = mobileconfig(valid);
  const result = spawnSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-c', `import sys,plistlib,uuid
p=plistlib.loads(sys.stdin.buffer.read());assert p['PayloadType']=='Configuration'
assert type(p['PayloadVersion']) is int
uuid.UUID(p['PayloadUUID']);assert len(p['PayloadContent'])==1
m=p['PayloadContent'][0];assert m['PayloadType']=='com.apple.mail.managed'
assert m['EmailAccountType']=='EmailTypeIMAP'
uuid.UUID(m['PayloadUUID']);assert m['PayloadUUID']!=p['PayloadUUID']
for prefix,port in [('Incoming',993),('Outgoing',587)]:
 assert m[prefix+'MailServerUsername']=="Ada.O'Neil&work+tag@mooncci.site"
 assert m[prefix+'MailServerPortNumber']==port and type(m[prefix+'MailServerPortNumber']) is int
 assert m[prefix+'MailServerHostName']=='mail.cuegroveapp.com'
 assert m[prefix+'MailServerUseSSL'] is True
 assert m[prefix+'MailServerAuthentication']=='EmailAuthPassword'
assert m['EmailAddress']==m['IncomingMailServerUsername']
assert set(m)=={'PayloadType','PayloadVersion','PayloadIdentifier','PayloadUUID','PayloadDisplayName','EmailAccountDescription','EmailAccountType','EmailAddress','IncomingMailServerHostName','IncomingMailServerPortNumber','IncomingMailServerUseSSL','IncomingMailServerAuthentication','IncomingMailServerUsername','OutgoingMailServerHostName','OutgoingMailServerPortNumber','OutgoingMailServerUseSSL','OutgoingMailServerAuthentication','OutgoingMailServerUsername','OutgoingPasswordSameAsIncomingPassword'}
assert m['OutgoingPasswordSameAsIncomingPassword'] is True
assert 'IncomingPassword' not in m and 'OutgoingPassword' not in m`], { input: profile, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert(!profile.includes('%EMAILADDRESS%')); assert(profile.includes('&amp;')); assert(profile.includes('&apos;'));
  assert.throws(() => mobileconfig('a@evil.test'));
});
test('HTTP download is private, bounded, retryable, expires and rejects injection without echo', async t => {
  let now = 0;
  const router = createRouter({ now: () => now, ttl: 100, capacity: 1 });
  const app = require('express')(); app.use('/api/mail-setup', router);
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  t.after(() => { router.close(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const post = (body, headers = {}) => fetch(origin+'/api/mail-setup/profile', { method: 'POST', headers: { 'Content-Type': 'text/plain', ...headers }, body });
  for (const input of ['bad@evil.test', '<key>attack</key>@mooncci.site', 'a@mooncci.site\n', 'a'.repeat(600)]) {
    const r = await post(input); assert.equal(r.status, 400); assert.match(r.headers.get('cache-control'), /no-store/); assert(!(await r.text()).includes(input));
  }
  assert.equal((await post('{"email":"a@mooncci.site"}', { 'Content-Type': 'application/json' })).status, 415);
  const response = await post(valid); assert.equal(response.status, 201); const { download } = await response.json();
  assert(!download.includes('@')); assert.match(download, /^\/api\/mail-setup\/profile\/[a-f0-9]{64}\.mobileconfig$/);
  assert.equal((await post(valid)).status, 503);
  assert.equal((await fetch(origin+download, { method: 'HEAD' })).status, 405);
  for (let i=0; i<2; i++) { const r = await fetch(origin+download); assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /application\/x-apple-aspen-config/); assert.match(r.headers.get('content-disposition'), /mooncci-mail.mobileconfig/); assert.match(r.headers.get('cache-control'), /no-store/); assert((await r.text()).includes('Ada.O')); }
  now = 101; assert.equal((await fetch(origin+download)).status, 404); assert.equal((await post(valid)).status, 201);
  assert.equal((await fetch(origin+'/api/mail-setup/profile/../../secrets')).status, 404);
});
test('real app preserves original CSRF and handles malformed JSON without logging email', async t => {
  const app = require('../src/index');
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  const send = headers => fetch(origin+'/api/mail-setup/profile', { method: 'POST', headers: { 'Content-Type': 'text/plain', ...headers }, body: 'Ada@mooncci.site' });
  assert.equal((await send({})).status, 403);
  assert.equal((await send({ 'X-Requested-With': 'XMLHttpRequest', Origin: 'https://evil.test' })).status, 403);
  assert.equal((await send({ 'X-Requested-With': 'XMLHttpRequest', Origin: 'https://mooncci.site' })).status, 201);
  const r = await send({ 'Content-Type': 'application/json' }); assert.equal(r.status, 415); assert.match(r.headers.get('cache-control'), /no-store/);
});
