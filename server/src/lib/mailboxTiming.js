const { performance } = require('node:perf_hooks');
const { randomUUID } = require('node:crypto');

const stages = new Set(['db_pool_wait_ms', 'db_prepare_ms', 'mime_build_ms', 'smtp_submit_ms',
  'db_accept_ms', 'account_lookup_ms', 'imap_connect_ms', 'folder_lookup_ms', 'mailbox_select_ms',
  'fetch_ms', 'metadata_fetch_ms', 'source_fetch_ms', 'parse_ms', 'flags_ms',
  'imap_sent_lookup_ms', 'imap_append_ms', 'pool_wait_ms', 'imap_health_ms', 'smtp_connect_ms', 'smtp_pool_wait_ms']);
let windowStart = 0;
let emitted = 0;
let poolWindow = 0, poolEmitted = 0;
const poolFields = ['cold_connection_count', 'connection_expired', 'connection_broken', 'noop_failure_count', 'active_pooled_connections'];
const routes = new Set(['/api/mailboxes/me', '/api/mailboxes/sent', '/api/mailboxes/send',
  '/api/mailboxes/folders/inbox', '/api/mailboxes/folders/sent',
  '/api/mailboxes/folders/inbox/:uid', '/api/mailboxes/folders/sent/:uid']);
function poolEvent(event) {
  if (process.env.MAILBOX_TIMING_ENABLED !== 'true') return;
  if (!['connected', 'expired', 'broken', 'noop_failed', 'invalidated', 'shutdown', 'evicted', 'operation_timeout'].includes(event.reason)) return;
  const wall = Date.now();
  if (wall - poolWindow >= 60000) { poolWindow = wall; poolEmitted = 0; }
  if (poolEmitted++ >= 60) return;
  const data = Object.fromEntries(poolFields.map(k => [k, Number.isSafeInteger(event[k]) && event[k] >= 0 ? event[k] : 0]));
  const id = /^[a-f0-9-]{36}$/.test(event.request_id || '') ? event.request_id : null;
  try { console.info(JSON.stringify({ event: 'mailbox_pool', at: new Date(wall).toISOString(), reason: event.reason, request_id: id, ...data })); } catch (_) {}
}

// Deliberately accepts only numeric stages and fixed metadata, never arbitrary objects/errors.
function createTiming(operation, { now = () => performance.now(), emit = line => console.info(line),
  env = process.env, random = Math.random, path = null, ingress = 'UNKNOWN' } = {}) {
  if (!['send', 'list', 'read', 'account', 'history'].includes(operation)) throw new Error('Invalid mailbox operation');
  const start = now();
  const values = Object.fromEntries([...stages].map(name => [name, 0]));
  let reused = false;
  let reconnects = 0;
  let smtpReused = false, smtpReconnects = 0;
  const smtp = { smtp_queue_id: null, smtp_envelope_ms: null, smtp_message_ms: null,
    smtp_message_bytes: null, smtp_started_at: null, smtp_completed_at: null };
  let finished = false;
  const requestId = randomUUID();
  const add = (name, value) => {
    if (stages.has(name) && Number.isFinite(value) && value >= 0) values[name] += value;
  };
  return {
    requestId,
    add,
    start(name) { const began = now(); let done = false; return () => { if (!done) { done = true; add(name, now() - began); } }; },
    async measure(name, work) {
      const began = now();
      if (name === 'smtp_submit_ms') smtp.smtp_started_at = new Date().toISOString();
      try { return await work(); } finally {
        add(name, now() - began);
        if (name === 'smtp_submit_ms') smtp.smtp_completed_at = new Date().toISOString();
      }
    },
    smtpResult(info) {
      // Public sendMail result only; never retain response text, message ID, headers or envelope.
      // Observability must not turn an accepted message into an uncertain send.
      try {
        for (const [key, source] of [['smtp_envelope_ms', 'envelopeTime'], ['smtp_message_ms', 'messageTime'], ['smtp_message_bytes', 'messageSize']]) {
          const value = info?.[source];
          if (Number.isSafeInteger(value) && value >= 0) smtp[key] = value;
        }
        const response = info?.response;
        const match = typeof response === 'string' && response.length <= 256
          ? /^250[ -]2\.0\.0 Ok: queued as ([A-Za-z0-9]{5,32})\s*$/.exec(response) : null;
        smtp.smtp_queue_id = match ? match[1] : null;
      } catch (_) { /* Preserve the existing delivery outcome. */ }
    },
    reused(value) { reused = value === true; },
    reconnect() { reconnects += 1; },
    smtpReused(value) { smtpReused = value === true; },
    smtpReconnect() { smtpReconnects++; },
    snapshot() { return { ...values, connection_reused: reused, reconnect_count: reconnects,
      smtp_connection_reused: smtpReused, smtp_reconnect_count: smtpReconnects, total_ms: now() - start }; },
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
        completed_at: new Date(wall).toISOString(), request_path: routes.has(path) ? path : null,
        ingress: ['CN_DIRECT', 'US_PROXY'].includes(ingress) ? ingress : 'UNKNOWN',
        status: Number.isInteger(status) ? status : 500, aborted: aborted === true,
        ...numeric, ...(operation === 'send' ? smtp : {}), connection_reused: reused, reconnect_count: reconnects,
        smtp_connection_reused: smtpReused, smtp_reconnect_count: smtpReconnects, total_ms: Math.round(total * 10) / 10 })); }
      catch (_) { /* Observability must not change mail outcomes. */ }
    },
  };
}

function middleware(operation) {
  return (req, res, next) => {
    const route = '/api/mailboxes' + req.path.replace(/\/\d+\/?$/, '/:uid').replace(/\/$/, '');
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket?.remoteAddress);
    req.mailTiming = createTiming(operation, { path: route,
      ingress: local ? req.get('X-Mooncci-Mail-Ingress') : 'UNKNOWN' });
    res.setHeader('X-Mail-Request-ID', req.mailTiming.requestId);
    res.once('finish', () => req.mailTiming.finish(res.statusCode));
    res.once('close', () => { if (!res.writableFinished) req.mailTiming.finish(res.statusCode, true); });
    next();
  };
}

module.exports = { createTiming, middleware, poolEvent };
