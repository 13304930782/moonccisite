// Keep sensitive routes bounded even when mounted independently of the main app.
const routeLimiter = require('express-rate-limit')({windowMs:60000,limit:200,standardHeaders:true,legacyHeaders:false});
const router=require('../lib/asyncRouter')();
const db=require('../db');
const crypto=require('crypto');
const jwt=require('jsonwebtoken');
const {authRequired,getAuthTokenFromRequest}=require('../middleware/auth');
const {clearAuthCookie,setAuthCookie}=require('../lib/authSession');
const {enabled,hash}=require('../services/loginSessions');
router.use(authRequired);
router.get('/security-config',(_req,res)=>res.json({enabled:enabled()}));
router.use((_req,res,next)=>enabled()?next():res.status(404).json({message:'会话管理尚未启用。'}));
router.get('/sessions',routeLimiter,async(req,res)=>{
 const [items]=await db.query(`SELECT s.id,s.first_seen,s.last_seen,s.expires_at,s.browser,s.os,s.legacy
 FROM login_sessions s WHERE s.user_id=? AND s.expires_at>?
 AND NOT EXISTS(SELECT 1 FROM auth_revocations r WHERE r.token_hash=s.token_hash)
 AND NOT EXISTS(SELECT 1 FROM auth_invalidations i WHERE i.user_id=s.user_id AND i.invalid_before>=s.started_at)
 ORDER BY s.last_seen DESC LIMIT 100`,[req.user.id,Date.now()]);
 res.json({items:items.map(s=>({...s,current:s.id===req.loginSessionId})),activityThrottleSeconds:300});
});
router.delete('/sessions/:id',routeLimiter,async(req,res)=>{
 const [[session]]=await db.query('SELECT token_hash,expires_at FROM login_sessions WHERE id=? AND user_id=?',[req.params.id,req.user.id]);
 if(!session)return res.status(404).json({message:'会话不存在。'});
 await db.query('INSERT IGNORE INTO auth_revocations(token_hash,expires_at) VALUES (?,?)',[session.token_hash,session.expires_at]);
 const current=session.token_hash===hash(getAuthTokenFromRequest(req));if(current)clearAuthCookie(req,res);
 res.json({ok:true,current});
});
router.post('/sessions/revoke-others',routeLimiter,async(req,res)=>{
 const token=getAuthTokenFromRequest(req),payload=jwt.verify(token,process.env.JWT_SECRET),c=await db.getConnection();let fresh;
 try{
 await c.beginTransaction();
 const [[user]]=await c.query('SELECT id,status FROM users WHERE id=? FOR UPDATE',[req.user.id]);
 const [[invalid]]=await c.query('SELECT invalid_before FROM auth_invalidations WHERE user_id=?',[req.user.id]);
 const [[revoked]]=await c.query('SELECT token_hash FROM auth_revocations WHERE token_hash=?',[hash(token)]);
 if(!user||user.status!=='active'||revoked||Number(invalid?.invalid_before||0)>=(payload.sessionStartedAt||Number(payload.iat||0)*1000)){
  await c.rollback();return res.status(401).json({message:'当前登录已失效，请重新登录。'});
 }
 const cutoff=Date.now();
 await c.query('INSERT INTO auth_invalidations(user_id,invalid_before) VALUES (?,?) ON DUPLICATE KEY UPDATE invalid_before=GREATEST(invalid_before,VALUES(invalid_before))',[user.id,cutoff]);
 // Retain the original expiration; rotate only this browser's token.
 fresh=jwt.sign({...payload,sessionStartedAt:cutoff+1,jti:crypto.randomUUID(),sv:1},process.env.JWT_SECRET);
 const d=require('../services/loginSessions').device(req.get('user-agent'));
 await c.query('INSERT INTO login_sessions(id,user_id,token_hash,started_at,first_seen,last_seen,expires_at,browser,os,legacy) VALUES (?,?,?,?,?,?,?,?,?,0)',
 [crypto.randomUUID(),user.id,hash(fresh),cutoff+1,Number(payload.iat||0)*1000||cutoff,cutoff,Number(payload.exp||0)*1000||cutoff+7*86400000,d.browser,d.os]);
 await c.commit();
 }catch(e){await c.rollback();throw e;}finally{c.release();}
 setAuthCookie(req,res,fresh);res.json({ok:true});
});
module.exports=router;

