const test=require('node:test'),assert=require('node:assert/strict');
test('English system mail uses recipient preference and preserves authored contents without sending SMTP',async t=>{
 const db=require('../src/db'),nodemailer=require('nodemailer'),captured=[];
 const config={enabled:'true',smtp_host:'smtp.invalid',smtp_user:'sender@example.test',smtp_pass:'unused',smtp_from:'sender@example.test',notify_to:'english@example.test',site_url:'https://example.test',early_access_download_url:'https://example.test/download'};
 t.mock.method(db,'query',async(sql,args)=>{if(sql.includes('FROM site_settings'))return [[{setting_value:JSON.stringify(config)}]];if(sql.includes('FROM users'))return [[{ui_locale:args[0]==='english@example.test'?'en':'zh-CN'}]];throw Error(sql);});
 t.mock.method(nodemailer,'createTransport',()=>({sendMail:async mail=>captured.push(mail)}));
 const mailer=require('../src/lib/mailer'),electricity=require('../src/lib/electricityMailer'),{subscriptionConfirmation,newsletterMessage}=require('../src/lib/contentMail');
 const comment={postId:4,postTitle:'原始文章',authorName:'真实用户名',authorEmail:'english@example.test',content:'中文用户评论'};
 await mailer.sendCommentNotification(comment);await mailer.sendCommentReviewNotification(comment,'visible');await mailer.sendCommentReviewNotification(comment,'rejected');
 await mailer.sendUserPermissionsNotification({role:'user',status:'disabled',can_comment:0},{email:'english@example.test',username:'真实用户名',role:'editor',status:'active',can_comment:1});
 const application={id:1,email:'english@example.test',name:'真实用户名',occupation:'用户职业',device:'Mac',desiredFeatures:['用户需求']};await mailer.sendEarlyAccessOwnerNotification(application);await mailer.sendEarlyAccessApprovalEmail(application);
 await electricity.sendElectricityDailyReport({snapshot:{snapshotDate:'2026-11-04',totalRemaining:200},metrics:{estimatedDaysRemaining:25},status:'normal',period:'morning'});await electricity.sendElectricityLowAlert({snapshot:{snapshotDate:'2026-11-04',totalRemaining:2},status:'low'});
 for(const result of [subscriptionConfirmation('https://example.test/confirm','https://example.test/unsubscribe','en'),newsletterMessage([{type:'post',title:'原始文章',excerpt:'中文用户评论',path:'/article/4'}],'https://example.test','https://example.test/unsubscribe','en')])captured.push({...result,subject:'newsletter'});
 for(const mail of captured){assert.match(mail.html,/<html lang="en"/);const display=(mail.subject+mail.text+mail.html).replace(/原始文章|真实用户名|中文用户评论|用户职业|用户需求/g,'');assert.doesNotMatch(display,/[\u3400-\u9fff]/);}
 assert.ok(captured[0].html.includes('中文用户评论'));
 await mailer.sendCommentReviewNotification({...comment,authorEmail:'chinese@example.test'},'visible');assert.match(captured.at(-1).html,/<html lang="zh-CN"/);assert.match(captured.at(-1).html,/你的评论已通过审核/);
 await db.end();
});
