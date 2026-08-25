const fs = require('fs');
const path = require('path');

const RELEASE_FILENAME = 'PromptDock.dmg';
const UDIF_TRAILER_SIZE = 512;
const UDIF_SIGNATURE = 'koly';
const ALLOWED_DMG_MIMES = new Set([
  'application/x-apple-diskimage',
  'application/octet-stream',
]);

function isAllowedDmgMetadata(file = {}) {
  const extension = path.extname(String(file.originalname || '')).toLowerCase();
  const mime = String(file.mimetype || '').toLowerCase();
  return extension === '.dmg' && ALLOWED_DMG_MIMES.has(mime);
}

async function hasUdifFooter(filePath) {
  const stat = await fs.promises.stat(filePath);
  if (!stat.isFile() || stat.size < UDIF_TRAILER_SIZE) return false;

  const handle = await fs.promises.open(filePath, 'r');
  try {
    const trailer = Buffer.alloc(UDIF_TRAILER_SIZE);
    const { bytesRead } = await handle.read(
      trailer,
      0,
      UDIF_TRAILER_SIZE,
      stat.size - UDIF_TRAILER_SIZE
    );
    return bytesRead === UDIF_TRAILER_SIZE && trailer.subarray(0, 4).toString('ascii') === UDIF_SIGNATURE;
  } finally {
    await handle.close();
  }
}

function buildReleaseDownloadUrl(siteUrl) {
  let parsed;
  try {
    parsed = new URL(String(siteUrl || ''));
  } catch {
    return '';
  }

  if (parsed.protocol !== 'https:') return '';
  return new URL(`/api/uploads/releases/${RELEASE_FILENAME}`, parsed.origin).toString();
}

module.exports = {
  RELEASE_FILENAME,
  isAllowedDmgMetadata,
  hasUdifFooter,
  buildReleaseDownloadUrl,
};
