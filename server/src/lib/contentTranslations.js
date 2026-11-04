const {locale}=require('./articleTranslations');
const fields=Object.assign(Object.create(null),{project:['name','summary','content'],update:['content'],series:['title','description'],category:['name'],tag:['name'],now:['content'],site:['brand','profile','hero','footer'],blog_pages:['about','links']});
const textKeys=new Set(['site_title','nav_title','name','title','bio','eyebrow','badge','title_before','title_highlight','title_after','subtitle','primary_text','secondary_text','copyright','intro','content','story','activities','technologies','timeline','social','date','description','summary']);
const failure=(message,status=400)=>Object.assign(Error(message),{status,code:'INVALID_TRANSLATION'});
function validate(type,input){
 if(!fields[type]||!input||typeof input!=='object'||Array.isArray(input))throw failure('Invalid content translation');
 if(Buffer.byteLength(JSON.stringify(input))>250000)throw failure('Translation is too large');
 function check(value,depth=0){
  if(depth>6)throw failure('Translation nesting is too deep');
  if(typeof value==='string'){if(value.length>100000)throw failure('Translation text is too long');return value;}
  if(Array.isArray(value)){if(value.length>100)throw failure('Too many translated items');return value.map(v=>check(v,depth+1));}
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>{if(!textKeys.has(key)&&!['headings','badges'].includes(key))throw failure('Only text fields can be translated');return [key,check(v,depth+1)];}));
  throw failure('Only text fields can be translated');
 }
 return Object.fromEntries(Object.entries(input).map(([key,v])=>{if(!fields[type].includes(key))throw failure('Unknown translated field');return [key,check(v)];}));
}
function parse(value){if(typeof value==='string')return JSON.parse(value);return value;}
// Match current shared list entries to their publication snapshot before checking
// coverage, so a reordered/new item cannot borrow another item's translation.
function missingText(type,source,translated,previous){
 const missing=[];
 function visit(value,text,old,path,top=false){
  if(typeof value==='string'){if(value.trim()&&(typeof text!=='string'||!text.trim()))missing.push(path.join('.'));return;}
  if(Array.isArray(value)){value.forEach((item,index)=>{const match=Array.isArray(old)?old.findIndex(prior=>itemIdentity(prior)===itemIdentity(item)):index;visit(item,match<0?undefined:text?.[match],old?.[match],[...path,String(index)]);});return;}
  if(value&&typeof value==='object')for(const [key,item] of Object.entries(value))if(top?fields[type]?.includes(key):textKeys.has(key)||['headings','badges'].includes(key))visit(item,text?.[key],old?.[key],[...path,key]);
 }
 visit(source,translated,previous,[],true);return missing;
}
const itemIdentity=value=>JSON.stringify(value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).filter(([key])=>key!=='enabled')):value);
// Only replace existing text; visibility, ordering, URLs and record identities remain shared.
function overlay(source,translated,previous){
 if(typeof source==='string'&&typeof translated==='string')return translated;
 if(Array.isArray(source)&&Array.isArray(translated))return source.map((value,index)=>{const match=Array.isArray(previous)?previous.findIndex(item=>itemIdentity(item)===itemIdentity(value)):index;return match<0?value:overlay(value,translated[match],previous?.[match]);});
 if(source&&translated&&typeof source==='object'&&typeof translated==='object'&&!Array.isArray(source))return Object.fromEntries(Object.entries(source).map(([key,value])=>[key,key in translated?overlay(value,translated[key],previous?.[key]):value]));
 return source;
}
async function read(db,type,id){try{const [[row]]=await db.query("SELECT * FROM content_translations WHERE entity_type=? AND entity_id=? AND locale='en'",[type,String(id)]);return row?{...row,draft:parse(row.draft),published:parse(row.published),published_source:parse(row.published_source)}:null;}catch(error){if(error.code==='ER_NO_SUCH_TABLE')return null;throw error;}}
async function localize(db,type,source,requested='zh-CN',{id=source?.id,strict=false}={}){
 const language=locale(requested);if(!source)return source;
 const row=await read(db,type,id);
 const published=row?.published&&!missingText(type,source,row.published,row.published_source).length;
 if(language==='en'&&!published&&strict)throw failure('English translation unavailable',404);
 const available=['zh-CN',...(published?['en']:[])];
 return {...(language==='en'&&published?overlay(source,row.published,row.published_source):source),content_locale:language==='en'&&published?'en':'zh-CN',requested_locale:language,available_locales:available};
}
module.exports={fields,validate,overlay,read,localize,missingText,failure};
