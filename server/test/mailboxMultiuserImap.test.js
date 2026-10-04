const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const tls = require('node:tls');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { monitorEventLoopDelay } = require('node:perf_hooks');
const { ImapFlow } = createRequire(path.join(__dirname, '../src/lib/mailbox-vendor/runtime.js'))('imapflow');
const { MailboxImapPool } = require('../src/lib/mailboxImapPool');
const { MailboxPoolManager } = require('../src/lib/mailboxPoolManager');
const { createTiming } = require('../src/lib/mailboxTiming');
const policy = require('../src/lib/mailboxPoolPolicy');
const account = id => ({ user_id: id, mailbox_address: `user${id}@example.invalid`, smtp_secret: 'fixture-cipher' });

test('real TLS IMAP multi-user SELECT/FETCH remains isolated under 10/20/50-user pressure', async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mooncci-imap-'));
  const openssl = process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl';
  execFileSync(openssl, ['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(temp,'key'),'-out',path.join(temp,'cert'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost'], { stdio: 'ignore' });
  const cert = fs.readFileSync(path.join(temp,'cert')), sockets = new Set(); let connections = 0;
  const server = tls.createServer({ key: fs.readFileSync(path.join(temp,'key')), cert }, socket => {
    connections++; sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
    socket.write('* OK fixture ready\r\n'); let buffer = '', user = '';
    socket.on('data', chunk => {
      buffer += chunk.toString();
      while (buffer.includes('\r\n')) {
        const end = buffer.indexOf('\r\n'), line = buffer.slice(0,end); buffer = buffer.slice(end+2);
        const [tag, command] = line.split(' ');
        if (command === 'CAPABILITY') socket.write('* CAPABILITY IMAP4rev1\r\n');
        else if (command === 'LOGIN') user = line.split(' ')[2].replaceAll('"','');
        else if (command === 'LIST') socket.write('* LIST (\\HasNoChildren) "/" INBOX\r\n');
        else if (command === 'SELECT' || command === 'EXAMINE') socket.write('* FLAGS (\\Seen)\r\n* 1 EXISTS\r\n* 0 RECENT\r\n* OK [UIDVALIDITY 42] valid\r\n* OK [UIDNEXT 2] next\r\n');
        else if (command === 'FETCH') socket.write(`* 1 FETCH (UID 1 FLAGS () RFC822.SIZE 100 INTERNALDATE "04-Oct-2026 00:00:00 +0000" ENVELOPE (NIL "${user}" NIL NIL NIL NIL NIL NIL NIL NIL))\r\n`);
        else if (command === 'LOGOUT') { socket.end('* BYE\r\n' + tag + ' OK bye\r\n'); continue; }
        else if (!['NOOP','CLOSE'].includes(command)) { socket.write(tag+' BAD unsupported\r\n'); continue; }
        socket.write(tag+' OK completed\r\n');
      }
    });
  });
  await new Promise(r => server.listen(0,'127.0.0.1',r));
  const manager = new MailboxPoolManager({ protocol:'imap', limit:6, create: () => new MailboxImapPool({
    createClient: a => new ImapFlow({ host:'127.0.0.1', port:server.address().port, secure:true,
      tls:{ ca:cert, servername:'localhost', rejectUnauthorized:true }, auth:{user:a.mailbox_address,pass:'FixtureOnly42!'}, logger:false, disableAutoIdle:true }),
    validate:async () => true, idleMs:300000,
  }) });
  t.after(async () => { manager.shutdown(); for(const s of sockets) s.destroy(); await new Promise(r=>server.close(r)); fs.rmSync(temp,{recursive:true,force:true}); });
  const read = async a => {
    const timing = createTiming('list');
    await manager.run(a, pool => pool.run(a, async client => {
      const lock = await client.getMailboxLock('INBOX',{readOnly:true});
      try { const rows = await client.fetchAll('1:*',{uid:true,envelope:true,flags:true,size:true}); assert.equal(rows[0].envelope.subject,a.mailbox_address); }
      finally { lock.release(); }
    },timing),{timing}); return timing.snapshot();
  };
  for(const id of [1,2,3]) { await read(account(id)); assert((await read(account(id))).connection_reused); }
  const loop = monitorEventLoopDelay({resolution:10}); loop.enable();
  for(const n of [10,20,50]) {
    const rows = await Promise.all(Array.from({length:n},(_,i)=>read(account(i+10))));
    const q = (key,p) => rows.map(r=>r[key]).sort((a,b)=>a-b)[Math.ceil(n*p)-1];
    assert(manager.entries.size<=6); assert.equal(manager.snapshot().waiting,0);
    console.log(JSON.stringify({fixture:'localhost-TLS-IMAP',users:n,p50:q('total_ms',.5),p95:q('total_ms',.95),p99:q('total_ms',.99),wait_p50:q('pool_wait_ms',.5),wait_p95:q('pool_wait_ms',.95),rss:process.memoryUsage().rss,event_loop_max_ms:loop.max/1e6,...manager.snapshot()}));
  }
  loop.disable(); manager.shutdown(); await delay(50); assert.equal(sockets.size,0); assert.equal(manager.entries.size,0); assert(connections>6);
});

test('fresh DB eligibility rejects disabled/revoked/pending/rotated A without invalidating B', async t => {
  const db = require('../src/db'); let state = 'active';
  t.mock.method(db,'query',async (sql,args) => {
    assert(sql.includes("u.status='active'")); assert(sql.includes("m.status='active'")); assert(sql.includes("p.status='complete'")); assert(!sql.includes("role='owner'"));
    const a = account(args[0]); return [[...(args[0]===1&&['disabled','revoked','pending'].includes(state)?[]:[{...a,smtp_secret:args[0]===1&&state==='rotated'?'new':a.smtp_secret}])]];
  });
  t.after(()=>db.end());
  for(const s of ['disabled','revoked','pending','rotated']) { state=s; assert(!await policy.validateAccount(account(1))); assert(await policy.validateAccount(account(2))); }
  state='active'; assert(await policy.validateAccount(account(1)));
});
