const test = require('node:test');
const assert = require('node:assert/strict');
const { validateApplication } = require('../src/routes/early-access');

function validApplication(overrides = {}) {
  return {
    name: 'Test User',
    email: ' USER@Example.com ',
    occupation: 'developer',
    useCase: 'Code development with AI assistance.',
    device: 'macbook',
    macOSVersion: 'macOS 15.5',
    desiredFeatures: ['prompt_management', 'menu_bar'],
    reason: 'I want to test PromptDock in a real project.',
    ...overrides,
  };
}

test('valid application normalizes email and removes duplicate features', () => {
  const result = validateApplication(validApplication({
    desiredFeatures: ['prompt_management', 'prompt_management', 'menu_bar'],
  }));

  assert.equal(result.error, undefined);
  assert.equal(result.application.emailNormalized, 'user@example.com');
  assert.deepEqual(result.application.desiredFeatures, ['prompt_management', 'menu_bar']);
});

test('application rejects invalid enums and missing features', () => {
  assert.match(validateApplication(validApplication({ occupation: 'unknown' })).error, /职业身份/);
  assert.match(validateApplication(validApplication({ device: 'windows' })).error, /Mac 设备/);
  assert.match(validateApplication(validApplication({ desiredFeatures: [] })).error, /至少选择/);
  assert.match(validateApplication(validApplication({ desiredFeatures: ['not_real'] })).error, /至少选择/);
});

test('application enforces external input length limits', () => {
  assert.match(validateApplication(validApplication({ name: 'x'.repeat(81) })).error, /80/);
  assert.match(validateApplication(validApplication({ useCase: 'x'.repeat(3001) })).error, /3000/);
  assert.match(validateApplication(validApplication({ macOSVersion: 'x'.repeat(101) })).error, /100/);
  assert.match(validateApplication(validApplication({ reason: 'x'.repeat(3001) })).error, /3000/);
});
