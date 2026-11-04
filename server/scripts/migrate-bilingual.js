const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const migrations=['202611040001_article_translations.sql','202611040002_content_translations.sql','202611040003_translation_draft_source.sql'];
const languageColumns=[['users','ui_locale'],['subscribers','ui_locale'],['article_drafts','locale'],['article_revisions','locale']];
const languageIndexes=[['article_drafts','uniq_article_working_copy','post_id,locale'],['article_revisions','revision_publication','post_id,locale,published_version']];
async function check(c){
 const pending=[];
 for(const table of ['post_translations','content_translations']){const [rows]=await c.query('SHOW TABLES LIKE ?',[table]);if(!rows.length)pending.push('Create '+table);else if(table==='content_translations'){const [columns]=await c.query("SHOW COLUMNS FROM content_translations LIKE 'published_source'");if(!columns.length)pending.push('Add content_translations.published_source');}}
 for(const [table,column] of languageColumns){const [rows]=await c.query(`SHOW COLUMNS FROM ${table} LIKE ?`,[column]);if(!rows.length)pending.push('Add '+table+'.'+column);else if(rows[0].Default!=='zh-CN'||rows[0].Null!=='NO'||!/^varchar\(5\)$/i.test(rows[0].Type))throw Error('Unexpected locale column shape: '+table+'.'+column);}
 for(const [table,name,columns] of languageIndexes){const [rows]=await c.query(`SHOW INDEX FROM ${table} WHERE Key_name=?`,[name]);const actual=rows.sort((a,b)=>a.Seq_in_index-b.Seq_in_index).map(r=>r.Column_name).join(',');if(actual!==columns){if(actual!==columns.replace(',locale',''))throw Error('Unexpected index shape: '+name);pending.push('Extend '+name);}}
 const [basis]=await c.query("SHOW COLUMNS FROM article_drafts LIKE 'source_hash'");if(!basis.length)pending.push('Add article_drafts.source_hash');else if(basis[0].Default!==''||basis[0].Null!=='NO'||!/^char\(64\)$/i.test(basis[0].Type))throw Error('Unexpected draft source hash shape');
 return pending;
}
async function migrate(c){
 await check(c);
 await c.query('CREATE TABLE IF NOT EXISTS schema_migrations(filename VARCHAR(255) NOT NULL PRIMARY KEY,checksum CHAR(64) NOT NULL,applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)');
 const loaded=[];
 for(const filename of migrations){const sql=fs.readFileSync(path.join(__dirname,'../database/migrations',filename),'utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').trim();const checksum=crypto.createHash('sha256').update(sql).digest('hex');const [[previous]]=await c.query('SELECT checksum FROM schema_migrations WHERE filename=?',[filename]);if(previous&&previous.checksum!==checksum)throw Error('Migration checksum mismatch: '+filename);loaded.push({filename,sql,checksum,previous});}
 for(const entry of loaded){if(entry.filename==='202611040003_translation_draft_source.sql'){const [columns]=await c.query("SHOW COLUMNS FROM article_drafts LIKE 'source_hash'");if(columns.length)continue;}await c.query(entry.sql);}
 const [sourceColumns]=await c.query("SHOW COLUMNS FROM content_translations LIKE 'published_source'");if(!sourceColumns.length)await c.query('ALTER TABLE content_translations ADD COLUMN published_source JSON NULL');
 for(const [table,column] of languageColumns){const [rows]=await c.query(`SHOW COLUMNS FROM ${table} LIKE ?`,[column]);if(!rows.length)await c.query(`ALTER TABLE ${table} ADD COLUMN ${column} VARCHAR(5) CHARACTER SET ascii NOT NULL DEFAULT 'zh-CN'`);}
 for(const [table,name,columns] of languageIndexes){const [rows]=await c.query(`SHOW INDEX FROM ${table} WHERE Key_name=?`,[name]);if(!rows.some(i=>i.Column_name==='locale'))await c.query(`ALTER TABLE ${table} DROP INDEX ${name}, ADD UNIQUE KEY ${name}(${columns})`);}
 const pending=await check(c);if(pending.length)throw Error('Incomplete bilingual migration');
 await c.query('SELECT post_id,locale,title,summary,content,status,version,source_hash,published_at,updated_at FROM post_translations LIMIT 0');
 await c.query('SELECT entity_type,entity_id,locale,draft,published,published_source,version,published_at,updated_at FROM content_translations LIMIT 0');
 for(const entry of loaded)if(!entry.previous)await c.query('INSERT INTO schema_migrations(filename,checksum) VALUES (?,?)',[entry.filename,entry.checksum]);
}
if(require.main===module){const apply=process.argv.includes('--apply');if(process.argv.slice(2).some(v=>!['--apply','--check'].includes(v)))throw Error('Use --check or --apply');const db=require('../src/db');db.getConnection().then(async c=>{try{if(apply){const [[lock]]=await c.query("SELECT GET_LOCK('mooncci_schema_migrations',30) AS locked");if(Number(lock.locked)!==1)throw Error('Migration lock unavailable');await migrate(c);}console.log(JSON.stringify({mode:apply?'applied':'read-only',pending:await check(c)}));}finally{if(apply)await c.query("SELECT RELEASE_LOCK('mooncci_schema_migrations')");c.release();await db.end();}}).catch(e=>{console.error(e.code||e.message);process.exitCode=1;});}
module.exports={migrate,check,migrations};
