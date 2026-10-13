const invalid = () => Object.assign(new Error('封面裁剪设置无效。'), { status: 400 });
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function exactObject(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null) &&
    Object.keys(value).length === keys.length && keys.every(key => has(value, key));
}

// Writes accept numbers only; coercion or clamping would hide malformed requests.
function normalizeCoverCrop(value) {
  if (value === undefined || value === null) return null;
  if (!exactObject(value, ['card', 'detail'])) throw invalid();
  const next = {};
  for (const target of ['card', 'detail']) {
    const crop = value[target];
    if (crop === null) { next[target] = null; continue; }
    if (!exactObject(crop, ['x', 'y', 'zoom']) ||
        !['x', 'y', 'zoom'].every(key => typeof crop[key] === 'number' && Number.isFinite(crop[key])) ||
        crop.x < 0 || crop.x > 1 || crop.y < 0 || crop.y > 1 || crop.zoom < 1 || crop.zoom > 3) throw invalid();
    next[target] = { x: crop.x, y: crop.y, zoom: crop.zoom };
  }
  return next.card || next.detail ? next : null;
}

// MySQL drivers may return JSON as a string or object. Old/invalid stored display
// metadata falls back to the existing image presentation without breaking reads.
function readCoverCrop(value, coverImage) {
  if (coverImage !== undefined && !String(coverImage || '').trim()) return null;
  try { return normalizeCoverCrop(typeof value === 'string' ? JSON.parse(value) : value); }
  catch { return null; }
}

function coverCropForInput(input, coverImage, oldPost = null) {
  const crop = has(input, 'cover_crop') ? normalizeCoverCrop(input.cover_crop) :
    oldPost && String(oldPost.cover_image || '').trim() === coverImage.trim()
      ? readCoverCrop(oldPost.cover_crop, oldPost.cover_image) : null;
  return coverImage.trim() ? crop : null;
}

const withCoverCrop = post => ({ ...post, cover_crop: readCoverCrop(post.cover_crop, post.cover_image) });
const serializeCoverCrop = crop => crop === null ? null : JSON.stringify(crop);
module.exports = { normalizeCoverCrop, readCoverCrop, coverCropForInput, withCoverCrop, serializeCoverCrop };
