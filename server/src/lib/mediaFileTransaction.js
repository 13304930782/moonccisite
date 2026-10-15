const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');

// SQL rollback alone cannot undo a rename or a compression. Keep original bytes
// on disk until the complete reference/metadata transaction has committed.
async function mediaFileTransaction(db, directory, files, work) {
  const root = path.join(directory, '.mutations');
  await fs.mkdir(root, {recursive:true, mode:0o700});
  const lock = path.join(root, 'lock');
  try { await fs.mkdir(lock, {mode:0o700}); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw Object.assign(new Error('媒体变更正在处理，或上次操作尚需恢复。请稍后重试；持续出现请联系管理员。'), {status:503});
  }
  // No PID/timeout reclamation: a lost DB connection or PM2 reload must never
  // let another process write while the previous filesystem recovery is running.
  let backup, c, committing = false, finished = false, recoveryFailed = false;
  const saved = [];
  const created = new Map();
  const changed = new Set();
  const identity = stat => ({dev:String(stat.dev), ino:String(stat.ino)});
  const owned = (stat, owner) => stat.isFile() && String(stat.dev)===owner.dev && String(stat.ino)===owner.ino;
  const journal = {changed(file) {
    if (!saved.some(item => item.file===file)) throw new Error('Unexpected media journal path');
    changed.add(file);
  }, created(file) {
    if (!saved.some(item => item.file===file) && path.dirname(path.resolve(file)) !== path.resolve(directory)) throw new Error('Unexpected media journal path');
    const stat=fsSync.lstatSync(file, {bigint:true});
    if (!stat.isFile()) throw new Error('Unexpected media journal file');
    created.set(file, identity(stat)); changed.add(file);
    if (!saved.some(item => item.file===file)) saved.push({file, existed:false});
  }, async recoveredCopy(from, to) {
    if (![from,to].every(file => saved.some(item => item.file===file))) throw new Error('Unexpected media recovery path');
    try {
    const names = [from,to].map(file => path.relative(directory,file));
    for (const entry of await fs.readdir(root, {withFileTypes:true})) {
      if (!entry.isDirectory() || !entry.name.startsWith('mutation-')) continue;
      let record;
      try {
        const recordFile=path.join(root,entry.name,'recovery.json');
        if (!(await fs.lstat(recordFile)).isFile()) throw new Error('Invalid media recovery record file');
        record=JSON.parse(await fs.readFile(recordFile,'utf8'));
      }
      catch (error) { if (error.code==='ENOENT') continue; throw error; }
      if (record.version!==1 || !Array.isArray(record.copies)) throw new Error('Invalid media recovery record');
      const copies=names.map(name => record.copies.find(item => item.file===name));
      if (copies.some(item => !item) || copies[0].copy!==copies[1].copy || !/^\d+$/.test(copies[0].copy)) continue;
      const stats=await Promise.all([from,to].map(file => fs.lstat(file,{bigint:true})));
      if (!stats.every((stat,index) => owned(stat,copies[index]))) continue;
      const original=path.join(root,entry.name,copies[0].copy);
      if (!(await fs.lstat(original)).isFile()) throw new Error('Invalid media recovery backup');
      const bytes=await Promise.all([from,to,original].map(file => fs.readFile(file)));
      if (!bytes[0].equals(bytes[1]) || !bytes[0].equals(bytes[2])) continue;
      // Register the existing aliases only after both inode and byte checks.
      for (let index=0;index<2;index++) created.set([from,to][index],identity(stats[index]));
      return true;
    }
    return false;
    } catch (error) {
      throw Object.assign(new Error('媒体恢复记录无法校验，未修改任何文件。请联系管理员。'), {status:503,cause:error});
    }
  }};
  try {
    backup = await fs.mkdtemp(path.join(root, 'mutation-'));
    await fs.writeFile(path.join(lock,'owner.json'), JSON.stringify({pid:process.pid,backup:path.basename(backup)})+'\n', {mode:0o600});
    c = await db.getConnection();
    await c.beginTransaction();
    await c.query('SELECT filename FROM media_assets WHERE filename IN (?) ORDER BY filename FOR UPDATE', [[...new Set(files.map(file => path.basename(file)))]]);
    for (const [index, file] of [...new Set(files)].entries()) {
      const copy = path.join(backup, String(index));
      try { await fs.copyFile(file, copy); saved.push({file, copy, existed:true}); }
      catch (error) { if (error.code !== 'ENOENT') throw error; saved.push({file, copy, existed:false}); }
    }
    const result = await work(c, journal);
    committing = true;
    await c.commit();
    finished = true;
    return result;
  } catch (error) {
    if (c) await c.rollback().catch(() => { recoveryFailed=true; c.destroy?.(); });
    try {
    if (committing && !recoveryFailed) {
      // A lost COMMIT response is ambiguous. Retain both URLs and the recovery
      // copy, rather than delete files a committed row may now reference.
      for (const item of saved.filter(item => item.existed)) {
        try { await fs.access(item.file); }
        catch (failure) {
          if (failure.code!=='ENOENT') throw failure;
          await fs.copyFile(item.copy,item.file);
          created.set(item.file,identity(await fs.lstat(item.file,{bigint:true})));
        }
      }
      const copies=[];
      for (const [file,owner] of created) {
        let stat;
        try { stat=await fs.lstat(file,{bigint:true}); }
        catch (failure) { if (failure.code==='ENOENT') continue; throw failure; }
        if (!owned(stat,owner)) throw new Error('Media recovery file ownership changed');
        const bytes=await fs.readFile(file);
        for (const original of saved.filter(item => item.existed)) {
          if (bytes.equals(await fs.readFile(original.copy))) {
            copies.push({file:path.relative(directory,file),copy:path.basename(original.copy),...owner}); break;
          }
        }
      }
      await fs.writeFile(path.join(backup,'recovery.json'),JSON.stringify({version:1,copies})+'\n',{mode:0o600});
    } else if (!recoveryFailed) {
    for (const item of saved.filter(item => changed.has(item.file))) {
      if (item.existed) await fs.copyFile(item.copy, item.file);
      else if (created.has(item.file)) {
        try {
          const actual=await fs.lstat(item.file,{bigint:true});
          if (owned(actual,created.get(item.file))) await fs.rm(item.file, {force:true});
          else throw new Error('Media recovery file ownership changed');
        } catch (failure) { if (failure.code!=='ENOENT') throw failure; }
      }
    }
    finished = true;
    }
    } catch (failure) { recoveryFailed=true; error=failure; }
    if (recoveryFailed) throw Object.assign(new Error('媒体恢复未完成，写入已暂停，恢复副本已保留。请联系管理员。'), {status:503,cause:error});
    if (committing) throw Object.assign(new Error('媒体操作结果未确认，请刷新媒体库核对后再试。'), {status:503,cause:error});
    throw error;
  } finally {
    try { c?.release(); }
    finally {
      if (finished && backup) await fs.rm(backup, {recursive:true, force:true}).catch(error => console.warn('[media/cleanup]', error.code));
      if (!recoveryFailed) await fs.rm(lock, {recursive:true,force:true});
    }
  }
}
module.exports = { mediaFileTransaction };
