const db=require('../db'),service=require('../services/engagement');
const router=require('../lib/asyncRouter')();
router.use(require('../middleware/auth').authRequired,(_req,res,next)=>service.enabled()?next():res.status(404).json({message:'功能尚未启用。'}));
router.use(require('express-rate-limit')({windowMs:60000,limit:120,standardHeaders:true,legacyHeaders:false}));
router.get('/',async(req,res)=>{
 const [items]=await db.query('SELECT f.id,f.name,COUNT(m.bookmark_id) total FROM bookmark_folders f LEFT JOIN bookmark_folder_members m ON m.folder_id=f.id WHERE f.user_id=? GROUP BY f.id ORDER BY f.id',[req.user.id]);
 const [[r]]=await db.query('SELECT COUNT(*) total FROM article_bookmarks b LEFT JOIN bookmark_folder_members m ON m.bookmark_id=b.id WHERE b.user_id=? AND m.bookmark_id IS NULL',[req.user.id]);
 res.json({items:[{id:0,name:'默认收藏夹',total:Number(r.total)},...items]});
});
router.post('/',async(req,res)=>{
 const name=String(req.body.name||'').trim();if(!name||name.length>60||name==='默认收藏夹')return res.status(400).json({message:'请输入 1–60 字的收藏夹名称。'});
 const r=await service.transaction(async c=>{
 await c.query('SELECT id FROM users WHERE id=? FOR UPDATE',[req.user.id]);
 const [[count]]=await c.query('SELECT COUNT(*) total FROM bookmark_folders WHERE user_id=?',[req.user.id]);if(count.total>=100)throw Object.assign(Error('最多创建 100 个收藏夹。'),{status:400});
 const [r]=await c.query('INSERT INTO bookmark_folders(user_id,name) VALUES (?,?)',[req.user.id,name]);return r;
 });res.json({id:r.insertId,name});
});
router.put('/:id',async(req,res)=>{
 const name=String(req.body.name||'').trim();if(!name||name.length>60||name==='默认收藏夹')return res.status(400).json({message:'收藏夹名称无效。'});
 const [r]=await db.query('UPDATE bookmark_folders SET name=? WHERE id=? AND user_id=?',[name,req.params.id,req.user.id]);res.status(r.affectedRows?200:404).json({ok:!!r.affectedRows});
});
router.delete('/:id',async(req,res)=>{await db.query('DELETE FROM bookmark_folders WHERE id=? AND user_id=?',[req.params.id,req.user.id]);res.json({ok:true});});
router.put('/move/:postId',async(req,res)=>service.transaction(async c=>{
 await c.query('SELECT id FROM users WHERE id=? FOR UPDATE',[req.user.id]);
 const folder=Number(req.body.folder_id);if(!Number.isSafeInteger(folder)||folder<0)throw Object.assign(Error('收藏夹无效。'),{status:400});
 if(folder){const [[f]]=await c.query('SELECT id FROM bookmark_folders WHERE id=? AND user_id=? FOR UPDATE',[folder,req.user.id]);if(!f)throw Object.assign(Error('收藏夹不存在。'),{status:404});}
 const [[b]]=await c.query('SELECT id FROM article_bookmarks WHERE user_id=? AND post_id=? FOR UPDATE',[req.user.id,req.params.postId]);if(!b)throw Object.assign(Error('收藏不存在。'),{status:404});
 if(folder)await c.query('INSERT INTO bookmark_folder_members(bookmark_id,folder_id) VALUES (?,?) ON DUPLICATE KEY UPDATE folder_id=VALUES(folder_id)',[b.id,folder]);
 else await c.query('DELETE FROM bookmark_folder_members WHERE bookmark_id=?',[b.id]);
 res.json({ok:true});
}));
router.use((e,_req,res,_next)=>res.status(e.code==='ER_DUP_ENTRY'?409:e.status||500).json({message:e.code==='ER_DUP_ENTRY'?'收藏夹名称已存在。':e.status?e.message:'操作失败，请重试。'}));
module.exports=router;
