const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {apply,shapes} = require('../scripts/migrate-newsletter-summary');
function fixture() {
 const tables={}, ledger=[], calls=[];
 const c={async query(sql,args=[]) {
  calls.push(sql);
  if(sql.includes('GET_LOCK'))return [[{locked:1}]];
  if(sql.includes('RELEASE_LOCK'))return [[]];
  if(sql.startsWith('SELECT filename'))return [ledger];
  if(sql.includes('information_schema'))return [tables[args[0]]?[{ENGINE:'InnoDB',TABLE_COLLATION:'utf8mb4_unicode_ci'}]:[]];
  if(sql.includes('CREATE TABLE')) {const name=sql.match(/EXISTS (\w+)/)[1];tables[name]=shapes[name].map(([Field,Type,Null])=>({Field,Type,Null}));return [[]];}
  if(sql.includes('ALTER TABLE')){tables.posts=[{Field:'summary_mode',Type:"enum('','manual','ai')",Null:'NO',Default:''}];return [[]];}
  if(sql.startsWith('SHOW COLUMNS'))return [tables[sql.split(' ')[3]]||[]];
  if(sql.startsWith('SHOW INDEX'))return [(sql.includes('newsletter_runs')?['week_start']:['week_start','content_type','content_id']).map((Column_name,i)=>({Column_name,Seq_in_index:i+1}))];
  if(sql.startsWith('INSERT INTO schema_migrations')){ledger.push({filename:args[0],checksum:args[1]});return [[]];}
  throw Error(sql);
 }};
 return {c,tables,ledger,calls};
}
const directory=path.resolve(__dirname,'../database/migrations');
test('scoped migrations create exact schema, then re-run without DDL',async()=>{
 const f=fixture();await apply(f.c,directory);assert.equal(f.ledger.length,2);
 const before=f.calls.length;await apply(f.c,directory);
 assert.equal(f.calls.slice(before).some(sql=>/CREATE TABLE|ALTER TABLE/.test(sql)),false);
});
test('interrupted migration resumes validated schema without repeating ALTER',async()=>{
 const f=fixture();await apply(f.c,directory);f.ledger.length=0;f.calls.length=0;
 await apply(f.c,directory);assert.equal(f.ledger.length,2);assert.equal(f.calls.some(sql=>/CREATE TABLE|ALTER TABLE/.test(sql)),false);
});
test('schema and checksum drift fail closed and release lock',async()=>{
 for(const damage of [f=>{f.tables.posts[0].Default='manual';},f=>{f.ledger[0].checksum='bad';},f=>{delete f.tables.newsletter_runs;}]) {
  const f=fixture();await apply(f.c,directory);damage(f);
  await assert.rejects(apply(f.c,directory));assert.match(f.calls.at(-1),/RELEASE_LOCK/);
 }
});
test('real MySQL additive upgrade preserves old summaries and supports interrupted ledger recovery',{skip:process.env.CONTENT_INTEGRATION!=='true'},async()=>{
 const name='mooncci_qa_summary_migration_'+process.pid;
 const c=await require('mysql2/promise').createConnection({host:'127.0.0.1',port:Number(process.env.TEST_DB_PORT||process.env.DB_PORT||33079),user:'root',multipleStatements:true});
 let created=false;
 try {
  await c.query('CREATE DATABASE '+name+' CHARACTER SET utf8mb4');
  created=true;
  await c.query('USE '+name);
  await c.query('CREATE TABLE posts(id INT PRIMARY KEY,summary TEXT); INSERT INTO posts VALUES (1,"legacy"); CREATE TABLE schema_migrations(filename VARCHAR(255) PRIMARY KEY,checksum CHAR(64))');
  await c.query('INSERT INTO schema_migrations VALUES (?,?)',['historic.sql','a'.repeat(64)]);
  await apply(c,directory);await apply(c,directory);
  const [[row]]=await c.query('SELECT summary,summary_mode FROM posts');assert.deepEqual(row,{summary:'legacy',summary_mode:''});
  await c.query('DELETE FROM schema_migrations WHERE filename<>"historic.sql"');await apply(c,directory);
  const [[count]]=await c.query('SELECT COUNT(*) AS total FROM schema_migrations');assert.equal(count.total,3);
  await c.query("ALTER TABLE posts MODIFY summary_mode ENUM('','manual','ai') NOT NULL DEFAULT 'manual'");
  await assert.rejects(apply(c,directory),/default/);
 }finally{try{if(created)await c.query('DROP DATABASE '+name);}finally{await c.end();}}
});
