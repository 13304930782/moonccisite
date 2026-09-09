const fs = require('fs');

// Bound memory and DB round trips; concurrent requests share one reconciliation.
function createMediaSync({ directory, db, isImage, importFile, intervalMs = 60000 }) {
  let pending;
  let completedAt = -Infinity;
  async function scan() {
    const dir = await fs.promises.opendir(directory);
    let batch = [];
    async function flush() {
      if (!batch.length) return;
      const names = batch;
      batch = [];
      const [rows] = await db.query(
        `SELECT filename FROM media_assets WHERE filename IN (${names.map(() => '?').join(',')})`, names);
      const known = new Set(rows.map(row => row.filename));
      for (const name of names) {
        if (known.has(name)) continue;
        try { await importFile(name); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
    }
    for await (const entry of dir) {
      if (!entry.isFile() || !isImage(entry.name)) continue;
      batch.push(entry.name);
      if (batch.length === 500) await flush();
    }
    await flush();
    completedAt = Date.now();
  }
  return function sync() {
    if (pending) return pending;
    if (Date.now() - completedAt < intervalMs) return Promise.resolve();
    pending = scan().finally(() => { pending = undefined; });
    return pending;
  };
}
module.exports = { createMediaSync };
