const { createHmac, randomBytes } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const failure = code => Object.assign(new Error(code), { code });

// Admission covers BOTH retained and per-request sessions. Each resource owns one
// account lane; no active lane is evicted and no operation is replayed here.
class MailboxPoolManager {
  constructor({ protocol, create, limit, idleMs = 300000, waitMs = 15000,
    maxWaiting = 64, perAccountWaiting = 8, observe = () => {} }) {
    if (!['imap', 'smtp'].includes(protocol) || !Number.isInteger(limit) || limit < 1 || limit > 8) throw Error('Invalid pool budget');
    Object.assign(this, { protocol, create, limit, idleMs, waitMs, maxWaiting, perAccountWaiting, observe });
    this.entries = new Map(); this.queue = []; this.salt = randomBytes(32); this.stopping = false;
    this.counts = { evictions: 0, idle_expired: 0, broken: 0, reconnects: 0, fallback: 0 };
  }
  identity(account) {
    if (!account.user_id || !account.mailbox_address || !account.smtp_secret) throw failure('MAIL_POOL_ACCOUNT_INVALID');
    const digest = value => createHmac('sha256', this.salt).update(JSON.stringify(value)).digest('hex');
    return { key: digest(String(account.user_id)), version: digest([String(account.user_id), account.mailbox_address,
      account.smtp_secret, account.imap_host, account.imap_port, account.smtp_host, account.smtp_port]) };
  }
  snapshot() {
    const active = [...this.entries.values()].filter(e => e.busy).length;
    return { active, idle: this.entries.size - active, waiting: this.queue.length, global_limit: this.limit, ...this.counts };
  }
  record(reason, timing) {
    try { this.observe({ protocol: this.protocol, reason, request_id: timing?.requestId, ...this.snapshot() }); } catch (_) {}
  }
  resourceEvent(event) {
    if (event.reason !== 'broken' && event.reason !== 'noop_failed') return;
    if (event.reason === 'broken') this.counts.broken++;
    this.record(event.reason);
  }
  destroy(entry, reason) {
    clearTimeout(entry.timer); entry.invalid = true;
    entry.resource.shutdown();
    // Retain a busy reservation until its operation has actually settled.
    if (!entry.busy) this.entries.delete(entry.key);
    if (reason in this.counts) this.counts[reason]++;
    this.record(reason);
  }
  invalidate(userId) {
    const key = createHmac('sha256', this.salt).update(JSON.stringify(String(userId))).digest('hex');
    const entry = this.entries.get(key);
    if (entry) this.destroy(entry, 'invalidated');
    for (const task of [...this.queue]) if (task.key === key) this.cancel(task, 'MAIL_POOL_INVALIDATED');
    this.drain();
  }
  cancel(task, code) {
    const index = this.queue.indexOf(task);
    if (index < 0) return;
    this.queue.splice(index, 1); clearTimeout(task.timer);
    this.waitTiming(task); task.reject(failure(code)); this.record('wait_rejected', task.timing);
  }
  waitTiming(task) {
    task.timing?.add(this.protocol === 'imap' ? 'pool_wait_ms' : 'smtp_pool_wait_ms', performance.now() - task.began);
  }
  run(account, work, { retain = true, timing } = {}) {
    if (this.stopping) return Promise.reject(failure('MAIL_POOL_STOPPING'));
    let identity;
    try { identity = this.identity(account); } catch (error) { return Promise.reject(error); }
    const { key, version } = identity, old = this.entries.get(key);
    if (old && (old.version !== version || old.retain !== retain)) this.invalidate(account.user_id);
    // Cancel old credentials even when that user is still waiting for admission.
    for (const task of [...this.queue]) if (task.key === key && (task.version !== version || task.retain !== retain)) this.cancel(task, 'MAIL_POOL_INVALIDATED');
    if (this.queue.length >= this.maxWaiting || this.queue.filter(t => t.key === key).length >= this.perAccountWaiting)
      return Promise.reject(failure('MAIL_POOL_BUSY'));
    return new Promise((resolve, reject) => {
      const task = { key, version, account, work, retain, timing, resolve, reject, began: performance.now() };
      task.timer = setTimeout(() => { this.cancel(task, 'MAIL_POOL_WAIT_TIMEOUT'); this.drain(); }, this.waitMs);
      this.queue.push(task); this.drain();
    });
  }
  drain() {
    if (this.stopping || this.draining) return;
    this.draining = true;
    try {
    for (const task of [...this.queue]) {
      let entry = this.entries.get(task.key);
      if (entry?.busy) continue;
      if (!entry && this.entries.size >= this.limit) {
        const idle = [...this.entries.values()].filter(e => !e.busy).sort((a, b) => a.lastUsed - b.lastUsed)[0];
        if (!idle) continue;
        this.destroy(idle, 'evictions');
      }
      if (!entry) {
        try { entry = { key: task.key, version: task.version, retain: task.retain, resource: this.create(task.account, task.retain, event => this.resourceEvent(event)), busy: false, invalid: false }; }
        catch (error) { this.cancel(task, 'MAIL_POOL_RESOURCE_FAILED'); continue; }
        this.entries.set(task.key, entry);
      }
      this.queue.splice(this.queue.indexOf(task), 1); clearTimeout(task.timer); clearTimeout(entry.timer);
      entry.busy = true;
      this.waitTiming(task);
      if (!task.retain) this.counts.fallback++;
      this.record('acquired', task.timing);
      this.execute(entry, task);
    }
    } finally { this.draining = false; }
  }
  async execute(entry, task) {
    try {
      const result = await task.work(entry.resource);
      // Never convert SMTP accepted into failure due to a post-acceptance revoke.
      task.resolve(result);
    } catch (error) { this.destroy(entry, 'broken'); task.reject(error); }
    finally {
      const snapshot = task.timing?.snapshot?.();
      this.counts.reconnects += Number(snapshot?.[this.protocol === 'imap' ? 'reconnect_count' : 'smtp_reconnect_count'] || 0);
      entry.busy = false; entry.lastUsed = performance.now();
      if (entry.invalid || this.stopping || !task.retain) this.destroy(entry, 'released');
      else {
        entry.timer = setTimeout(() => { this.destroy(entry, 'idle_expired'); this.drain(); }, this.idleMs);
        entry.timer.unref?.();
      }
      this.record('released', task.timing); this.drain();
    }
  }
  shutdown() {
    this.stopping = true;
    for (const task of [...this.queue]) this.cancel(task, 'MAIL_POOL_STOPPING');
    for (const entry of this.entries.values()) this.destroy(entry, 'shutdown');
  }
}
module.exports = { MailboxPoolManager };
