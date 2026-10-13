// One confirmed public-content fix; run against the installed server, never a full migration.
const path=require('node:path'),crypto=require('node:crypto');
const expected={id:16,title:'2024.11.13C语言——数组',version:2,content:'c23b7c991e9f6663c5d79664bda6ae4bd2211789a9a7d0370fb2c2138c95ac9f',summary:'77a0cc68f7d453652e5fc3a6fe42743c27f774e2293c00daec96ef6a011cd245'};
const replacement='这篇 C 语言课堂笔记记录数组的定义方式，给出数组声明与整数数组处理的代码示例。示例使用循环读入十个整数，通过相邻元素的比较与交换进行冒泡排序，再遍历输出排序后的数组，展示数组下标和循环在排序练习中的用法。';
const sha=value=>crypto.createHash('sha256').update(String(value||'')).digest('hex');
async function main(){
 const live=path.resolve(process.argv[2]||'');if(!process.argv[2]||!process.argv.includes('--apply'))throw Error('Use: node fix-article16-summary.js /absolute/server/root --apply');
 require(path.join(live,'node_modules/dotenv')).config({path:path.join(live,'.env'),quiet:true});
 const db=require(path.join(live,'src/db')),revisions=require(path.join(live,'src/lib/articleRevisions'));const c=await db.getConnection();
 try{await c.beginTransaction();const [[post]]=await c.query('SELECT * FROM posts WHERE id=? FOR UPDATE',[expected.id]);
  if(!post||post.title!==expected.title||post.status!=='published'||sha(post.content)!==expected.content)throw Error('Article 16 content no longer matches the reviewed baseline; stopped.');
  if(post.summary===replacement){await c.commit();console.log('Article 16 summary already fixed.');return;}
  if(post.version!==expected.version||sha(post.summary)!==expected.summary)throw Error('Article 16 version or summary changed; stopped.');
  const [[draft]]=await c.query('SELECT * FROM article_drafts WHERE post_id=? FOR UPDATE',[post.id]);
  if(draft){const [[w]]=await c.query('SELECT state FROM article_workflows WHERE draft_id=? FOR UPDATE',[draft.id]);if(w&&['submitted','approved','scheduled'].includes(w.state))throw Error('Article 16 has a pending review or schedule; stopped.');}
  await revisions.baseline(c,post,post.author_id);
  await c.query('UPDATE posts SET summary=?,updated_at=NOW(),version=version+1 WHERE id=? AND version=?',[replacement,post.id,post.version]);
  await revisions.record(c,{post_id:post.id}, {...post,summary:replacement,summary_mode:'manual',summary_receipt:''},'publish',post.author_id,post.version+1);
  if(draft&&!draft.dirty&&draft.base_version===post.version){const payload=typeof draft.payload==='string'?JSON.parse(draft.payload):draft.payload;payload.summary=replacement;payload.summary_mode='manual';payload.summary_receipt='';await c.query('UPDATE article_drafts SET payload=?,base_version=?,version=version+1,published_version=version WHERE id=?',[JSON.stringify(payload),post.version+1,draft.id]);}
  await c.commit();console.log(JSON.stringify({article:post.id,version:post.version+1,summary:replacement,characters:Array.from(replacement).length,body_unchanged:true}));
 }catch(e){await c.rollback();throw e;}finally{c.release();await db.end();}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={expected,replacement};
