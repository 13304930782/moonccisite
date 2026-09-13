const test = require('node:test');
const assert = require('node:assert/strict');
const { exchange, authorizationUrl } = require('../src/lib/socialProviders');
const key = 'a'.repeat(64);
test('GitHub proxy covers token/profile/email, preserves bearer and never rewrites browser authorization', async t => {
  const oldUrl = process.env.GITHUB_OAUTH_PROXY_URL, oldKey = process.env.GITHUB_OAUTH_PROXY_KEY;
  t.after(() => { for (const [name, value] of [['GITHUB_OAUTH_PROXY_URL', oldUrl], ['GITHUB_OAUTH_PROXY_KEY', oldKey]]) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
  process.env.GITHUB_OAUTH_PROXY_URL = 'https://private.example.test'; process.env.GITHUB_OAUTH_PROXY_KEY = key;
  const calls = [];
  t.mock.method(global, 'fetch', async (url, options) => {
    calls.push({url, options});
    return Response.json(calls.length === 1 ? {access_token:'example-token'} : calls.length === 2 ? {id:42,login:'tester'} : [{email:'test@example.test',primary:true,verified:true}]);
  });
  const result = await exchange('github', {client_id:'client'}, 'secret', 'code', 'verifier');
  assert.equal(result.subject, '42'); assert.equal(result.emailVerified, true);
  assert.deepEqual(calls.map(x=>x.url), ['/token','/user','/emails'].map(x=>'https://private.example.test'+x));
  assert.ok(calls.every(x=>x.options.headers['X-Mooncci-Proxy-Key']===key && x.options.redirect==='error'));
  assert.equal(calls[1].options.headers.Authorization, 'Bearer example-token');
  assert.equal(new URL(authorizationUrl('github',{client_id:'client'},'state','verifier')).hostname,'github.com');
  calls.length = 0;
  process.env.GITHUB_OAUTH_PROXY_URL = ''; process.env.GITHUB_OAUTH_PROXY_KEY = '';
  await exchange('github', {client_id:'client'}, 'secret', 'code', 'verifier');
  assert.equal(calls[0].url, 'https://github.com/login/oauth/access_token');
  assert.equal(calls[0].options.headers['X-Mooncci-Proxy-Key'], undefined);
  process.env.GITHUB_OAUTH_PROXY_URL = 'http://unsafe.test'; process.env.GITHUB_OAUTH_PROXY_KEY = key;
  await assert.rejects(exchange('github',{client_id:'client'},'secret','code','verifier'), /proxy_config_invalid/);
});
test('GitHub token exchange is not automatically replayed after ambiguous transport failure', async t => {
  let calls = 0; t.mock.method(global,'fetch',async()=>{calls++;throw new Error('network');});
  await assert.rejects(exchange('github',{client_id:'client'},'secret','code','verifier'));
  assert.equal(calls,1);
});
test('Worker rejects unauthenticated/arbitrary routes and strips secrets from upstream headers', async t => {
  const worker = (await import('../../cloudflare/github-oauth/worker.mjs')).default;
  const env = {GITHUB_OAUTH_PROXY_KEY:key}; let calls = 0;
  t.mock.method(global,'fetch',async(url,options)=>{
    calls++; assert.equal(url,'https://api.github.com/user');
    assert.equal(options.headers['X-Mooncci-Proxy-Key'],undefined);
    assert.equal(options.headers.Cookie,undefined);
    assert.equal(options.headers.Authorization,'Bearer example-token');
    assert.equal(options.cache,'no-store'); assert.equal(options.redirect,'error');
    return Response.json({id:42});
  });
  const make = (path, extra={}) => new Request('https://private.example.test'+path,{headers:{'X-Mooncci-Proxy-Key':key,Authorization:'Bearer example-token',Cookie:'must-not-forward'},...extra});
  assert.equal((await worker.fetch(new Request('https://private.example.test/user'),env)).status,403);
  for(const path of ['/other','/user?url=https://evil.test','/constructor']) assert.equal((await worker.fetch(make(path),env)).status,404);
  assert.equal(calls,0);
  const response = await worker.fetch(make('/user'),env);
  assert.equal(response.headers.get('cache-control'),'no-store, private'); assert.equal((await response.json()).id,42); assert.equal(calls,1);
});

test('Worker token forwarding preserves form data, bounds input and hides upstream exceptions', async t => {
  const worker = (await import('../../cloudflare/github-oauth/worker.mjs')).default;
  const env = {GITHUB_OAUTH_PROXY_KEY:key}; let calls = 0;
  const form = 'client_id=test&client_secret=example&code=example&code_verifier=test';
  const make = body => new Request('https://private.example.test/token',{method:'POST',headers:{'X-Mooncci-Proxy-Key':key,'Content-Type':'application/x-www-form-urlencoded'},body});
  t.mock.method(global,'fetch',async(url,options)=>{
    calls++; assert.equal(url,'https://github.com/login/oauth/access_token'); assert.equal(options.method,'POST');
    assert.equal(new TextDecoder().decode(options.body),form); assert.equal(options.headers['X-Mooncci-Proxy-Key'],undefined);
    if (calls>1) throw new Error('client-secret-must-not-leak');
    return Response.json({access_token:'example'});
  });
  assert.equal((await worker.fetch(make('x'.repeat(16385)),env)).status,502); assert.equal(calls,0);
  const response = await worker.fetch(make(form),env); assert.equal((await response.json()).access_token,'example');
  const failure = await worker.fetch(make(form),env); assert.equal(failure.status,502); assert.ok(!(await failure.text()).includes('client-secret'));
});
