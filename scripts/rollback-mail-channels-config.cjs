const fs=require('fs'),path=require('path');
// Old mail-settings code cannot redact nested passwords. Remove only the new profiles
// before restoring old code, retaining a private recovery copy on the server.
async function prepareRollback(db,backup){
 const c=await db.getConnection();try{await c.beginTransaction();const [[row]]=await c.query('SELECT setting_value FROM site_settings WHERE setting_key="mail" FOR UPDATE');
 if(row){const config=typeof row.setting_value==='string'?JSON.parse(row.setting_value):row.setting_value;if(config.channels){
 const file=path.join(backup,'mail-channels-before-rollback-'+Date.now()+'.json');fs.writeFileSync(file,JSON.stringify(config.channels),{mode:0o600,flag:'wx'});fs.chmodSync(file,0o600);delete config.channels;
 await c.query('UPDATE site_settings SET setting_value=? WHERE setting_key="mail"',[JSON.stringify(config)]);
 }}await c.commit();}catch(e){await c.rollback();throw e;}finally{c.release();}
}
if(require.main===module){const db=require(path.join(process.argv[2],'src/db.js'));prepareRollback(db,process.argv[3]).catch(()=>{console.error('Rollback settings preparation failed; old code was not restored.');process.exitCode=1;}).finally(()=>db.end());}
module.exports={prepareRollback};
