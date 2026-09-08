const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeNamePart } = require('../src/lib/mediaName');

test('media rename preserves valid names and handles long adversarial suffixes', { timeout: 2000 }, () => {
  for (const [input, expected] of [
    [' hello world.jpg ', 'hello-world'], ['my.photo.PNG', 'my.photo'],
    ['__photo...png', 'photo'], ['a/b\\c.jpg', 'a-b-c'],
    ['x'.repeat(200) + '.png', 'x'.repeat(120)],
    ['photo' + '._'.repeat(400000), 'photo'],
  ]) assert.equal(sanitizeNamePart(input), expected);
  assert.match(sanitizeNamePart('---...'), /^image-\d+$/);
});
