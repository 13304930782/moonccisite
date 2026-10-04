const { createHmac, randomBytes } = require('node:crypto');
const { performance } = require('node:perf_hooks');

const failure = code => Object.assign(new Error(code), { code });

// One serialized lane per account. No operation is replayed after work(client) starts.
class MailboxImapPool {
  constructor({ createClient, validate = async () => true, maxConnections = 1, idleMs = 30000,
    maxQueued = 8, waitMs = 15000, operationMs = 60000 }) {
    this.createClient = createClient;
    this.validate = validate;
    this.maxConnections = maxConnections;
    this.idleMs = idleMs;
    this.maxQueued = maxQueued;
    this.waitMs = waitMs;
    this.operationMs = operationMs;
    this.entries = new Map();
    this.salt = randomBytes(32);
    this.stopping = false;
  }

  identity(account) {
    if (!account.user_id || !account.mailbox_address || !account.smtp_secret) throw failure('IMAP_ACCOUNT_INVALID');
    const key = createHmac('sha256', this.salt).update(JSON.stringify([
      String(account.user_id), account.mailbox_address, account.imap_host, account.imap_port,
    ])).digest('hex');
    const version = createHmac('sha256', this.salt).update(account.smtp_secret).digest('hex');
    return { key, version };
  }

  drop(entry) {
    clearTimeout(entry.timer);
    entry.timer = null;
    const client = entry.client;
    entry.client = null;
    if (client) { try { client.close(); } catch (_) {} }
  }

  invalidate(userId) {
    for (const [key, entry] of this.entries) {
      if (String(userId) !== entry.userId) continue;
      entry.generation += 1;
      this.drop(entry);
      if (!entry.pending) this.entries.delete(key);
    }
  }

  async run(account, work, timing) {
    if (this.stopping) throw failure('IMAP_POOL_STOPPING');
    const { key, version } = this.identity(account);
    // A changed endpoint/address for the same user must not leave another live session.
    for (const [otherKey, other] of this.entries) {
      if (otherKey !== key && other.userId === String(account.user_id)) {
        this.invalidate(account.user_id);
        if (other.pending) throw failure('IMAP_ACCOUNT_CHANGED');
      }
    }
    let entry = this.entries.get(key);
    if (!entry) {
      if (this.entries.size >= this.maxConnections) {
        const idle = [...this.entries].find(([, item]) => item.pending === 0);
        if (!idle) throw failure('IMAP_POOL_LIMIT');
        this.drop(idle[1]); this.entries.delete(idle[0]);
      }
      entry = { userId: String(account.user_id), version, generation: 0, client: null,
        pending: 0, tail: Promise.resolve(), timer: null, connectedBefore: false };
      this.entries.set(key, entry);
    }
    if (entry.version !== version) { entry.generation += 1; this.drop(entry); entry.version = version; }
    if (entry.pending >= this.maxQueued) throw failure('IMAP_POOL_BUSY');
    clearTimeout(entry.timer);
    const generation = entry.generation;
    const queuedAt = performance.now();
    entry.pending += 1;
    const previous = entry.tail;
    let release;
    entry.tail = new Promise(resolve => { release = resolve; });
    let deadline;
    let waitTimer;
    let expired = false;
    const valid = () => {
      if (this.stopping) throw failure('IMAP_POOL_STOPPING');
      if (generation !== entry.generation || version !== entry.version) throw failure('IMAP_ACCOUNT_CHANGED');
      if (expired) throw failure('IMAP_OPERATION_TIMEOUT');
    };
    const finish = () => {
      clearTimeout(deadline);
      entry.pending -= 1;
      release();
      if (!entry.pending) {
        if (this.stopping || !entry.client) { this.drop(entry); this.entries.delete(key); }
        else {
          entry.timer = setTimeout(() => { this.drop(entry); this.entries.delete(key); }, this.idleMs);
          entry.timer.unref?.();
        }
      }
    };
    try {
      await Promise.race([previous, new Promise((_, reject) => {
        waitTimer = setTimeout(() => reject(failure('IMAP_POOL_WAIT_TIMEOUT')), this.waitMs);
      })]);
    } catch (error) {
      // Keep the lane chained until its predecessor exits; a timed-out waiter must not unlock it.
      previous.then(finish);
      throw error;
    } finally {
      clearTimeout(waitTimer);
      timing?.add('pool_wait_ms', performance.now() - queuedAt);
    }
    try {
      valid();
      if (!await this.validate(account, timing)) { this.invalidate(account.user_id); throw failure('IMAP_ACCOUNT_CHANGED'); }
      valid();
      deadline = setTimeout(() => { expired = true; this.drop(entry); }, this.operationMs);
      let reused = false;
      let reconnectCounted = false;
      if (entry.client) {
        try {
          if (!entry.client.usable) throw failure('IMAP_STALE');
          await (timing ? timing.measure('imap_health_ms', () => entry.client.noop()) : entry.client.noop());
          valid();
          reused = true;
        } catch (error) {
          this.drop(entry);
          valid();
          timing?.reconnect();
          reconnectCounted = true;
        }
      }
      if (!entry.client) {
        if (entry.connectedBefore && !reconnectCounted) timing?.reconnect();
        const client = this.createClient(account);
        entry.client = client;
        client.on('error', () => { if (entry.client === client) this.drop(entry); });
        client.on('close', () => { if (entry.client === client) entry.client = null; });
        await (timing ? timing.measure('imap_connect_ms', () => client.connect()) : client.connect());
        valid();
        if (entry.client !== client || !client.usable) throw failure('IMAP_STALE');
        entry.connectedBefore = true;
      }
      timing?.reused(reused);
      const result = await work(entry.client);
      valid();
      return result;
    } catch (error) {
      this.drop(entry);
      throw error;
    } finally { finish(); }
  }

  shutdown() {
    this.stopping = true;
    for (const entry of this.entries.values()) { entry.generation += 1; this.drop(entry); }
    for (const [key, entry] of this.entries) if (!entry.pending) this.entries.delete(key);
  }
}

module.exports = { MailboxImapPool };
