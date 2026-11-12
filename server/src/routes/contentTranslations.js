const defaultDb=require('../db');
const auth=require('../middleware/auth');
const {fields,validate,read,missingText,failure}=require('../lib/contentTranslations');
function createContentTranslations({db=defaultDb,authRequired=auth.authRequired,adminOnly=auth.adminOnly,readSettingsSource}={}){
const router=require('../lib/asyncRouter')();
const routeLimiter=require('express-rate-limit')({windowMs:60000,limit:120,standardHeaders:true,legacyHeaders:false});
router.use(authRequired,adminOnly,(_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
async function source(type,id,connection=db){
 if(!fields[type]||!id||id.length>255)throw failure('Invalid translation record');
 if(['site','blog_pages','now'].includes(type)){
  if(id!=='1')throw failure('Invalid translation record');
  if(type==='now'){const [[row]]=await connection.query('SELECT content FROM site_now WHERE id=1');return row||{content:''};}
  if(readSettingsSource)return readSettingsSource(type);
  const keys=type==='site'?['brand','profile','hero','footer']:['blog_pages'];
  const [rows]=await connection.query('SELECT setting_key,setting_value FROM site_settings WHERE setting_key IN (?)',[keys]);
  const result=Object.fromEntries(rows.map(row=>[row.setting_key,typeof row.setting_value==='string'?JSON.parse(row.setting_value):row.setting_value]));
  return type==='site'?result:result.blog_pages||{};
 }

 const sql={project:'SELECT name,summary,content FROM projects WHERE id=?',update:'SELECT content FROM updates WHERE id=?',series:'SELECT title,description FROM article_series WHERE id=?',category:"SELECT id FROM posts WHERE category=? LIMIT 1",tag:"SELECT id FROM posts WHERE JSON_CONTAINS(tags,JSON_QUOTE(?)) LIMIT 1"}[type];
 const [[row]]=await connection.query(sql,[id]);if(!row)throw failure('Content not found',404);return ['category','tag'].includes(type)?{name:id}:row;
}
router.get('/:type/:id',routeLimiter,async(req,res)=>{
 const original=await source(req.params.type,req.params.id);
 res.json({...await read(db,req.params.type,req.params.id)||{draft:{},published:null,version:0,locale:'en'},source:original});
});
router.put('/:type/:id',routeLimiter,async(req,res)=>{
 const {type,id}=req.params;const original=await source(type,id);
 const payload=validate(type,req.body.draft);
 const version=req.body.version;
 const action=req.body.action||'save';
 if(action==='publish'){const missing=missingText(type,original,payload);if(missing.length)throw failure('发布前请完整填写英文译文。缺少字段：'+missing[0]);}
 if(!Number.isSafeInteger(version)||version<0||!['save','publish','withdraw'].includes(action))throw failure('Invalid translation version or action');
 const connection=await db.getConnection();
 try{
  await connection.beginTransaction();
  const [[current]]=await connection.query('SELECT version FROM content_translations WHERE entity_type=? AND entity_id=? AND locale=? FOR UPDATE',[type,id,'en']);
  if((current?.version||0)!==version)throw failure('Translation changed. Reload before saving.',409);
  if(!current)await connection.query('INSERT INTO content_translations(entity_type,entity_id,locale,draft,version) VALUES (?,?,?,?,1)',[type,id,'en',JSON.stringify(payload)]);
  else await connection.query('UPDATE content_translations SET draft=?,version=version+1 WHERE entity_type=? AND entity_id=? AND locale=?',[JSON.stringify(payload),type,id,'en']);
  if(action==='publish')await connection.query('UPDATE content_translations SET published=?,published_source=?,published_at=UTC_TIMESTAMP() WHERE entity_type=? AND entity_id=? AND locale=?',[JSON.stringify(payload),JSON.stringify(original),type,id,'en']);
  if(action==='withdraw')await connection.query('UPDATE content_translations SET published=NULL WHERE entity_type=? AND entity_id=? AND locale=?',[type,id,'en']);
  await connection.commit();res.json({...await read(db,type,id),source:original});
 }catch(error){await connection.rollback();if(error.code==='ER_DUP_ENTRY')throw failure('Translation changed. Reload before saving.',409);throw error;}finally{connection.release();}
});
router.use((error,_req,res,next)=>{if(error.status)return res.status(error.status).json({code:error.code||'INVALID_TRANSLATION',message:error.message});next(error);});
return router;
}
module.exports=createContentTranslations();
module.exports.createContentTranslations=createContentTranslations;
