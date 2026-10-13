const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCoverCrop, readCoverCrop, coverCropForInput, withCoverCrop } = require('../src/lib/articleCoverCrop');
const { payload } = require('../src/lib/articlePublishing');
const { snapshot, hash } = require('../src/lib/articleRevisions');
const crop = { card: { x: 0, y: 1, zoom: 3 }, detail: { x: 0.75, y: 0.25, zoom: 1.5 } };

test('cover crop canonicalizes independent settings and accepts exact numeric bounds', () => {
  assert.deepEqual(normalizeCoverCrop(crop), crop);
  assert.notEqual(normalizeCoverCrop(crop).card, crop.card);
  assert.deepEqual(normalizeCoverCrop({ detail: null, card: { zoom: 1, y: 0, x: 1 } }),
    { card: { x: 1, y: 0, zoom: 1 }, detail: null });
  assert.equal(normalizeCoverCrop({ card: null, detail: null }), null);
  assert.equal(normalizeCoverCrop(undefined), null);
  assert.equal(normalizeCoverCrop(null), null);
});

test('cover crop writes reject coercion, incomplete/extra keys and unsafe numeric values', () => {
  const invalid = [JSON.stringify(crop), [], true, 1, {}, { card: null },
    { ...crop, source: '/image.png' }, { ...crop, version: 1 },
    { ...crop, card: [] }, { ...crop, card: {} }, { ...crop, card: null, detail: undefined },
    { ...crop, card: { ...crop.card, rotation: 1 } },
    ...['x', 'y', 'zoom'].flatMap(key => [undefined, null, '1', true, NaN, Infinity, -Infinity]
      .map(value => ({ ...crop, card: { ...crop.card, [key]: value } }))),
    ...[-0.01, 1.01].flatMap(value => ['x', 'y'].map(key => ({ ...crop, detail: { ...crop.detail, [key]: value } }))),
    ...[0.99, 3.01].map(zoom => ({ ...crop, detail: { ...crop.detail, zoom } })),
  ];
  for (const value of invalid) assert.throws(() => normalizeCoverCrop(value), { status: 400 });
  assert.throws(() => payload({ cover_image: '/image.png', cover_crop: { card: null } }), { status: 400 });
});

test('stored JSON and legacy metadata read without changing visibility or other post data', () => {
  assert.deepEqual(readCoverCrop(JSON.stringify(crop), '/image.png'), crop);
  assert.deepEqual(readCoverCrop(crop, '/image.png'), crop);
  for (const value of [undefined, null, '', '{', { card: {} }]) assert.equal(readCoverCrop(value, '/image.png'), null);
  assert.equal(readCoverCrop(crop, ''), null);
  assert.deepEqual(withCoverCrop({ title: 'Original', cover_image: '/image.png', cover_crop: JSON.stringify(crop) }),
    { title: 'Original', cover_image: '/image.png', cover_crop: crop });
});

test('partial post updates keep framing for the same image and reset on replacement/removal', () => {
  const old = { cover_image: '/image.png', cover_crop: JSON.stringify(crop) };
  assert.deepEqual(coverCropForInput({}, '/image.png', old), crop);
  assert.equal(coverCropForInput({}, '/other.png', old), null);
  assert.equal(coverCropForInput({}, '', old), null);
  assert.equal(coverCropForInput({ cover_crop: null }, '/image.png', old), null);
  assert.deepEqual(coverCropForInput({ cover_crop: crop }, '/other.png', old), crop);
  assert.equal(coverCropForInput({ cover_crop: crop }, '', old), null);
  assert.throws(() => coverCropForInput({ cover_crop: 'bad' }, '', old), { status: 400 });
});

test('draft payloads and revision hashes preserve framing; missing historical values reset to null', () => {
  const post = { title: 'Title', content: 'Body', cover_image: '/image.png', cover_crop: crop };
  assert.deepEqual(payload(post).cover_crop, crop);
  assert.deepEqual(snapshot(post).cover_crop, crop);
  assert.equal(hash(post), hash({ ...post, cover_crop: JSON.stringify(crop) }));
  assert.notEqual(hash(post), hash({ ...post, cover_crop: { ...crop, card: { ...crop.card, x: 0.1 } } }));
  assert.equal(snapshot({ cover_image: '/image.png' }).cover_crop, null);
  assert.equal(payload({ ...post, cover_image: '' }).cover_crop, null);
  const restored = payload({ ...post, ...withCoverCrop({ title: 'Old', cover_image: '/image.png' }) });
  assert.equal(restored.cover_crop, null);
});
