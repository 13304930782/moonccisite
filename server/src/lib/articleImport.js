const crypto=require('node:crypto');
const path=require('node:path');
const fs=require('node:fs/promises');
const sharp=require('sharp');
const {validateUrl,fetchBytes,error}=require('./articleImportFetch');
const {convertPost}=require('./articleImportConvert');
const {isAdminLike}=require('../middleware/auth');
async function importArticle(db,user,input,{fetch=fetchBytes,uploadDir=path.resolve(__dirname,'../../uploads')}={}) {
 const source=validateUrl(input);const parts=source.pathname.split('/').filter(Boolean);const slug=parts.at(-1);
 if(!slug||source.search)throw error('请输入旧文章的固定链接，不要带查询参数。');
 const signal=AbortSignal.timeout(90000);
 const api=new URL('/wp-json/wp/v2/posts',source);api.searchParams.set('slug',decodeURIComponent(slug));api.searchParams.set('_embed','1');
 let posts;try{posts=JSON.parse((await fetch(api.href,{signal})).toString());}catch(e){if(e.status)throw e;throw error('无法读取旧站 WordPress 文章数据。');}
 if(!Array.isArray(posts)||posts.length!==1)throw error('没有找到唯一的公开文章，请核对链接。');
 const canonical=validateUrl(posts[0].link).href;
 if(new URL(canonical).pathname.replace(/\/$/,'')!==source.pathname.replace(/\/$/,''))throw error('旧站返回了不同文章，已停止导入。');
 const digest=crypto.createHash('sha256').update(canonical).digest('hex');const id=`${digest.slice(0,8)}-${digest.slice(8,12)}-5${digest.slice(13,16)}-a${digest.slice(17,20)}-${digest.slice(20,32)}`;
 const c=await db.getConnection();const created=[];let locked=false,committed=false,committing=false;
 try {
  const [[lock]]=await c.query('SELECT GET_LOCK(?,1) AS ok',['article-import-'+digest.slice(0,32)]);if(lock.ok!==1)throw error('这篇文章正在导入，请稍后重试。');locked=true;
  const [[existing]]=await c.query('SELECT id,author_id,post_id FROM article_drafts WHERE id=?',[id]);
  if(existing){if(!isAdminLike(user)&&Number(existing.author_id)!==Number(user.id))throw error('该文章已经导入。');return {draft_id:existing.id,post_id:existing.post_id,replayed:true};}
  const [[published]]=await c.query('SELECT id FROM posts WHERE slug=?',[posts[0].slug]);if(published)return {post_id:published.id,replayed:true};
  const converted=convertPost(posts[0],canonical);const {payload,images,warnings}=converted;
  let total=0,convertedTotal=0;const assets=[];
  for(let i=0;i<images.length;i++){
   signal.throwIfAborted();const im=images[i];const buffer=await fetch(im.source,{signal,limit:8*1024*1024});total+=buffer.length;if(total>50*1024*1024)throw error('图片合计超过 50MB，已停止导入。');
   const image=sharp(buffer,{limitInputPixels:20000000});const meta=await image.metadata();if(!['png','jpeg','webp','gif','avif'].includes(meta.format))throw error('图片格式不支持，请使用 PNG、JPEG、WebP、GIF 或 AVIF。');
   if(meta.pages>1)warnings.push(`图片 ${i+1} 为动图，已导入静态首帧。`);
   const data=await image.rotate().webp({lossless:true,effort:2}).toBuffer();convertedTotal+=data.length;if(convertedTotal>100*1024*1024)throw error('转换后的图片过大，已停止导入。');
   const info=await sharp(data).metadata();assets.push({...im,data,width:info.width,height:info.height,filename:`import-${digest.slice(0,12)}-${crypto.createHash('sha256').update(data).digest('hex').slice(0,20)}.webp`});
  }
  signal.throwIfAborted();await c.beginTransaction();
  const [[active]]=await c.query('SELECT role,status FROM users WHERE id=? FOR UPDATE',[user.id]);if(!active||active.status!=='active'||!['owner','admin'].includes(active.role))throw error('管理员权限已变化，请重新登录。');
  await fs.mkdir(uploadDir,{recursive:true});
  for(let i=0;i<assets.length;i++){
   const a=assets[i],url='/api/uploads/'+a.filename,file=path.join(uploadDir,a.filename);
   try{await fs.writeFile(file,a.data,{flag:'wx',mode:0o644});created.push(file);}catch(e){if(e.code!=='EEXIST')throw e;if(!(await fs.readFile(file)).equals(a.data))throw error('图片文件冲突，已停止导入。');}
   const [[old]]=await c.query('SELECT status FROM media_assets WHERE filename=?',[a.filename]);if(old&&old.status!=='active')throw error('同名图片位于回收站，请先恢复。');
   if(!old)await c.query("INSERT INTO media_assets(filename,original_name,display_name,alt_text,url,mime,ext,size,width,height,quality,status,uploaded_by) VALUES(?,?,?,?,?,'image/webp','webp',?,?,?,'original','active',?)",[a.filename,a.filename,a.alt,a.alt,url,a.data.length,a.width,a.height,user.id]);
   payload.content=payload.content.split(`(mooncci-import-image-${i})`).join(`(${url})`);if(payload.cover_image===`mooncci-import-image-${i}`)payload.cover_image=url;
  }
  if(payload.content.includes('mooncci-import-image-'))throw error('图片引用转换失败，未创建草稿。');
  await c.query('INSERT INTO article_drafts(id,author_id,payload,dirty) VALUES (?,?,?,1)',[id,user.id,JSON.stringify(payload)]);
  committing=true;await c.commit();committed=true;return {draft_id:id,image_count:assets.length,warnings,replayed:false};
 } catch(e){await c.rollback();throw e;}
 finally {if(!committed&&!committing)for(const f of created)await fs.unlink(f).catch(()=>{});if(locked)await c.query('SELECT RELEASE_LOCK(?)',['article-import-'+digest.slice(0,32)]);c.release();}
}
module.exports={importArticle};
