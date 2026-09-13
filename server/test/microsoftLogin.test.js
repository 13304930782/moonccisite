const test=require('node:test'),assert=require('node:assert/strict');
const {authorizationUrl,exchange}=require('../src/lib/socialProviders');
test('Microsoft uses code + PKCE and common account authority',()=>{
 const url=new URL(authorizationUrl('microsoft',{client_id:'client'},'state','verifier'));
 assert.equal(url.origin,'https://login.microsoftonline.com');assert.equal(url.pathname,'/common/oauth2/v2.0/authorize');
 assert.equal(url.searchParams.get('scope'),'openid profile email');assert.equal(url.searchParams.get('response_type'),'code');
 assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('state'),'state');
 assert.equal(url.searchParams.get('redirect_uri'),'https://mooncci.site/api/auth/microsoft/callback');
});
test('Microsoft identity comes from authenticated userinfo, never auto-verifies email',async t=>{
 const calls=[];t.mock.method(global,'fetch',async(url,options)=>{calls.push({url,options});return Response.json(calls.length===1?{access_token:'opaque-token'}:{sub:'stable_subject',name:'Example',email:'existing@example.test'});});
 const identity=await exchange('microsoft',{client_id:'client'},'test-secret','test-code','verifier');
 assert.equal(identity.subject,'stable_subject');assert.equal(identity.emailVerified,false);assert.equal(identity.email,'');
 assert.equal(new URLSearchParams(calls[0].options.body).get('code_verifier'),'verifier');
 assert.equal(calls[1].url,'https://graph.microsoft.com/oidc/userinfo');assert.equal(calls[1].options.headers.Authorization,'Bearer opaque-token');
});
