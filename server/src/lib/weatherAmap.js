const { parseLocation, parseGeocodingLocation } = require('./weatherLocation');
const { wgs84togcj02, gcj02towgs84 } = require('../vendor/coordtransform');
const CACHE_KEY = 'weather_city_reverse:v1';
const clean = (value) => (typeof value === 'string' ? value.trim() : '');
function amapError(code) {
  const messages = {
    KEY_MISSING: '城市识别尚未配置高德 Web 服务 Key。',
    10001: '高德 Key 无效，请检查服务器配置。',
    10002: '高德 Key 尚未获得该接口权限。',
    10003: '高德接口的当日调用额度已用完。',
    10004: '高德接口请求过于频繁，请稍后重试。',
    10005: '服务器 IP 不在高德 Key 的白名单内。',
    10009: '高德 Key 与服务平台不匹配，请使用 Web 服务 Key。',
    10012: '高德服务权限不足，请检查控制台授权。',
    NETWORK: '服务器连接高德超时或失败，请稍后重试。',
    NO_CITY: '该位置暂未识别到城市，可手动选择。',
    BUSY: '城市识别正在处理其他请求，请稍后重试。',
  };
  const safe =
    /^[0-9]{5}$/.test(String(code)) || Object.hasOwn(messages, code)
      ? String(code)
      : 'UNAVAILABLE';
  return Object.assign(
    new Error(messages[safe] || '高德城市服务暂不可用，请稍后重试。'),
    { publicCode: `AMAP_${safe}` },
  );
}
async function requestAmap(path, params, { key, fetchImpl = fetch }) {
  if (!clean(key)) throw amapError('KEY_MISSING');
  const url = new URL(`https://restapi.amap.com/v3/${path}`);
  url.search = new URLSearchParams({
    ...params,
    key,
    output: 'JSON',
  }).toString();
  let body;
  try {
    const response = await fetchImpl(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw Error('HTTP');
    body = await response.json();
  } catch (error) {
    if (error.publicCode === 'WEATHER_UPSTREAM_LIMIT') throw error;
    throw amapError('NETWORK');
  }
  if (String(body?.status) !== '1') throw amapError(body?.infocode);
  return body;
}
function reverseAddress(body, location) {
  const address = body?.regeocode?.addressComponent || {};
  const name =
    clean(address.district) || clean(address.city) || clean(address.province);
  if (!name) throw amapError('NO_CITY');
  return {
    ...parseLocation({
      ...location,
      countryCode: 'CN',
      adcode: clean(address.adcode),
      name,
      region: [
        ...new Set(
          [
            clean(address.country) || '中国',
            clean(address.province),
            clean(address.city),
          ].filter((part) => part && part !== name),
        ),
      ].join(' · '),
    }),
    provider: 'amap',
  };
}
function districtIndex(body) {
  const results = [],
    seen = new Set();
  function visit(nodes, parents = []) {
    for (const node of Array.isArray(nodes) ? nodes : []) {
      if (!node || typeof node !== 'object') continue;
      const name = clean(node.name),
        code = clean(node.adcode);
      const isCity =
        node.level === 'city' ||
        node.level === 'district' ||
        (node.level === 'province' && /市$|特别行政区$/.test(name));
      if (isCity && /^[0-9]{6}$/.test(code) && !seen.has(code)) {
        const pair = clean(node.center).split(',');
        const lon = Number(pair[0]),
          lat = Number(pair[1]);
        if (
          pair.length === 2 &&
          pair.every((part) => part.trim()) &&
          Number.isFinite(lon) &&
          Number.isFinite(lat) &&
          Math.abs(lat) <= 90 &&
          Math.abs(lon) <= 180
        ) {
          const [longitude, latitude] = gcj02towgs84(lon, lat);
          const region = [...new Set(parents.filter(Boolean))].join(' · ');
          results.push({
            id: `amap-${code}`,
            ...parseLocation({
              name,
              region,
              latitude,
              longitude,
              countryCode: 'CN',
              adcode: code,
            }),
            provider: 'amap',
            parents,
          });
          seen.add(code);
        }
      }
      if (parents.length < 4 && node.level !== 'street')
        visit(node.districts, [...parents, name]);
    }
  }
  visit(body?.districts);
  return results;
}
const normalized = (value) =>
  value
    .replace(
      /\s|特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|自治州|自治县|地区|省|市|县|区/g,
      '',
    )
    .toLowerCase();
function searchDistrictIndex(index, query) {
  const term = normalized(query);
  if (!term) return [];
  return index
    .flatMap((item) => {
      const name = normalized(item.name);
      const paths = [
        name,
        ...item.parents.map((parent) => normalized(parent) + name),
        normalized(item.parents.join('')) + name,
      ];
      const score =
        name === term
          ? 0
          : paths.includes(term)
            ? 1
            : name.startsWith(term)
              ? 2
              : paths.some((path) => path.includes(term))
                ? 3
                : 9;
      return score === 9 ? [] : [{ item, score }];
    })
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.item.region.localeCompare(b.item.region, 'zh-CN'),
    )
    .slice(0, 8)
    .map(({ item: { parents, ...location } }) => location);
}
function createAmapGeocoder({
  repository,
  fetchImpl = fetch,
  clock = Date.now,
  key = () => process.env.AMAP_WEB_SERVICE_KEY || '',
}) {
  let index = null,
    expires = 0,
    pendingIndex = null;
  const request = (path, params) =>
    requestAmap(path, params, { key: key(), fetchImpl });
  async function search(query) {
    if (
      typeof query !== 'string' ||
      query.trim().length < 2 ||
      query.trim().length > 80
    )
      throw Object.assign(new Error('请输入 2～80 个字的城市名称。'), {
        status: 400,
      });
    if (!index || expires <= clock()) {
      if (!pendingIndex)
        pendingIndex = request('config/district', {
          keywords: '中国',
          subdistrict: '3',
          extensions: 'base',
        })
          .then((body) => {
            const next = districtIndex(body);
            if (!next.length) throw amapError('NO_CITY');
            index = next;
            expires = clock() + 86400000;
            return next;
          })
          .finally(() => {
            pendingIndex = null;
          });
      await pendingIndex;
    }
    return searchDistrictIndex(index, query.trim());
  }
  async function reverse(input) {
    const location = parseGeocodingLocation(input);
    if (!location)
      throw Object.assign(new Error('请先授权定位。'), { status: 400 });
    const key = `amap:district4:${location.latitude},${location.longitude}`;
    const result = await repository.withLock(CACHE_KEY, async (state, save) => {
      const places = (Array.isArray(state.places) ? state.places : []).filter(
        (p) => p.expires > clock(),
      );
      const previous = places.find((p) => p.key === key);
      if (previous) return previous.value;
      const [lon, lat] = wgs84togcj02(location.longitude, location.latitude);
      const body = await request('geocode/regeo', {
        location: `${lon.toFixed(6)},${lat.toFixed(6)}`,
        extensions: 'base',
        radius: '1000',
      });
      const value = reverseAddress(body, location);
      places.push({ key, value, expires: clock() + 86400000 });
      while (
        places.length > 128 ||
        Buffer.byteLength(JSON.stringify(places)) > 45000
      )
        places.shift();
      await save({ ...state, places });
      return value;
    });
    if (!result) throw amapError('BUSY');
    return result;
  }
  reverse.search = search;
  return reverse;
}
module.exports = {
  createAmapGeocoder,
  requestAmap,
  reverseAddress,
  districtIndex,
  searchDistrictIndex,
};
