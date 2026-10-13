const crypto=require('node:crypto');
// Bind the generated description to the exact editorial inputs, including code.
function source(input){return JSON.stringify({title:String(input.title||''),content:String(input.content||''),category:String(input.category||''),tags:Array.isArray(input.tags)?input.tags:[]});}
const digest=p=>crypto.createHash('sha256').update(source(p)).digest('hex');
function signature(p){
 const secret=process.env.JWT_SECRET;
 if(!secret||secret.length<32)throw Object.assign(new Error('摘要签名密钥未配置。'),{status:503});
 return crypto.createHmac('sha256',secret).update('article-summary:v1:'+digest(p)+':'+String(p.summary)).digest('hex');
}
function valid(p){try{const actual=String(p.summary_receipt||'');return /^[a-f0-9]{64}$/.test(actual)&&crypto.timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(signature(p),'hex'));}catch{return false;}}
function assertReady(p){if(p.summary_mode==='ai'&&!valid(p))throw Object.assign(new Error('正文或标题已变化，请重新生成 AI 简介后发布。'),{status:422});}
module.exports={source,digest,signature,valid,assertReady};
