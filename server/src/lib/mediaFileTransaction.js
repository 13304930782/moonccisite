const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');

// SQL rollback alone cannot undo a rename or a compression. Keep original bytes
// on disk until the complete reference/metadata transaction has committed.
async function mediaFileTransaction(db, directory, files, work) {
  const root = path.join(directory, '.mutations');
  await fs.mkdir(root, {recursive:true, mode:0o700});
  const backup = await fs.mkdtemp(path.join(root, 'mutation-'));
  const saved = [];
  const created = new Map();
  const journal = {created(file) { const stat=fsSync.lstatSync(file);created.set(file, {dev:stat.dev, ino:stat.ino}); }};
  let c, committing = false, finished = false;
  try {
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
    if (c) await c.rollback().catch(() => {});
    if (committing) {
      // A lost COMMIT response is ambiguous. Retain both URLs and the recovery
      // copy, rather than delete files a committed row may now reference.
      for (const item of saved.filter(item => item.existed)) {
        try { await fs.access(item.file); } catch { await fs.copyFile(item.copy, item.file); }
      }
      throw Object.assign(new Error('媒体操作结果未确认，请刷新媒体库核对后再试。'), {status:503, cause:error});
    }
    for (const item of saved) {
      if (item.existed) await fs.copyFile(item.copy, item.file);
      else if (created.has(item.file)) {
        try {
          const actual=await fs.lstat(item.file), owned=created.get(item.file);
          if (actual.dev===owned.dev && actual.ino===owned.ino) await fs.rm(item.file, {force:true});
        } catch (failure) { if (failure.code!=='ENOENT') throw failure; }
      }
    }
    finished = true;
    throw error;
  } finally {
    c?.release();
    if (finished) await fs.rm(backup, {recursive:true, force:true}).catch(error => console.warn('[media/cleanup]', error.code));
  }
}
module.exports = { mediaFileTransaction };
