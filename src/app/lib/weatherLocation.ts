export type WeatherLocation = {
  provider?: 'amap' | 'nominatim' | 'geonames';
  countryCode?: string;
  adcode?: string;
  name: string;
  region: string;
  latitude: number;
  longitude: number;
};
export const WEATHER_LOCATION_KEY = 'mooncci-weather-location-v2';
export const LEGACY_WEATHER_LOCATION_KEY = 'mooncci-weather-location-v1';
export const WEATHER_LOCATION_TTL = 30 * 24 * 60 * 60 * 1000;
export type WeatherLocationSource = 'manual' | 'device' | 'legacy';
type LocationStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type SavedWeatherLocation = {
  version: 2;
  location: WeatherLocation;
  source: WeatherLocationSource;
  selectedAt: number;
  expiresAt: number;
};
export function normalizeWeatherLocation(
  input: unknown,
  precision = 1,
): WeatherLocation | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Partial<WeatherLocation>;
  if (
    typeof value.latitude !== 'number' ||
    !Number.isFinite(value.latitude) ||
    Math.abs(value.latitude) > 90 ||
    typeof value.longitude !== 'number' ||
    !Number.isFinite(value.longitude) ||
    Math.abs(value.longitude) > 180
  )
    return null;
  return {
    ...(typeof value.countryCode === 'string' &&
    /^[A-Za-z]{2}$/.test(value.countryCode)
      ? { countryCode: value.countryCode.toUpperCase() }
      : {}),
    ...(typeof value.adcode === 'string' && /^\d{6}$/.test(value.adcode)
      ? { adcode: value.adcode }
      : {}),
    ...(['amap', 'nominatim', 'geonames'].includes(value.provider || '')
      ? { provider: value.provider }
      : {}),
    name:
      typeof value.name === 'string' && value.name.trim()
        ? value.name.trim().slice(0, 80)
        : '当前位置附近',
    region: typeof value.region === 'string' ? value.region.slice(0, 120) : '',
    latitude: Math.round(value.latitude * 10 ** precision) / 10 ** precision,
    longitude: Math.round(value.longitude * 10 ** precision) / 10 ** precision,
  };
}
// District lookup needs approximately 100 m precision; weather and saved selections
// still use a coarse grid. Never send the unrounded device coordinates.
export function geocodingLocation(input: unknown): WeatherLocation | null {
  return normalizeWeatherLocation(input, 3);
}
export function saveWeatherLocation(
  location: WeatherLocation | null,
  source: WeatherLocationSource = 'manual',
  now = Date.now(),
  storage?: LocationStorage,
): boolean {
  try {
    const target = storage ?? localStorage;
    const normalized = normalizeWeatherLocation(location);
    if (location && !normalized) return false;
    const record: SavedWeatherLocation | null = normalized
      ? {
          version: 2,
          location: normalized,
          source,
          selectedAt: now,
          expiresAt: now + WEATHER_LOCATION_TTL,
        }
      : null;
    // A tombstone prevents older open tabs from reviving a cleared v1 selection.
    const serialized = JSON.stringify(record);
    target.setItem(WEATHER_LOCATION_KEY, serialized);
    if (target.getItem(WEATHER_LOCATION_KEY) !== serialized) return false;
    target.removeItem(LEGACY_WEATHER_LOCATION_KEY);
    return true;
  } catch {
    return false;
  }
}
export function readWeatherLocation(
  now = Date.now(),
  storage?: LocationStorage,
): SavedWeatherLocation | null {
  try {
    const target = storage ?? localStorage;
    const raw = target.getItem(WEATHER_LOCATION_KEY);
    if (raw !== null) {
      const record = JSON.parse(raw) as SavedWeatherLocation | null;
      if (
        !record ||
        record.version !== 2 ||
        !['manual', 'device', 'legacy'].includes(record.source) ||
        !Number.isFinite(record.selectedAt) ||
        !Number.isFinite(record.expiresAt) ||
        record.selectedAt > now ||
        record.expiresAt <= now ||
        record.expiresAt > record.selectedAt + WEATHER_LOCATION_TTL
      )
        return null;
      const location = normalizeWeatherLocation(record.location);
      return location ? { ...record, location } : null;
    }
    const location = normalizeWeatherLocation(
      JSON.parse(target.getItem(LEGACY_WEATHER_LOCATION_KEY) || 'null'),
    );
    if (!location) return null;
    // Migrate once; reading or weather polling must not renew the 30-day expiry.
    saveWeatherLocation(location, 'legacy', now, target);
    return {
      version: 2,
      location,
      source: 'legacy',
      selectedAt: now,
      expiresAt: now + WEATHER_LOCATION_TTL,
    };
  } catch {
    return null;
  }
}
export function loadWeatherLocation(): WeatherLocation | null {
  return readWeatherLocation()?.location ?? null;
}

export function needsWeatherCityName(
  location: WeatherLocation | null,
): boolean {
  return (
    !!location && (!location.name.trim() || location.name === '当前位置附近')
  );
}
