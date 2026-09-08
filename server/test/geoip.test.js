const test = require('node:test');
const assert = require('node:assert/strict');
const geoip = require('geoip-lite');
const { getIpLocation, formatIpLocation } = require('../src/lib/geoip');

test('formats legacy Chinese subdivision labels without exposing region codes', () => {
  for (const [input, expected] of [
    ['BJ / 中国', '北京'], ['中国 BJ', '北京'], ['SH / 中国', '上海'],
    ['中国 / LN', '辽宁'], ['CN-SX', '山西'], ['CN-SN', '陕西'],
    ['HA / CN', '河南'], ['HB / 中国', '湖北'], ['HN / 中国', '湖南'],
    ['11 / 中国', '北京'], ['31 / 中国', '上海'], ['上海 / 中国', '上海'],
    ['cn-bj', '北京'], ['中国 ZZ', '中国'], ['中国', '中国'],
  ]) assert.equal(formatIpLocation(input), expected, input);
});

test('preserves overseas, absent and unknown locations without guessing a province', () => {
  for (const value of ['Texas / 美国', 'BJ / 贝宁', '未知地区', '本地网络', '中国香港', '']) {
    assert.equal(formatIpLocation(value), value);
  }
  assert.equal(formatIpLocation(null), '');
});

test('new Chinese IP lookups use province names and country-only fallback', t => {
  const lookup = t.mock.method(geoip, 'lookup');
  for (const [region, expected] of [['BJ','北京'], ['SH','上海'], ['LN','辽宁'], [11,'北京'], ['','中国'], ['ZZ','中国']]) {
    lookup.mock.mockImplementation(() => ({country:'CN',region,city:'unused city'}));
    assert.equal(getIpLocation('203.0.113.1'),expected);
  }
});

test('local and unlocated addresses keep existing handling', t => {
  t.mock.method(geoip, 'lookup', () => null);
  assert.equal(getIpLocation('127.0.0.1'),'本地网络');
  assert.equal(getIpLocation('192.168.1.2'),'本地网络');
  assert.equal(getIpLocation('203.0.113.1'),'未知地区');
});
