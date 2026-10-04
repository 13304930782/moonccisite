const { performance } = require('node:perf_hooks');
const { randomUUID } = require('node:crypto');

const stages = new Set(['db_pool_wait_ms', 'db_prepare_ms', 'mime_build_ms', 'smtp_submit_ms',
  'db_accept_ms', 'account_lookup_ms', 'imap_connect_ms', 'folder_lookup_ms', 'mailbox_select_ms',
  'fetch_ms', 'metadata_fetch_ms', 'source_fetch_ms', 'parse_ms', 'flags_ms',
  'imap_sent_lookup_ms', 'imap_append_ms', 'pool_wait_ms', 'imap_health_ms']);
let windowStart = 0;
let emitted = 0;

// Deliberately accepts only numeric stages and fixed metadata, never arbitrary objects/errors.
function createTiming(operation, { now = () => performance.now(), emit = line => console.info(line),
  env = process.env, random = Math.random } = {}) {
  if (!['send', 'list', 'read'].includes(operation)) throw new Error('Invalid mailbox operation');
  const start = now();
  const values = Object.fromEntries([...stages].map(name => [name, 0]));
  let reused = false;
  let reconnects = 0;
  let finished = false;
  const requestId = randomUUID();
  const add = (name, value) => {
    if (stages.has(name) && Number.isFinite(value) && value >= 0) values[name] += value;
  };
  return {
    requestId,
    add,
    start(name) { const began = now(); let done = false; return () => { if (!done) { done = true; add(name, now() - began); } }; },
    async measure(name, work) { const began = now(); try { return await work(); } finally { add(name, now() - began); } },
    reused(value) { reused = value === true; },
    reconnect() { reconnects += 1; },
    snapshot() { return { ...values, connection_reused: reused, reconnect_count: reconnects, total_ms: now() - start }; },
    finish(status = 200, aborted = false) {
      if (finished) return;
      finished = true;
      if (env.MAILBOX_TIMING_ENABLED !== 'true') return;
      const total = now() - start;
      const rate = Math.max(0, Math.min(1, Number(env.MAILBOX_TIMING_SAMPLE_RATE ?? 0.1) || 0));
      if (status < 400 && !aborted && total < 3000 && random() >= rate) return;
      const wall = Date.now();
      if (wall - windowStart >= 60000) { windowStart = wall; emitted = 0; }
      const cap = Math.max(1, Math.min(600, Number(env.MAILBOX_TIMING_MAX_PER_MINUTE) || 60));
      if (emitted >= cap) return;
      emitted += 1;
      const numeric = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Math.round(v * 10) / 10]));
      try { emit(JSON.stringify({ event: 'mailbox_timing', request_id: requestId, operation,
        status: Number.isInteger(status) ? status : 500, aborted: aborted === true,
        ...numeric, connection_reused: reused, reconnect_count: reconnects, total_ms: Math.round(total * 10) / 10 })); }
      catch (_) { /* Observability must not change mail outcomes. */ }
    },
  };
}

function middleware(operation) {
  return (req, res, next) => {
    req.mailTiming = createTiming(operation);
    res.setHeader('X-Mail-Request-ID', req.mailTiming.requestId);
    res.once('finish', () => req.mailTiming.finish(res.statusCode));
    res.once('close', () => { if (!res.writableFinished) req.mailTiming.finish(res.statusCode, true); });
    next();
  };
}

module.exports = { createTiming, middleware };
