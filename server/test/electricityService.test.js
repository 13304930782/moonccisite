const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchElectricitySnapshot, parsePayload, requiredCredentials, SCHOOL_ENDPOINT } = require('../src/lib/electricity');

const credentials = { account: 'school-account', roomVerify: 'secret-room-token' };
const env = { ELECTRICITY_SCHOOL_ACCOUNT: credentials.account, ELECTRICITY_ROOM_VERIFY: credentials.roomVerify };
const record = { mac: 'M-1', todayuse: '1.25', sumbuy: '8.5', sumsub: '4', odd: '12.5', price: '0.54' };
const responseText = (body = { result: '0', modlist: [record] }) => JSON.stringify({ code_: 0, result_: true, body: JSON.stringify(body) });

test('requires credentials without exposing their values', () => {
  assert.throws(() => requiredCredentials({}), (error) => error.code === 'ELECTRICITY_NOT_CONFIGURED' && !error.message.includes('secret'));
});

test('parses the nested response and normalizes numbers', () => {
  const body = { roomfullname: 'A-101', result: '0', modlist: [record] };
  const result = parsePayload(responseText(body), credentials, new Date('2026-09-01T13:00:00Z'));
  assert.equal(result.roomName, 'A-101');
  assert.equal(result.todayUse, 1.25);
  assert.equal(result.totalRemaining, 12.5);
  assert.equal(result.roomVerify, credentials.roomVerify);
});

test('invalid outer JSON is rejected safely', () => {
  assert.throws(() => parsePayload('{bad json', credentials, new Date()), (error) => error.code === 'ELECTRICITY_INVALID_JSON');
});

test('invalid nested JSON is rejected', () => {
  assert.throws(() => parsePayload(JSON.stringify({ code_: 0, result_: true, body: 'bad' }), credentials, new Date()), (error) => error.code === 'ELECTRICITY_INVALID_BODY');
});

test('unsuccessful outer response is rejected', () => {
  assert.throws(() => parsePayload(JSON.stringify({ code_: 1, result_: false, body: '{}' }), credentials, new Date()), (error) => error.code === 'ELECTRICITY_UPSTREAM_REJECTED');
});

test('missing modlist is rejected', () => {
  assert.throws(() => parsePayload(responseText({ result: '0', modlist: [] }), credentials, new Date()), (error) => error.code === 'ELECTRICITY_EMPTY_RESULT');
});

test('non-zero body result is rejected', () => {
  assert.throws(() => parsePayload(responseText({ result: '1', modlist: [record] }), credentials, new Date()), (error) => error.code === 'ELECTRICITY_EMPTY_RESULT');
});

test('missing optional data fields normalize to safe empty values', () => {
  const result = parsePayload(responseText({ roomfullname: 'A-101', result: '0', modlist: [{}] }), credentials, new Date());
  assert.equal(result.todayUse, null);
  assert.equal(result.totalRemaining, null);
  assert.deepEqual(result.weekUsage, []);
});

test('uses only the fixed school endpoint and browser-like headers', async () => {
  let captured;
  await fetchElectricitySnapshot({ env, now: () => Date.parse('2026-09-01T13:00:00Z'), fetchImpl: async (url, init) => {
    captured = { url, init };
    return { ok: true, headers: { get: () => null }, text: async () => responseText() };
  }});
  const url = new URL(captured.url);
  assert.equal(`${url.origin}${url.pathname}`, SCHOOL_ENDPOINT);
  assert.equal(url.searchParams.get('customercode'), '2252');
  assert.equal(JSON.parse(url.searchParams.get('param')).cmd, 'h5_getstuindexpage');
  assert.equal(captured.init.method, 'POST');
  assert.match(captured.init.headers['User-Agent'], /Mozilla/);
});

test('HTTP failures return a safe typed error', async () => {
  await assert.rejects(fetchElectricitySnapshot({ env, fetchImpl: async () => ({ ok: false, status: 503 }) }), (error) => error.code === 'ELECTRICITY_HTTP_ERROR');
});

test('oversized responses are rejected', async () => {
  await assert.rejects(fetchElectricitySnapshot({ env, fetchImpl: async () => ({ ok: true, headers: { get: () => String(600000) }, text: async () => '' }) }), (error) => error.code === 'ELECTRICITY_RESPONSE_TOO_LARGE');
});

test('request timeout aborts and returns a safe error', async () => {
  const fetchImpl = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  await assert.rejects(fetchElectricitySnapshot({ env, fetchImpl, timeoutMs: 5 }), (error) => error.code === 'ELECTRICITY_TIMEOUT');
});
