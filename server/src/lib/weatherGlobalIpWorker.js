// Keep the 127 MB offline database outside the API process's PM2 memory budget.
const fs = require('node:fs');
const path = require('node:path');
const { Reader } = require('../../vendor/mmdb-lib/lib');
let reader;
process.on('disconnect', () => process.exit(0));
process.on('message', request => {
  if (!request || !Number.isSafeInteger(request.id) || typeof request.ip !== 'string') return;
  try {
    reader ||= new Reader(fs.readFileSync(path.join(__dirname, '../../data/dbip/dbip-city-lite-2026-10.mmdb')));
    const info = reader.get(request.ip);
    process.send({ id: request.id, info });
  } catch {
    process.send({ id: request.id, error: true });
  }
});
