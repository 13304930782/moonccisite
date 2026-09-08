const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  isAllowedDmgMetadata,
  hasUdifFooter,
  buildReleaseDownloadUrl,
} = require('../src/lib/earlyAccessRelease');

test('DMG metadata requires the extension and an allowed MIME type', () => {
  assert.equal(isAllowedDmgMetadata({ originalname: 'PromptDock.dmg', mimetype: 'application/x-apple-diskimage' }), true);
  assert.equal(isAllowedDmgMetadata({ originalname: 'PromptDock.dmg', mimetype: 'application/octet-stream' }), true);
  assert.equal(isAllowedDmgMetadata({ originalname: 'PromptDock.zip', mimetype: 'application/octet-stream' }), false);
  assert.equal(isAllowedDmgMetadata({ originalname: 'PromptDock.dmg', mimetype: 'text/html' }), false);
});

test('UDIF validation reads the koly signature from the final 512-byte trailer', async () => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mooncci-dmg-'));
  const validPath = path.join(directory, 'valid.dmg');
  const invalidPath = path.join(directory, 'invalid.dmg');
  const valid = Buffer.alloc(1024);
  valid.write('koly', 512, 'ascii');

  try {
    await fs.promises.writeFile(validPath, valid);
    await fs.promises.writeFile(invalidPath, Buffer.alloc(1024));
    assert.equal(await hasUdifFooter(validPath), true);
    assert.equal(await hasUdifFooter(invalidPath), false);
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
});

test('release URL is stable and only generated for HTTPS sites', () => {
  assert.equal(
    buildReleaseDownloadUrl('https://mooncci.site/settings'),
    'https://mooncci.site/api/uploads/releases/PromptDock.dmg'
  );
  assert.equal(buildReleaseDownloadUrl('http://mooncci.site'), '');
  assert.equal(buildReleaseDownloadUrl('not-a-url'), '');
});
