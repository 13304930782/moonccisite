const { parseLocation, parseGeocodingLocation } = require('./weatherLocation');
const CACHE_KEY = 'weather_city_reverse:v1';
// Standard ISO 3166-2 province labels fill provider omissions; no city-specific aliases.
const CN_REGIONS = {
  BJ: '北京市',
  TJ: '天津市',
  HE: '河北省',
  SX: '山西省',
  NM: '内蒙古自治区',
  LN: '辽宁省',
  JL: '吉林省',
  HL: '黑龙江省',
  SH: '上海市',
  JS: '江苏省',
  ZJ: '浙江省',
  AH: '安徽省',
  FJ: '福建省',
  JX: '江西省',
  SD: '山东省',
  HA: '河南省',
  HB: '湖北省',
  HN: '湖南省',
  GD: '广东省',
  GX: '广西壮族自治区',
  HI: '海南省',
  CQ: '重庆市',
  SC: '四川省',
  GZ: '贵州省',
  YN: '云南省',
  XZ: '西藏自治区',
  SN: '陕西省',
  GS: '甘肃省',
  QH: '青海省',
  NX: '宁夏回族自治区',
  XJ: '新疆维吾尔自治区',
  TW: '台湾',
  HK: '香港',
  MO: '澳门',
};
function province(address) {
  return (
    address.state ||
    CN_REGIONS[String(address['ISO3166-2-lvl4'] || '').replace(/^CN-/, '')] ||
    ''
  );
}
function normalizeAddress(body, location, preferredName = '') {
  const address = body?.address || {};
  const local =
    address.country_code === 'cn' ? [address.district, address.county] : [];
  const name = [
    preferredName,
    ...local,
    address.city,
    address.town,
    address.municipality,
    address.county,
    /市$/.test(address.state || '') ? address.state : '',
  ].find((value) => typeof value === 'string' && value.trim());
  if (!name) throw new Error('CITY_NOT_FOUND');
  return parseLocation({
    ...location,
    countryCode: address.country_code,
    provider: 'nominatim',
    name,
    region: [
      ...new Set(
        [address.country, province(address), address.city].filter(
          (value) =>
            typeof value === 'string' && value.trim() && value !== name,
        ),
      ),
    ].join(' · '),
  });
}
function normalizeAdministrativeCities(body) {
  if (!Array.isArray(body)) return [];
  const results = [];
  for (const item of [...body].sort(
    (a, b) => Number(b.category === 'place') - Number(a.category === 'place'),
  )) {
    const municipality =
      item.addresstype === 'state' &&
      /市$/.test(item.name || '') &&
      item.address?.country_code === 'cn';
    if (
      !municipality &&
      ![
        'city',
        'town',
        'municipality',
        'county',
        'district',
        'borough',
      ].includes(item.addresstype)
    )
      continue;
    try {
      // Search labels describe the matched feature, not an inconsistent enclosing address label.
      const location = normalizeAddress(
        item,
        { latitude: Number(item.lat), longitude: Number(item.lon) },
        item.name,
      );
      const area = [item.address?.country, province(item.address || {})].join(
        '|',
      );
      const duplicate = results.find(
        (previous) =>
          previous.area === area &&
          previous.name === location.name &&
          Math.abs(previous.latitude - location.latitude) < 0.5 &&
          Math.abs(previous.longitude - location.longitude) < 0.5,
      );
      if (duplicate) {
        if (location.region.length > duplicate.region.length)
          duplicate.region = location.region;
        continue;
      }
      results.push({
        id: `osm-${item.osm_type}-${item.osm_id}`,
        ...location,
        area,
      });
    } catch {
      /* Incomplete or non-geographic records are not selectable. */
    }
  }
  return results.slice(0, 8).map(({ area, ...location }) => location);
}
function createReverseGeocoder({
  repository,
  fetchImpl = fetch,
  clock = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  endpoint = () =>
    process.env.MOONCCI_REVERSE_GEOCODING_URL ||
    'https://nominatim.openstreetmap.org/reverse',
}) {
  async function lookup(mode, input) {
    const location = mode === 'reverse' ? parseGeocodingLocation(input) : null;
    if (mode === 'reverse' && !location)
      throw Object.assign(new Error('请先授权定位。'), { status: 400 });
    if (
      mode === 'search' &&
      (typeof input !== 'string' ||
        input.trim().length < 2 ||
        input.trim().length > 80)
    )
      throw Object.assign(new Error('请输入 2～80 个字的城市名称。'), {
        status: 400,
      });
    // Versioned keys avoid reusing the former prefecture-only reverse result.
    const key =
      mode === 'reverse'
        ? `district4:${location.latitude},${location.longitude}`
        : `search2:${input.trim()}`;
    const result = await repository.withLock(CACHE_KEY, async (state, save) => {
      const places = (Array.isArray(state.places) ? state.places : [])
        .filter((item) => item.expires > clock())
        .slice(-127);
      const cached = places.find((item) => item.key === key);
      if (cached) return cached.value;
      // One shared database lock and timestamp throttle search AND reverse across API processes.
      const delay = 1100 - (clock() - (Number(state.requestedAt) || 0));
      if (delay > 0) await sleep(delay);
      const requestedAt = clock();
      await save({ places, requestedAt });
      const url = new URL(endpoint());
      if (url.protocol !== 'https:')
        throw new Error('INVALID_GEOCODING_ENDPOINT');
      if (mode === 'search')
        url.pathname = url.pathname.replace(/reverse\/?$/, 'search');
      url.search = new URLSearchParams({
        ...(mode === 'reverse'
          ? {
              lat: String(location.latitude),
              lon: String(location.longitude),
              zoom: '12',
            }
          : { q: input.trim(), limit: '8' }),
        format: 'jsonv2',
        addressdetails: '1',
        'accept-language': 'zh-CN,zh,en',
        layer: 'address',
      }).toString();
      const response = await fetchImpl(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
        headers: {
          'User-Agent': 'mooncci-weather/1.0 (+https://mooncci.site)',
          Accept: 'application/json',
        },
      });
      if (!response.ok) throw new Error('GEOCODING_FAILED');
      const body = await response.json();
      const value =
        mode === 'reverse'
          ? normalizeAddress(body, location)
          : normalizeAdministrativeCities(body);
      places.push({ key, value, expires: clock() + 86400000 });
      await save({ places, requestedAt });
      return value;
    });
    if (!result) throw new Error('GEOCODING_BUSY');
    return result;
  }
  const reverse = (input) => lookup('reverse', input);
  reverse.search = (input) => lookup('search', input);
  return reverse;
}
module.exports = {
  createReverseGeocoder,
  normalizeAddress,
  normalizeAdministrativeCities,
  CACHE_KEY,
};
