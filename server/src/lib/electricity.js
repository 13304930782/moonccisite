const { finiteNumber } = require('./electricityMetrics');

const SCHOOL_ENDPOINT = 'https://xqh5.17wanxiao.com/smartWaterAndElectricityService/SWAEServlet';
const DEFAULT_TIMEOUT_MS = 12000;
const MAX_RESPONSE_BYTES = 512 * 1024;

class ElectricityUpstreamError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'ElectricityUpstreamError';
    this.code = code;
    this.cause = cause;
  }
}

function requiredCredentials(env = process.env) {
  const account = String(env.ELECTRICITY_SCHOOL_ACCOUNT || '').trim();
  const roomVerify = String(env.ELECTRICITY_ROOM_VERIFY || '').trim();
  if (!account || !roomVerify) {
    throw new ElectricityUpstreamError('ELECTRICITY_NOT_CONFIGURED', '宿舍电量查询凭据尚未配置');
  }
  return { account, roomVerify };
}

function normalizeSeries(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const source = item && typeof item === 'object' ? item : {};
    const label = source.date ?? source.day ?? source.time ?? source.name ?? String(index + 1);
    const amount = finiteNumber(source.use ?? source.usage ?? source.electricity ?? source.value ?? source.y);
    return amount === null ? null : { label: String(label).slice(0, 32), value: amount };
  }).filter(Boolean).slice(-31);
}

function pickFirst(source, names) {
  for (const name of names) {
    if (source[name] !== undefined && source[name] !== null && source[name] !== '') return source[name];
  }
  return null;
}

function normalizeRecord(record, credentials, fetchedAt, body = {}) {
  const source = record && typeof record === 'object' ? record : {};
  return {
    roomName: String(pickFirst(body, ['roomfullname', 'roomFullname']) || pickFirst(source, ['roomname', 'roomName', 'room_name']) || '').slice(0, 255),
    roomVerify: credentials.roomVerify,
    meterId: String(pickFirst(source, ['mac', 'meterid', 'meterId', 'ammeterid', 'meter_no']) || '').slice(0, 100),
    deviceName: String(pickFirst(source, ['devicename', 'deviceName', 'ammetername']) || '').slice(0, 255),
    status: String(pickFirst(source, ['status', 'devicestatus', 'state']) || '').slice(0, 64),
    todayUse: finiteNumber(pickFirst(source, ['todayuse', 'todayUse', 'dayuse', 'dayUse'])),
    purchasedRemaining: finiteNumber(pickFirst(source, ['sumbuy', 'purchasedremaining', 'purchasedRemaining', 'buybalance', 'buyBalance', 'balance'])),
    subsidyRemaining: finiteNumber(pickFirst(source, ['sumsub', 'subsidyremaining', 'subsidyRemaining', 'subsidybalance', 'subsidyBalance', 'givebalance'])),
    totalRemaining: finiteNumber(pickFirst(source, ['odd', 'totalremaining', 'totalRemaining', 'remain', 'remaining', 'totalbalance'])),
    price: finiteNumber(pickFirst(source, ['price', 'electricityprice', 'unitprice'])),
    weekUsage: normalizeSeries(pickFirst(source, ['weekuselist', 'weekusage', 'weekUsage', 'weeklist', 'weekList'])),
    monthUsage: normalizeSeries(pickFirst(source, ['monthuselist', 'monthusage', 'monthUsage', 'monthlist', 'monthList'])),
    fetchedAt: fetchedAt.toISOString(),
  };
}

async function readLimitedText(response, maxBytes = MAX_RESPONSE_BYTES) {
  const length = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(length) && length > maxBytes) {
    throw new ElectricityUpstreamError('ELECTRICITY_RESPONSE_TOO_LARGE', '学校接口响应超过安全限制');
  }
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ElectricityUpstreamError('ELECTRICITY_RESPONSE_TOO_LARGE', '学校接口响应超过安全限制');
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text;
  throw new ElectricityUpstreamError('ELECTRICITY_RESPONSE_TOO_LARGE', '学校接口响应超过安全限制');
}

function parsePayload(text, credentials, fetchedAt) {
  let outer;
  try { outer = JSON.parse(text); } catch (error) {
    throw new ElectricityUpstreamError('ELECTRICITY_INVALID_JSON', '学校接口返回了无法解析的数据', error);
  }
  if (!outer || String(outer.code_) !== '0' || !['true', '1'].includes(String(outer.result_).toLowerCase()) || typeof outer.body !== 'string') {
    throw new ElectricityUpstreamError('ELECTRICITY_UPSTREAM_REJECTED', '学校接口未返回成功结果');
  }
  let body;
  try { body = JSON.parse(outer.body); } catch (error) {
    throw new ElectricityUpstreamError('ELECTRICITY_INVALID_BODY', '学校接口业务数据无法解析', error);
  }
  if (!body || String(body.result) !== '0' || !Array.isArray(body.modlist) || !body.modlist[0]) {
    throw new ElectricityUpstreamError('ELECTRICITY_EMPTY_RESULT', '学校接口没有返回有效电量数据');
  }
  return normalizeRecord(body.modlist[0], credentials, fetchedAt, body);
}

async function fetchElectricitySnapshot(options = {}) {
  const env = options.env || process.env;
  const credentials = requiredCredentials(env);
  const fetchedAt = options.now ? new Date(options.now()) : new Date();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const payload = {
    cmd: 'h5_getstuindexpage',
    roomverify: credentials.roomVerify,
    account: credentials.account,
    timestamp: fetchedAt.getTime(),
  };
  const query = new URLSearchParams({
    param: JSON.stringify(payload),
    customercode: String(env.ELECTRICITY_CUSTOMER_CODE || '2252'),
    method: 'h5_getstuindexpage',
    command: String(env.ELECTRICITY_COMMAND || 'OWNWaterElecService'),
  });
  try {
    const response = await (options.fetchImpl || global.fetch)(`${SCHOOL_ENDPOINT}?${query}`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 Mooncci-Electricity-Monitor/1.0',
        Origin: 'https://xqh5.17wanxiao.com',
        Referer: 'https://xqh5.17wanxiao.com/userwaterelecmini/index.html',
      },
    });
    if (!response.ok) throw new ElectricityUpstreamError('ELECTRICITY_HTTP_ERROR', `学校接口暂时不可用（HTTP ${response.status}）`);
    return parsePayload(await readLimitedText(response), credentials, fetchedAt);
  } catch (error) {
    if (error instanceof ElectricityUpstreamError) throw error;
    if (error?.name === 'AbortError') throw new ElectricityUpstreamError('ELECTRICITY_TIMEOUT', '学校接口请求超时');
    throw new ElectricityUpstreamError('ELECTRICITY_NETWORK_ERROR', '无法连接学校电量接口', error);
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  SCHOOL_ENDPOINT,
  ElectricityUpstreamError,
  fetchElectricitySnapshot,
  normalizeRecord,
  parsePayload,
  requiredCredentials,
};
