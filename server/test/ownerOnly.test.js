const test = require('node:test');
const assert = require('node:assert/strict');
const { ownerOnly } = require('../src/middleware/auth');

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}

test('ownerOnly accepts owner and rejects every other role', () => {
  let nextCalls = 0;
  const ownerResponse = responseRecorder();
  ownerOnly({ user: { role: 'owner' } }, ownerResponse, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);
  assert.equal(ownerResponse.statusCode, 200);

  for (const role of ['admin', 'editor', 'user', undefined]) {
    const response = responseRecorder();
    ownerOnly({ user: role ? { role } : null }, response, () => { nextCalls += 1; });
    assert.equal(response.statusCode, 403);
    assert.match(response.body.message, /Owner/);
  }

  assert.equal(nextCalls, 1);
});
