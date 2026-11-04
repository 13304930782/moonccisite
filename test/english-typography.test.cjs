const { test } = require('node:test');
const assert = require('node:assert/strict');
const { translate } = require('./helpers/i18n.cjs');
const en = require('../src/app/i18n/en.json');
const source = require('esbuild').buildSync({entryPoints:['src/app/pages/festivals-v2/model.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const loaded = {exports:{}};
new Function('module','exports',source)(loaded,loaded.exports);

test('English UI apostrophes use the compact Latin punctuation without added spacing', () => {
  for (const value of Object.values(en)) assert.doesNotMatch(value, /[A-Za-z]\u2019/);
  assert.ok(Object.values(en).includes("See you when there's something new."));
  assert.equal(translate('en', '元旦'), "New Year's Day");
  assert.equal(translate('en', '情人节'), "Valentine's Day");
  assert.ok(Object.values(en).some(value => value.includes("members' requests")));
});

test('festival rule duration uses singular day while retaining Chinese and plural days', () => {
  for (const days of [1, 7]) {
    const rule = {type:'fixed',month:1,day:1,durationDays:days};
    assert.equal(loaded.exports.ruleSummary(rule,(key,params)=>translate('en',key,params)), `1/1 · ${days} ${days===1?'day':'days'}`);
    assert.equal(loaded.exports.ruleSummary(rule,(key,params)=>translate('zh-CN',key,params)), `1月1日 · 持续 ${days} 天`);
  }
});
