const test=require('node:test'),assert=require('node:assert/strict');
test('mail transport preserves separate business senders and Unicode content after security upgrade',async()=>{
 const nodemailer=require('nodemailer');
 for(const sender of ['websiteaccount','electricity','notifications','news','promptdock','support']){
  const transport=nodemailer.createTransport({jsonTransport:true});
  const result=await transport.sendMail({from:{name:'mooncci 通知',address:sender+'@mooncci.site'},to:'reader@example.invalid',replyTo:'support@mooncci.site',subject:'订阅确认',text:'确认订阅与取消订阅',html:'<p>确认订阅与取消订阅</p>'});
  const mail=JSON.parse(result.message);
  assert.equal(mail.from.address,sender+'@mooncci.site');
  assert.equal(mail.subject,'订阅确认');assert.equal(mail.text,'确认订阅与取消订阅');
  assert.equal(mail.replyTo[0].address,'support@mooncci.site');
 }
});
test('IPv6 link-local classification covers the full fe80::/10 range',()=>{
 const {Address6}=require('ip-address');
 for(const ip of ['fe80::1','fe90::1','febf::1'])assert.equal(new Address6(ip).isLinkLocal(),true,ip);
 assert.equal(new Address6('2001:4860:4860::8888').isLinkLocal(),false);
});

test('long malformed IPv6 zones are rejected without blocking the process',()=>{
 const {spawnSync}=require('node:child_process');
 const source=`const assert=require('node:assert/strict'),{Address6}=require('ip-address');assert.equal(new Address6('fe80::1%eth0').zone,'%eth0');for(const code of [10,13,8232,8233])assert.equal(Address6.isValid('%'.repeat(300000)+String.fromCharCode(code)),false);`;
 const result=spawnSync(process.execPath,['-e',source],{cwd:require('node:path').join(__dirname,'..'),timeout:5000,encoding:'utf8'});
 assert.equal(result.status,0,result.error?.message||result.stderr);
});

test('query serialization handles untrusted non-callable toString values',()=>{
 const qs=require('qs');
 for(const data of [JSON.parse('{"a":[{"toString":"untrusted"}]}'),qs.parse('a[0][toString]=untrusted',{allowPrototypes:true}),qs.parse('a[0][b]=c',{plainObjects:true})]){
  for(const encodeValuesOnly of [false,true])assert.doesNotThrow(()=>qs.stringify(data,{arrayFormat:'comma',encodeValuesOnly}));
 }
 assert.equal(qs.stringify({a:['first','second']},{arrayFormat:'comma'}),'a=first%2Csecond');
});

test('outbound and inbound mail parsers do not turn comments or quoted text into recipients',async()=>{
 const transport=require('nodemailer').createTransport({jsonTransport:true});
 const {simpleParser}=require('mailparser');
 for(const [input,expected,envelope=expected] of [
  ['Person (outer(inner) <wrong@example.invalid>) <right@example.invalid>','right@example.invalid'],
  ['Team: (text; <wrong@example.invalid>) <right@example.invalid>;','right@example.invalid'],
  ['<"part@wrong.invalid>"@right.invalid>','"part@wrong.invalid>"@right.invalid','"part@wrong.invalid "@right.invalid'],
 ]){
  const result=await transport.sendMail({from:'sender@example.invalid',to:input,subject:'parser regression',text:'no email is sent'});
  assert.deepEqual(result.envelope.to,[envelope]);
  const incoming=await simpleParser('To: '+input+'\r\nSubject: parser regression\r\n\r\nmessage');
  assert.deepEqual(incoming.to.value.flatMap(value=>value.group||[value]).map(value=>value.address),[expected]);
 }
});

test('compressed body teardown survives late trailing bytes',()=>{
 const {spawnSync}=require('node:child_process');
 const source=`
  const assert=require('node:assert/strict'),http=require('node:http'),{gzipSync}=require('node:zlib'),parser=require('body-parser').json();
  const server=http.createServer((req,res)=>parser(req,res,error=>{assert.ifError(error);assert.deepEqual(req.body,{ok:true});res.end('ok');}));
  server.listen(0,'127.0.0.1',()=>{
   const body=Buffer.concat([gzipSync(Buffer.from('{"ok":true}')),Buffer.from([0]),Buffer.alloc(100*1024,88)]);
   const req=http.request({host:'127.0.0.1',port:server.address().port,method:'POST',agent:false,headers:{'content-type':'application/json','content-encoding':'gzip','content-length':body.length}},res=>{
    assert.equal(res.statusCode,200);res.resume();
    // Late decoder errors can arrive after the response has already finished.
    res.once('end',()=>setTimeout(()=>server.close(()=>process.stdout.write('survived')),200));
   });req.on('error',error=>{throw error});req.end(body);
  });
 `;
 const result=spawnSync(process.execPath,['-e',source],{cwd:require('node:path').join(__dirname,'..'),timeout:5000,encoding:'utf8'});
 assert.equal(result.status,0,result.error?.message||result.stderr);assert.equal(result.stdout,'survived');
});
