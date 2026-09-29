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
