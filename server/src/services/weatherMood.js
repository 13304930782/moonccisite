const { businessDate, unavailable } = require('../lib/weatherMood');
const { createRegionalForecast } = require('../lib/weatherRegional');
const { parseLocation, locationKey } = require('../lib/weatherLocation');
function createWeatherMoodService({
  repository,
  fetchWeather,
  clock = () => new Date(),
  enabled = () => process.env.MOONCCI_WEATHER_BOT_ENABLED !== 'false',
}) {
  fetchWeather =
    fetchWeather ||
    createRegionalForecast({
      repository,
      fetchImpl: require('../lib/weatherBudget').createBudgetFetch(),
    });
  const entries = new Map();
  const current = (snapshot, now) =>
    snapshot &&
    snapshot.date === businessDate(now, snapshot.timezone) &&
    Date.parse(snapshot.refreshAt) > now.getTime();
  async function load(now, location, key) {
    try {
      const result = await repository.withLock(key, async (state, save) => {
        if (state.snapshot?.status === 'ready' && current(state.snapshot, now))
          return state.snapshot;
        if (Date.parse(state.retryAt || '') > now.getTime())
          return {
            ...unavailable(now, true, location),
            refreshAt: state.retryAt,
          };
        await save({
          retryAt: new Date(now.getTime() + 15 * 60000).toISOString(),
        });
        const snapshot = await fetchWeather(now, location);
        // Cache weather-grid coordinates, not visitor labels or user identifiers.
        await save({
          snapshot: {
            ...snapshot,
            city: {
              latitude: location.latitude,
              longitude: location.longitude,
            },
          },
        });
        return snapshot;
      });
      return (
        result || {
          ...unavailable(now, true, location),
          refreshAt: new Date(now.getTime() + 60000).toISOString(),
        }
      );
    } catch {
      return unavailable(now, true, location);
    }
  }
  return async function getWeatherMood(input = null) {
    const location = parseLocation(input),
      now = clock();
    if (!enabled()) return unavailable(now, false, location);
    if (!location) return unavailable(now);
    const key = locationKey(location);
    let entry = entries.get(key);
    if (!entry) {
      if (entries.size >= 256) {
        const disposable = [...entries].find(([, value]) => !value.pending);
        if (!disposable) return unavailable(now, true, location);
        entries.delete(disposable[0]);
      }
      entry = { cached: null, pending: null };
      entries.set(key, entry);
    }
    if (current(entry.cached, now)) return { ...entry.cached, city: location };
    if (!entry.pending)
      entry.pending = load(now, location, key).finally(() => {
        entry.pending = null;
      });
    const result = await entry.pending;
    if (!current(result, clock())) return unavailable(clock(), true, location);
    entry.cached = result;
    return { ...result, city: location };
  };
}
module.exports = { createWeatherMoodService };
