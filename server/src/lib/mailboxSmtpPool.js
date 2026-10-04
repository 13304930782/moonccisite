const tls = require('node:tls');
const net = require('node:net');
const { randomBytes, createHmac } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const failure = code => Object.assign(new Error(code), { code });

// A single serialized SMTP lane. No sendMail invocation is ever replayed.
// getSocket is Nodemailer's public hook; SMTP commands remain entirely in Nodemailer.
class MailboxSmtpPool {
  constructor({ createTransport, password, validate, connect = options => tls.connect(options),
    idleMs = 300000, activeMs = 30000, operationMs = 60000, connectMs = 15000, waitMs = 15000, maxQueued = 8 }) {
    Object.assign(this, { createTransport, password, validate, connect, idleMs, activeMs, operationMs, connectMs, waitMs, maxQueued });
    this.salt = randomBytes(32);
    this.tail = Promise.resolve();
    this.entry = null;
    this.pending = 0;
    this.generation = 0;
    this.stopping = false;
  }
  identity(account) {
    if (!account.user_id || !account.smtp_secret || !account.mailbox_address || !account.smtp_host) throw failure('SMTP_ACCOUNT_INVALID');
    return createHmac('sha256', this.salt).update(JSON.stringify([
      String(account.user_id), account.mailbox_address, account.smtp_host, account.smtp_port, account.smtp_secret,
    ])).digest('hex');
  }
  drop() {
    const entry = this.entry;
    this.entry = null;
    if (!entry) return;
    entry.closed = true;
    clearTimeout(entry.idleTimer);
    try { entry.transport.close(); } catch (_) {}
    // Public socket handles let revocation and operation timeout close even busy pools.
    for (const socket of entry.sockets) socket.destroy();
  }
  invalidate(userId) {
    if (this.entry && this.entry.userId !== String(userId)) return;
    this.generation++;
    this.drop();
  }
  shutdown() { this.stopping = true; this.generation++; this.drop(); }
  make(account, key) {
    const entry = { key, userId: String(account.user_id), closed: false, sockets: new Set(), connections: 0, timing: null };
    const getSocket = (_options, callback) => {
      if (entry.closed || this.stopping) return callback(failure('SMTP_POOL_CLOSED'));
      const began = performance.now();
      let done = false;
      const socket = this.connect({ host: account.smtp_host, port: account.smtp_port,
        servername: net.isIP(account.smtp_host) ? undefined : account.smtp_host, rejectUnauthorized: true });
      entry.sockets.add(socket);
      const finish = (error) => {
        if (done) return;
        done = true; clearTimeout(timer);
        entry.timing?.add('smtp_connect_ms', performance.now() - began);
        if (error || entry.closed || this.stopping) { socket.destroy(); callback(error || failure('SMTP_POOL_CLOSED')); }
        else { entry.connections++; callback(null, { connection: socket, secured: true }); }
      };
      const timer = setTimeout(() => finish(failure('SMTP_CONNECT_TIMEOUT')), this.connectMs);
      timer.unref?.();
      socket.once('secureConnect', () => finish());
      socket.on('error', error => finish(error)); // absorb teardown errors, never log their payload
      socket.once('close', () => { entry.sockets.delete(socket); finish(failure('SMTP_CONNECTION_CLOSED')); });
    };
    entry.transport = this.createTransport({ host: account.smtp_host, port: account.smtp_port, secure: true, requireTLS: true,
      auth: { user: account.mailbox_address, pass: this.password(account) },
      pool: true, maxConnections: 1, maxMessages: 50, maxRequeues: 0,
      connectionTimeout: this.connectMs, greetingTimeout: 15000, socketTimeout: this.activeMs,
      logger: false, debug: false, getSocket });
    return entry;
  }
  send(account, mail, timing) {
    if (this.stopping) return Promise.reject(failure('SMTP_POOL_STOPPING'));
    if (this.pending >= this.maxQueued + 1) return Promise.reject(failure('SMTP_POOL_BUSY'));
    const queuedAt = performance.now(), generation = this.generation;
    this.pending++;
    return new Promise((resolve, reject) => {
      let cancelled = false;
      const waitTimer = setTimeout(() => { cancelled = true; reject(failure('SMTP_POOL_WAIT_TIMEOUT')); }, this.waitMs);
      this.tail = this.tail.then(async () => {
        clearTimeout(waitTimer);
        if (cancelled) { this.pending--; return; }
        timing?.add('smtp_pool_wait_ms', performance.now() - queuedAt);
        let operationTimer;
        try {
          if (this.stopping || generation !== this.generation) throw failure('SMTP_POOL_INVALIDATED');
          if (!await this.validate(account)) throw failure('SMTP_ACCOUNT_INVALID');
          if (this.stopping || generation !== this.generation) throw failure('SMTP_POOL_INVALIDATED');
          const key = this.identity(account);
          if (this.entry && this.entry.key !== key) this.drop();
          const entry = this.entry || (this.entry = this.make(account, key));
          clearTimeout(entry.idleTimer);
          entry.timing = timing;
          const before = entry.connections;
          const reusable = [...entry.sockets].some(s => !s.destroyed);
          timing?.smtpReused(reusable);
          // Keep the existing 30-second active inactivity timeout, even after a long idle period.
          for (const socket of entry.sockets) socket.setTimeout(this.activeMs);
          const info = await Promise.race([entry.transport.sendMail(mail), new Promise((_, fail) => {
            operationTimer = setTimeout(() => { this.drop(); fail(failure('SMTP_OPERATION_TIMEOUT')); }, this.operationMs);
          })]);
          timing?.smtpReused(reusable && entry.connections === before);
          if (before && entry.connections > before) timing?.smtpReconnect();
          entry.timing = null;
          if (!entry.closed) {
            // Only idle sockets get the longer timeout. Lease expiry is independent of traffic.
            for (const socket of entry.sockets) socket.setTimeout(this.idleMs + 15000);
            entry.idleTimer = setTimeout(() => { if (this.entry === entry) this.drop(); }, this.idleMs);
            entry.idleTimer.unref?.();
          }
          resolve(info);
        } catch (error) { this.drop(); reject(error); }
        finally { clearTimeout(operationTimer); this.pending--; }
      });
    });
  }
}
module.exports = { MailboxSmtpPool };
