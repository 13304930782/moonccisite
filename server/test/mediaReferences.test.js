const {test}=require('node:test'),assert=require('node:assert/strict');
const {countReferences,remapPayload,updateReferences}=require('../src/lib/mediaReferences');
const proof=require('../src/lib/articleSummaryProof'),revisions=require('../src/lib/articleRevisions');
process.env.SITE_URL='https://mooncci.site';
process.env.JWT_SECRET='isolated-media-reference-test-secret';
const oldUrl='/api/uploads/used_image.png',newUrl='/api/uploads/new.png';
const external='https://external.example'+oldUrl,prefix=oldUrl+'-other.webp';
const fields={posts:['content','cover_image'],site_settings:['setting_value'],updates:['content','image_url'],projects:['content','cover_image','icon_image'],site_now:['content'],article_series:['cover_image'],article_drafts:['payload'],article_revisions:['payload'],article_workflows:['snapshot']};
const editorial={title:'Title '+oldUrl,slug:'article',summary:'Description '+oldUrl,category:'Category '+oldUrl,tags:[oldUrl],source_url:'https://source.example'+oldUrl};
const document=url=>({...editorial,content:'![relative]('+url+'?v=1#image) <img src="https://mooncci.site'+url+'"> ![external]('+external+') ![prefix]('+prefix+')',cover_image:url,summary_mode:'ai'});
const signed=url=>{const p=document(url);p.summary_receipt=proof.signature(p);return p;};
const parse=raw=>typeof raw==='string'?JSON.parse(raw):raw;

test('only complete URLs owned by SITE_URL are relocated, preserving queries and fragments',()=>{
 const untouched=[external,'//external.example'+oldUrl,'https://mooncci.site.evil.example'+oldUrl,'https://mooncci.site:444'+oldUrl,'https://user@mooncci.site'+oldUrl,prefix,oldUrl+'.backup','https://external.example/?image='+oldUrl,'https://external.example/?image=a,'+oldUrl];
 const owned=[oldUrl,oldUrl+'?v=1#image','https://mooncci.site'+oldUrl+'?v=2','//mooncci.site'+oldUrl,'https://mooncci.site:443'+oldUrl];
 const content=[...owned,...untouched].map(url=>'![image]('+url+')').join(' ');
 const next=remapPayload({content,cover_image:external},oldUrl,newUrl);
 for(const url of owned)assert(next.content.includes('('+url.replace(oldUrl,newUrl)+')'),url);
 for(const url of untouched)assert(next.content.includes('('+url+')'),url);
 assert.equal(next.cover_image,external);
 assert.equal(remapPayload({content:'<img srcset="'+oldUrl+', '+oldUrl+' 2x">'},oldUrl,newUrl).content,'<img srcset="'+newUrl+', '+newUrl+' 2x">');
 // Configuration, rather than the production default or request Host, owns an absolute URL.
 const previous=process.env.SITE_URL;process.env.SITE_URL='https://other.example/base';
 try{assert.deepEqual(remapPayload({content:'https://mooncci.site'+oldUrl,cover_image:'https://other.example'+oldUrl},oldUrl,newUrl),{content:'https://mooncci.site'+oldUrl,cover_image:'https://other.example'+newUrl});}finally{process.env.SITE_URL=previous;}
});

test('editorial fields stay byte-for-byte intact and only valid AI receipts are re-signed',()=>{
 const before=signed(oldUrl),next=remapPayload(JSON.stringify(before),oldUrl,newUrl);
 for(const key of Object.keys(editorial))assert.deepEqual(next[key],before[key],key);
 assert.equal(next.cover_image,newUrl);assert(next.content.includes(newUrl+'?v=1#image'));assert(proof.valid(next));assert.notEqual(next.summary_receipt,before.summary_receipt);assert(proof.valid(before));
 const invalid={...before,summary_receipt:'f'.repeat(64)},after=remapPayload(invalid,oldUrl,newUrl);
 assert.equal(after.summary_receipt,invalid.summary_receipt);assert.equal(proof.valid(after),false);
 assert.deepEqual(remapPayload({...before,content:external,cover_image:prefix},oldUrl,newUrl),{...before,content:external,cover_image:prefix});
});

function fixtures(){
 const local={id:1,content:document(oldUrl).content,cover_image:oldUrl,image_url:oldUrl,icon_image:oldUrl};
 const foreign={id:2,content:external,cover_image:external,image_url:external,icon_image:external};
 const other={id:3,content:prefix,cover_image:prefix,image_url:prefix,icon_image:prefix};
 const data=Object.fromEntries(Object.keys(fields).map(table=>[table,[structuredClone(local),structuredClone(foreign),structuredClone(other)]]));
 data.posts.forEach(row=>Object.assign(row,editorial,{status:'published',version:5}));
 data.site_settings=[{setting_key:'brand',setting_value:JSON.stringify({logo_url:oldUrl,description:oldUrl,source_url:oldUrl})},{setting_key:'external',setting_value:JSON.stringify({logo_url:external,content:'<img src="'+external+'">',description:oldUrl})},{setting_key:'prefix',setting_value:JSON.stringify({logo_url:prefix})}];
 data.article_drafts=[{id:'draft',post_id:1,version:7,base_version:5,published_version:7,dirty:0,payload:JSON.stringify(signed(oldUrl))},{id:'external',post_id:2,version:3,base_version:5,published_version:3,dirty:0,payload:JSON.stringify({...editorial,content:external,cover_image:external})},{id:'prefix',post_id:3,version:1,base_version:5,published_version:1,dirty:0,payload:JSON.stringify({content:prefix,cover_image:prefix})}];
 data.article_workflows=data.article_drafts.map(d=>({draft_id:d.id,draft_version:d.version,state:'scheduled',snapshot:d.payload,scheduled_at:12345}));
 data.article_revisions=data.article_drafts.map((d,i)=>({id:i+1,post_id:d.post_id,kind:'publish',published_version:5,payload:d.payload,content_hash:revisions.hash(parse(d.payload)),created_at:'original',updated_at:'original'}));
 return data;
}
function fakeDb(data){
 const events=[];
 return {events,query:async(sql,args=[])=>{
  events.push({sql,args:structuredClone(args)});
  const table=sql.match(/(?:FROM|UPDATE|INTO) (\w+)/)?.[1];
  if(sql.startsWith('SELECT')){
   let rows=data[table];
   if(sql==='SELECT id FROM article_revisions WHERE post_id=? LIMIT 1')rows=rows.filter(r=>r.post_id===args[0]).slice(0,1);
   else if(sql.startsWith('SELECT content_hash'))rows=rows.filter(r=>r.post_id===args[0]&&r.kind===args[1]).slice(-1);
   else if(table==='article_revisions'&&sql.includes('FOR UPDATE'))rows=rows.filter(r=>JSON.stringify(r.payload).includes(args[0]));
   return [structuredClone(rows)];
  }
  if(sql.startsWith('INSERT INTO article_revisions')){data.article_revisions.push({id:data.article_revisions.length+1,post_id:args[0],draft_id:args[1],actor_id:args[2],kind:args[3],payload:args[4],content_hash:args[5],published_version:args[6]});return [{insertId:data.article_revisions.length}];}
  assert(sql.startsWith('UPDATE'),sql);
  const key=table==='site_settings'?'setting_key':table==='article_workflows'?'draft_id':'id',row=data[table].find(row=>row[key]===args.at(-1));assert(row,sql);
  if(table==='posts'){Object.assign(row,{content:args[0],cover_image:args[1],version:row.version+1});}
  else if(table==='article_drafts'){Object.assign(row,{payload:args[0],base_version:args[1],version:row.version+args[2],published_version:args[3]});}
  else if(table==='article_workflows'){Object.assign(row,{snapshot:args[0],draft_version:args[1]});}
  else if(table==='article_revisions'){Object.assign(row,{payload:args[0],content_hash:args[1]});}
  else fields[table].forEach((field,i)=>row[field]=args[i]);
  return [{affectedRows:1}];
 }};
}

test('deletion guard covers all nine consumers but filters external, prefix and editorial-only candidates',async()=>{
 const data=fixtures(),db=fakeDb(data);
 assert.equal(await countReferences(db,oldUrl),9);
 assert.deepEqual(db.events.map(e=>e.sql.match(/FROM (\w+)/)[1]),Object.keys(fields));
 for(const e of db.events){assert(e.sql.includes('LOCATE('));assert(e.args.every(url=>url===oldUrl));assert(!e.sql.includes('COUNT('));}
 for(const table of Object.keys(data))data[table]=data[table].slice(1);
 data.article_drafts.push({payload:JSON.stringify({...editorial,content:'No media',cover_image:''})});
 data.article_revisions.push({payload:JSON.stringify({...editorial,content:'No media',cover_image:''})});
 data.article_workflows.push({snapshot:JSON.stringify({...editorial,content:'No media',cover_image:''})});
 data.site_settings.push({setting_key:'text',setting_value:JSON.stringify({description:oldUrl,source_url:oldUrl})});
 assert.equal(await countReferences(db,oldUrl),0);
});

test('all nine consumers relocate together while clean published drafts, history and workflow preserve editorial identity',async()=>{
 const data=fixtures(),before=structuredClone(data),db=fakeDb(data);
 await updateReferences(db,oldUrl,newUrl,99);
 for(const table of ['posts','updates','projects','site_now','article_series'])for(const field of fields[table])assert(data[table][0][field].includes(newUrl),table+'.'+field);
 for(const table of Object.keys(data))for(let i=1;i<3;i++)assert.deepEqual(data[table][i],before[table][i],table+' external/prefix');
 const setting=parse(data.site_settings[0].setting_value);assert.equal(setting.logo_url,newUrl);assert.equal(setting.description,oldUrl);assert.equal(setting.source_url,oldUrl);
 const draft=data.article_drafts[0],workflow=data.article_workflows[0],post=data.posts[0];
 assert.equal(post.version,6);assert.equal(draft.base_version,6);assert.equal(draft.version,8);assert.equal(draft.published_version,8);assert.equal(draft.dirty,0);assert.equal(workflow.draft_version,8);assert.equal(workflow.state,'scheduled');assert.equal(workflow.scheduled_at,12345);
 for(const doc of [post,parse(draft.payload),parse(workflow.snapshot),...data.article_revisions.filter(r=>r.post_id===1).map(r=>parse(r.payload))]){
  for(const key of Object.keys(editorial))assert.deepEqual(key==='tags'?parse(doc[key]):doc[key],editorial[key],key);
  assert.equal(doc.cover_image,newUrl);assert.equal(doc.content,document(newUrl).content);
 }
 assert(proof.valid(parse(draft.payload)));assert(proof.valid(parse(workflow.snapshot)));assert(proof.valid(parse(data.article_revisions[0].payload)));
 for(const row of data.article_revisions){assert.equal(row.content_hash,revisions.hash(parse(row.payload)));}
 assert.equal(data.article_revisions[0].created_at,'original');assert.equal(data.article_revisions[0].updated_at,'original');assert.equal(data.article_revisions[0].published_version,5);
 const selects=db.events.filter(e=>e.sql.startsWith('SELECT *')).map(e=>e.sql.match(/FROM (\w+)/)[1]);assert.deepEqual(selects.slice(0,3),['article_drafts','article_workflows','posts']);
 assert.equal(await countReferences(db,oldUrl),0);assert.equal(await countReferences(db,newUrl),10,'the newly recorded public revision is also a protected reference');
});

test('media relocation preserves dirty drafts and stale base/workflow/publication versions',async()=>{
 const data=fixtures(),draft=data.article_drafts[0],workflow=data.article_workflows[0];
 Object.assign(draft,{dirty:1,base_version:4,published_version:3});workflow.draft_version=6;
 await updateReferences(fakeDb(data),oldUrl,newUrl,99);
 assert.equal(draft.version,8);assert.equal(draft.base_version,4);assert.equal(draft.published_version,3);assert.equal(draft.dirty,1);assert.equal(workflow.draft_version,6);
});

test('clean published copies never diverge from the public description or recorded history',async()=>{
 const data=fixtures();for(const table of Object.keys(data))data[table]=data[table].slice(0,1);
 await updateReferences(fakeDb(data),oldUrl,newUrl,99);
 const publicPost=data.posts[0],draft=data.article_drafts[0];
 assert.equal(draft.dirty,0);assert.equal(draft.published_version,draft.version);
 assert.equal(parse(draft.payload).summary,publicPost.summary,'a clean published draft must retain the public description');
 assert.equal(parse(data.article_workflows[0].snapshot).summary,publicPost.summary);
 for(const row of data.article_revisions)assert.equal(parse(row.payload).summary,publicPost.summary);
});

test('free-text settings preserve external quoted origins and candidate-only rows cause no writes',async()=>{
 const data=fixtures();for(const table of Object.keys(data))data[table]=data[table].slice(1);
 data.site_settings.push({setting_key:'raw',setting_value:'<img src="'+external+'"> '+prefix});
 const db=fakeDb(data),before=structuredClone(data);await updateReferences(db,oldUrl,newUrl,99);assert.deepEqual(data,before);assert(db.events.every(e=>e.sql.startsWith('SELECT')));
 data.site_settings.push({setting_key:'local',setting_value:'<img src="https://mooncci.site'+oldUrl+'?v=1">'});
 await updateReferences(db,oldUrl,newUrl,99);assert.equal(data.site_settings.at(-1).setting_value,'<img src="https://mooncci.site'+newUrl+'?v=1">');
});
