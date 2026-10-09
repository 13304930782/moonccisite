const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const create = require('../src/lib/imageVariants');

test('variants resize, reject paths and invalid sizes, and never serve deleted originals from cache', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mooncci-image-'));
  try {
    await sharp({ create: { width: 640, height: 640, channels: 3, background: '#778899' } }).png().toFile(path.join(dir, 'sample.png'));
    const handler = create(dir);
    const request = async (width, name) => {
      const result = {};
      const res = { set() { return this; }, type() { return this; }, send(data) { result.data = data; }, sendStatus(status) { result.status = status; }, redirect(status, url) { Object.assign(result, {status,url}); } };
      await handler({ params: {width, name} }, res); return result;
    };
    const first = await request('96', 'sample.png');
    assert.equal((await sharp(first.data).metadata()).width, 96);
    assert.deepEqual((await request('96', 'sample.png')).data, first.data);
    assert.equal((await request('9999', 'sample.png')).status, 404);
    assert.equal((await request('96', '../sample.png')).status, 404);
    await fs.unlink(path.join(dir, 'sample.png'));
    assert.equal((await request('96', 'sample.png')).status, 404);
    await fs.writeFile(path.join(dir, 'broken.png'), 'invalid image');
    assert.equal((await request('96', 'broken.png')).url, '/api/uploads/broken.png');
  } finally { await fs.rm(dir, {recursive:true, force:true}); }
});
