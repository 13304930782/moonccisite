#!/usr/bin/env node

const BASE_URL = (process.env.SMOKE_BASE_URL || 'https://mooncci.site').replace(/\/$/, '');
const EMAIL = process.env.SMOKE_EMAIL || '';
const PASSWORD = process.env.SMOKE_PASSWORD || '';
const POST_ID = process.env.SMOKE_POST_ID || '';

const results = [];

function pass(name, detail = '') {
  results.push({ ok: true, name, detail });
  console.log(`OK   ${name}${detail ? ` - ${detail}` : ''}`);
}

function fail(name, detail = '') {
  results.push({ ok: false, name, detail });
  console.error(`FAIL ${name}${detail ? ` - ${detail}` : ''}`);
}

async function readJson(res) {
  const text = await res.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { __raw: text.slice(0, 300) };
  }
}

function getCookie(headers) {
  const setCookie = headers.get('set-cookie') || '';
  const token = setCookie.split(';')[0];
  return token.includes('=') ? token : '';
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.json ? { 'Content-Type': 'application/json' } : {}),
      ...(options.write ? { 'X-Requested-With': 'XMLHttpRequest' } : {}),
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.headers || {}),
    },
    body: options.json ? JSON.stringify(options.json) : options.body,
  });

  const data = await readJson(res);
  return { res, data };
}

async function expectStatus(name, path, expected, options = {}) {
  const { res, data } = await request(path, options);

  if (res.status === expected) {
    pass(name, `${res.status}`);
  } else {
    fail(name, `expected ${expected}, got ${res.status}, body=${JSON.stringify(data).slice(0, 180)}`);
  }

  return { res, data };
}

async function main() {
  console.log(`Mooncci smoke test: ${BASE_URL}`);
  console.log('Sensitive values are never printed.');

  await expectStatus('health endpoint', '/api/health', 200);

  const noHeaderLogout = await expectStatus(
    'write guard blocks POST without X-Requested-With',
    '/api/auth/logout',
    403,
    { method: 'POST' }
  );

  if (!String(noHeaderLogout.data?.message || '').includes('request')) {
    fail('write guard message shape', JSON.stringify(noHeaderLogout.data).slice(0, 120));
  } else {
    pass('write guard message shape');
  }

  const posts = await expectStatus('public posts list', '/api/posts', 200);

  if (Array.isArray(posts.data)) {
    pass('public posts returns array', `${posts.data.length} item(s)`);
  } else {
    fail('public posts returns array', JSON.stringify(posts.data).slice(0, 120));
  }

  if (!EMAIL || !PASSWORD) {
    console.log('SKIP authenticated checks: set SMOKE_EMAIL and SMOKE_PASSWORD to enable them.');
    return;
  }

  const login = await expectStatus('owner/admin login', '/api/auth/login', 200, {
    method: 'POST',
    write: true,
    json: {
      email: EMAIL,
      password: PASSWORD,
    },
  });

  const cookie = getCookie(login.res.headers);

  if (!cookie) {
    fail('login sets auth cookie');
    return;
  }

  pass('login sets auth cookie');

  const me = await expectStatus('auth/me restores identity', '/api/auth/me', 200, { cookie });
  const role = me.data?.user?.role || '';

  if (['owner', 'admin', 'editor', 'user'].includes(role)) {
    pass('auth/me role is valid', role);
  } else {
    fail('auth/me role is valid', JSON.stringify(me.data).slice(0, 120));
  }

  await expectStatus('site settings readable', '/api/settings/site', 200, { cookie });

  if (['owner', 'admin', 'editor'].includes(role)) {
    const media = await expectStatus('media library list', '/api/upload/media?status=active', 200, { cookie });

    if (Array.isArray(media.data)) {
      pass('media library returns array', `${media.data.length} item(s)`);
    } else {
      fail('media library returns array', JSON.stringify(media.data).slice(0, 120));
    }

    await expectStatus('admin posts permission for writer', '/api/admin/posts', 200, { cookie });
  }

  if (['owner', 'admin'].includes(role)) {
    await expectStatus('admin comments permission', '/api/admin/comments?status=all', 200, { cookie });
    await expectStatus('admin users permission', '/api/admin/users', 200, { cookie });
  }

  if (POST_ID) {
    const comments = await expectStatus('comments list for selected post', `/api/comments/post/${encodeURIComponent(POST_ID)}`, 200, { cookie });

    if (Array.isArray(comments.data)) {
      pass('comments returns array', `${comments.data.length} item(s)`);
    } else {
      fail('comments returns array', JSON.stringify(comments.data).slice(0, 120));
    }
  } else {
    console.log('SKIP comments list: set SMOKE_POST_ID to test a specific post comment list.');
  }

  await expectStatus('logout works with write header', '/api/auth/logout', 200, {
    method: 'POST',
    write: true,
    cookie,
  });
}

try {
  await main();
} catch (err) {
  fail('unexpected smoke-test crash', err?.stack || err?.message || String(err));
}

const failed = results.filter((item) => !item.ok);

console.log('');
console.log(`Smoke test summary: ${results.length - failed.length}/${results.length} passed`);

if (failed.length) {
  process.exitCode = 1;
}
