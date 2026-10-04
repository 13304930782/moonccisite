const {test}=require('node:test');const assert=require('node:assert/strict');
const {createTiming}=require('../src/lib/mailboxTiming');
function observed(info,operation='send'){
 let line;const timing=createTiming(operation,{env:{MAILBOX_TIMING_ENABLED:'true',MAILBOX_TIMING_SAMPLE_RATE:'1',MAILBOX_TIMING_MAX_PER_MINUTE:'600'},emit:s=>line=JSON.parse(s)});
 timing.smtpResult(info);timing.finish();return line;
}
test('extracts public timings and queue ID only',()=>{const r=observed({response:'250 2.0.0 Ok: queued as B563688836',envelopeTime:600,messageTime:301,messageSize:356,auth:'SECRET',envelope:'PRIVATE',messageId:'PRIVATE'});assert.equal(r.smtp_queue_id,'B563688836');assert.equal(r.smtp_envelope_ms,600);assert.equal(r.smtp_message_ms,301);assert.equal(r.smtp_message_bytes,356);assert(!JSON.stringify(r).includes('PRIVATE'));assert(!JSON.stringify(r).includes('SECRET'));});
test('rejects response injection and arbitrary text',()=>{for(const response of ['250 2.0.0 Ok: queued as ID123\nSECRET','500 SECRET','250 2.0.0 Ok: queued as '+ 'a'.repeat(1000)])assert.equal(observed({response}).smtp_queue_id,null);});
test('rejects non-numeric and negative metadata',()=>{const r=observed({envelopeTime:'secret',messageTime:-2,messageSize:Infinity});assert.equal(r.smtp_envelope_ms,null);assert.equal(r.smtp_message_ms,null);assert.equal(r.smtp_message_bytes,null);});
test('does not change result if observation getter fails',()=>{assert.doesNotThrow(()=>observed({get response(){throw Error('secret');}}));});
test('does not add SMTP metadata to other operations',()=>assert(!('smtp_queue_id' in observed({},'list'))));
test('records submit timestamps on success and failure without retries',async()=>{for(const fail of [false,true]){let calls=0,line;const t=createTiming('send',{env:{MAILBOX_TIMING_ENABLED:'true',MAILBOX_TIMING_SAMPLE_RATE:'1',MAILBOX_TIMING_MAX_PER_MINUTE:'600'},emit:s=>line=JSON.parse(s)});try{await t.measure('smtp_submit_ms',async()=>{calls++;if(fail)throw Error('failure');});}catch{}t.finish();assert.equal(calls,1);assert(Number.isFinite(Date.parse(line.smtp_started_at)));assert(Number.isFinite(Date.parse(line.smtp_completed_at)));}});
