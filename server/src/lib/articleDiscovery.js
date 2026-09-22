const columns='id,title,published_at,updated_at,category';
const pageNumber=value=>Math.min(100000,Math.max(1,Number.isInteger(Number(value))?Number(value):1));
function tags(value){try{return [...new Set((Array.isArray(value)?value:JSON.parse(value||'[]')).filter(x=>typeof x==='string'))].slice(0,20);}catch{return [];}}
function attachDiscovery(router,db){
 const limiter=require('express-rate-limit')({windowMs:60000,limit:60,standardHeaders:true,legacyHeaders:false,message:{message:'Too many requests. Please try again later.'}});
 router.get('/archives',limiter,async(req,res)=>{
  const page=pageNumber(req.query.page),pageSize=50;
  const [months]=await db.query("SELECT DATE_FORMAT(COALESCE(published_at,created_at),'%Y-%m') AS month,COUNT(*) AS count FROM posts WHERE status='published' GROUP BY month ORDER BY month DESC");
  const [items]=await db.query(`SELECT ${columns},DATE_FORMAT(COALESCE(published_at,created_at),'%Y-%m') AS month FROM posts WHERE status='published' ORDER BY COALESCE(published_at,created_at) DESC,id DESC LIMIT ? OFFSET ?`,[pageSize,(page-1)*pageSize]);
  res.json({items,months,total:months.reduce((n,m)=>n+Number(m.count),0),page,pageSize});
 });
 router.get('/:id/discovery',limiter,async(req,res)=>{
  const [[post]]=await db.query("SELECT id,tags,category,COALESCE(published_at,created_at) AS date FROM posts WHERE id=? AND status='published'",[req.params.id]);
  if(!post)return res.status(404).json({message:'文章不存在'});
  const [[previous]]=await db.query(`SELECT ${columns} FROM posts WHERE status='published' AND (COALESCE(published_at,created_at)<? OR (COALESCE(published_at,created_at)=? AND id<?)) ORDER BY COALESCE(published_at,created_at) DESC,id DESC LIMIT 1`,[post.date,post.date,post.id]);
  const [[next]]=await db.query(`SELECT ${columns} FROM posts WHERE status='published' AND (COALESCE(published_at,created_at)>? OR (COALESCE(published_at,created_at)=? AND id>?)) ORDER BY COALESCE(published_at,created_at),id LIMIT 1`,[post.date,post.date,post.id]);
  const tagList=tags(post.tags);
  const score=tagList.length?tagList.map(()=>"COALESCE(JSON_CONTAINS(IF(JSON_VALID(tags),tags,JSON_ARRAY()),JSON_QUOTE(?)),0)").join('+'):'0';
  const [related]=await db.query(`SELECT ${columns},(${score}) AS tag_score,(category=? AND category<>'') AS category_score FROM posts WHERE status='published' AND id<>? HAVING tag_score>0 OR category_score=1 ORDER BY tag_score DESC,category_score DESC,COALESCE(updated_at,published_at) DESC,id DESC LIMIT 3`,[...tagList,post.category||'',post.id]);
  res.json({previous:previous||null,next:next||null,related:related.map(({tag_score,category_score,...p})=>p)});
 });
}
module.exports={attachDiscovery,pageNumber};
