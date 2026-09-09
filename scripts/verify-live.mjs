// Read-only deployment checks. Uses Node's built-in modules; no npm install.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const hash = data => createHash('sha256').update(data).digest('hex');

export async function verifyLive(origin, packageRoot, { timeout = 10000 } = {}) {
  const base = new URL(origin);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('请提供站点根地址，例如 https://mooncci.site，不含账号、路径或参数');
  }
  const expected = await readFile(join(packageRoot, 'dist/index.html'));
  const manifest = JSON.parse(await readFile(join(packageRoot, 'dist/asset-manifest.json'), 'utf8'));
  const entry = manifest['index.html'];
  if (!entry?.isEntry || !entry.file) throw new Error('缺少构建入口清单');
  const files = new Set();
  const visited = new Set();
  function collect(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const item = manifest[key];
    if (!item?.file) throw new Error(`清单缺少静态依赖：${key}`);
    files.add(item.file);
    for (const css of item.css || []) files.add(css);
    for (const dependency of item.imports || []) collect(dependency);
  }
  collect('index.html');
  for (const file of files) {
    if (!/^assets\/[a-zA-Z0-9_./-]+\.(js|css)$/.test(file) || file.split('/').includes('..')) throw new Error('构建资源路径不合法');
  }
  const checks = [];
  async function check(label, path, validate) {
    try {
      // No Cookie/Authorization, no redirects, no cache-busting parameter:
      // inspect the public response a visitor actually receives.
      const response = await fetch(new URL(path, base), { redirect: 'error', signal: AbortSignal.timeout(timeout) });
      const body = Buffer.from(await response.arrayBuffer());
      await validate(response, body);
      checks.push({ label, ok: true });
    } catch (error) {
      checks.push({ label, ok: false, message: error.message });
    }
  }
  function insist(condition, message) { if (!condition) throw new Error(message); }
  await check('首页版本', '/', (response, body) => {
    insist(response.status === 200, `HTTP ${response.status}`);
    insist(/text\/html/i.test(response.headers.get('content-type') || ''), '首页不是 HTML');
    insist(hash(body) === hash(expected), '首页与部署包不一致：检查部署目录、CDN 缓存或 HTML 改写');
  });
  for (const file of files) {
    const local = await readFile(join(packageRoot, 'dist', file));
    await check(`入口资源 ${file}`, `/${file}`, (response, body) => {
      insist(response.status === 200, `HTTP ${response.status}`);
      const type = response.headers.get('content-type') || '';
      insist(file.endsWith('.css') ? /text\/css/i.test(type) : /(?:java|ecma)script/i.test(type), '资源 MIME 类型异常，可能回退到了 HTML');
      insist(hash(body) === hash(local), '资源内容与部署包不一致');
    });
  }
  for (const [label, path, status] of [
    ['API 健康接口', '/api/health', 200],
    ['匿名会话接口', '/api/auth/me', 401],
    ['匿名管理接口隔离', '/api/admin/users?page=1&pageSize=1', 401],
  ]) {
    await check(label, path, (response, body) => {
      insist(response.status === status, `预期 HTTP ${status}，收到 ${response.status}`);
      insist(/application\/json/i.test(response.headers.get('content-type') || ''), 'API 未返回 JSON，检查 Nginx /api 代理');
      const data = JSON.parse(body.toString('utf8'));
      insist(data && typeof data === 'object' && !Array.isArray(data), 'API 响应结构异常');
      if (status === 200) insist(data.ok === true, '健康检查未通过');
      if (path === '/api/auth/me' || path === '/api/health') {
        insist(/(?:^|,)\s*no-store(?:\s|,|$)/i.test(response.headers.get('cache-control') || ''), '响应缺少 no-store，检查代理缓存');
      }
    });
  }
  return checks;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (!process.argv[2]) throw new Error('用法：node verify-live.mjs https://mooncci.site [部署包目录]');
    const checks = await verifyLive(process.argv[2], process.argv[3] || dirname(fileURLToPath(import.meta.url)));
    for (const result of checks) console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.label}${result.message ? `：${result.message}` : ''}`);
    console.log('只读检查完成；未验证真实登录/退出、邮件投递或学校 API。失败不会自动回滚。');
    process.exitCode = checks.every(result => result.ok) ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
