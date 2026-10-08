const path = require('node:path');
const { fork } = require('node:child_process');
const { parseLocation } = require('./weatherLocation');
function createGlobalIpLookup({ timeoutMs = 8000, idleMs = 60000 } = {}) {
  let child, idle, sequence = 0;
  const pending = new Map();
  function stop(error = new Error('IP database lookup stopped')) {
    const current = child;
    child = null;
    clearTimeout(idle);
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
    pending.clear();
    current?.kill();
  }
  function start() {
    const worker = fork(path.join(__dirname, 'weatherGlobalIpWorker.js'), [], {
      execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      env: process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot } : {},
    });
    child = worker;
    worker.unref();
    worker.on('error', () => { if (child === worker) stop(new Error('IP database process unavailable')); });
    worker.on('exit', () => { if (child === worker) stop(new Error('IP database process exited')); });
    worker.on('message', result => {
      if (child !== worker || !result || !Number.isSafeInteger(result.id)) return;
      const request = pending.get(result.id);
      if (!request) return;
      clearTimeout(request.timer);
      pending.delete(result.id);
      if (result.error) request.reject(new Error('IP database lookup failed'));
      else request.resolve(result.info);
      if (!pending.size) {
        worker.channel?.unref();
        idle = setTimeout(() => stop(), idleMs);
        idle.unref();
      }
    });
    return worker;
  }
  function lookup(ip) {
    if (pending.size >= 32) return Promise.reject(new Error('IP database lookup busy'));
    clearTimeout(idle);
    const worker = child || start();
    worker.channel?.ref();
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => stop(new Error('IP database lookup timeout')), timeoutMs);
      pending.set(id, { resolve, reject, timer });
      worker.send({ id, ip }, error => { if (error && child === worker) stop(new Error('IP database communication failed')); });
    });
  }
  lookup.close = stop;
  return lookup;
}
const lookupGlobalIp = createGlobalIpLookup();
function globalIpCity(info) {
  const code = info?.country?.iso_code;
  const name = info?.city?.names?.['zh-CN'] || info?.city?.names?.en;
  if (!/^[A-Z]{2}$/.test(code || '') || code === 'CN' || !name) return null;
  const location = info?.location;
  if (!Number.isFinite(location?.latitude) || !Number.isFinite(location?.longitude)) return null;
  return parseLocation({
    name, countryCode: code, provider: 'dbip',
    region: [...new Set([info.country.names?.['zh-CN'] || info.country.names?.en, ...(info.subdivisions || []).map(p => p.names?.['zh-CN'] || p.names?.en)].filter(Boolean))].join(' · '),
    latitude: location.latitude, longitude: location.longitude,
  });
}
module.exports = { lookupGlobalIp, globalIpCity, createGlobalIpLookup };
