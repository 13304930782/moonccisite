const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), { spawnSync } = require('node:child_process');
const { autoconfig } = require('../server/src/lib/mailClient');
test('checked-in public XML is generated from the canonical config and parses', () => {
  assert.equal(fs.readFileSync('public/mail/config-v1.1.xml', 'utf8'), autoconfig());
  const result = spawnSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-c', `import sys,xml.etree.ElementTree as E
r=E.fromstring(sys.stdin.read());assert r.tag=='clientConfig' and r.attrib['version']=='1.1'
p=r.find('emailProvider');assert p.attrib['id']=='mooncci.site' and p.findtext('domain')=='mooncci.site'
for tag,kind,port,tls in [('incomingServer','imap','993','SSL'),('outgoingServer','smtp','587','STARTTLS')]:
 s=p.find(tag);assert s.attrib['type']==kind
 assert s.findtext('hostname')=='mail.cuegroveapp.com' and s.findtext('port')==port
 assert s.findtext('socketType')==tls and s.findtext('username')=='%EMAILADDRESS%'
 assert s.findtext('authentication')=='password-cleartext'
assert not r.findall('.//password')`], { input: autoconfig(), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
