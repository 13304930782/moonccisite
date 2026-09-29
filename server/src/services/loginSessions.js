const crypto=require('crypto');
const db=require('../db');
const enabled=()=>process.env.ACCOUNT_OPERATIONS_ENABLED==='true';
const hash=token=>crypto.createHash('sha256').update(token).digest('hex');
function device(ua=''){
 const browser=/Edg[A/]/i.test(ua)?'Microsoft Edge':/Firefox|FxiOS/i.test(ua)?'Firefox':/Chrome|CriOS/i.test(ua)?'Chrome':/Safari/i.test(ua)?'Safari':'其他浏览器';
 const os=/Android/i.test(ua)?'Android':/iPhone|iPad/i.test(ua)?'iOS / iPadOS':/Windows/i.test(ua)?'Windows':/Macintosh|Mac OS/i.test(ua)?'macOS':/Linux/i.test(ua)?'Linux':'未知系统';
 return {browser,os};
}
async function register(req,payload,token){
 const tokenHash=hash(token),now=Date.now();
 let [[session]]=await db.query('SELECT id,last_seen FROM login_sessions WHERE token_hash=? AND user_id=?',[tokenHash,payload.id]);
 if(!session){
  const d=device(req.get?req.get('user-agent'):req.headers['user-agent']);
  await db.query('INSERT IGNORE INTO login_sessions(id,user_id,token_hash,started_at,first_seen,last_seen,expires_at,browser,os,legacy) VALUES (?,?,?,?,?,?,?,?,?,?)',
   [crypto.randomUUID(),payload.id,tokenHash,payload.sessionStartedAt||Number(payload.iat||0)*1000,Number(payload.iat||0)*1000||now,now,Number(payload.exp||0)*1000||now+7*86400000,d.browser,d.os,Number(payload.sv!==1)]);
  [[session]]=await db.query('SELECT id,last_seen FROM login_sessions WHERE token_hash=? AND user_id=?',[tokenHash,payload.id]);
 }else if(now-Number(session.last_seen)>=300000){
  await db.query('UPDATE login_sessions SET last_seen=? WHERE id=? AND last_seen<?',[now,session.id,now-300000]);
 }
 req.loginSessionId=session.id;
}
module.exports={enabled,hash,device,register};
