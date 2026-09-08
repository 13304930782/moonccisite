const router = require('express').Router();
const { createWeatherMoodService } = require('../services/weatherMood');
const repository = require('../repositories/weatherMoodRepository');
const { createCitySearch } = require('../lib/weatherLocation');
const {
  createClientIdentity,
  createClientLimiter,
} = require('../middleware/weatherClientLimit');
const { createBudgetFetch } = require('../lib/weatherBudget');
const { createWeatherGeocoder } = require('../lib/weatherGeocoder');
const guardedFetch = createBudgetFetch();
const reverseGeocode = createWeatherGeocoder({
  repository,
  fetchImpl: guardedFetch,
});
const searchCities = createCitySearch(guardedFetch, reverseGeocode.search);
const cityLimiter = createClientLimiter(10);
const weatherLimiter = createClientLimiter(30);
router.use(createClientIdentity());
const { authRequired, adminOnly } = require('../middleware/auth');
const {
  MANUAL_MOODS,
  parseOverride,
  activeOverride,
  applyOverride,
} = require('../lib/weatherMood');
const getMood = createWeatherMoodService({ repository });
const admin = require('express').Router();
let override = null,
  checkedAt = 0,
  pendingOverride = null,
  revision = 0;
async function currentOverride() {
  if (Date.now() - checkedAt < 30000) return override;
  if (!pendingOverride) {
    const version = revision;
    pendingOverride = repository
      .readOverride()
      .then((value) => {
        if (version === revision) {
          override = value;
          checkedAt = Date.now();
        }
        return override;
      })
      .finally(() => {
        pendingOverride = null;
      });
  }
  return pendingOverride;
}
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.use(
  '/interactions',
  require('./companionInteractions').createInteractionRouter(),
);
router.post('/cities', cityLimiter, async (req, res) => {
  try {
    res.json({ data: await searchCities(req.body?.query) });
  } catch (error) {
    if (error.status === 429)
      res.set('Retry-After', String(error.retryAfter || 60));
    res.status([400, 429].includes(error.status) ? error.status : 502).json({
      message:
        error.status === 400 || error.publicCode
          ? error.message
          : '城市搜索暂不可用，请稍后重试。',
      code: error.publicCode,
    });
  }
});
router.post('/locate', cityLimiter, async (req, res) => {
  try {
    res.json({ data: await reverseGeocode(req.body?.location) });
  } catch (error) {
    if (error.status === 429)
      res.set('Retry-After', String(error.retryAfter || 60));
    res.status([400, 429].includes(error.status) ? error.status : 502).json({
      message:
        error.status === 400 || error.publicCode
          ? error.message
          : '暂时无法识别城市，可重试或手动选择。',
      code: error.publicCode,
    });
  }
});
async function publicMood(req, res, next) {
  try {
    res.set('Cache-Control', 'no-store');
    const [snapshot, manual] = await Promise.all([
      getMood(req.method === 'POST' ? req.body?.location : null),
      currentOverride().catch(() => null),
    ]);
    res.json({ data: applyOverride(snapshot, manual) });
  } catch (error) {
    if (error.status === 400)
      return res.status(400).json({ message: error.message });
    next(error);
  }
}
router.get('/', weatherLimiter, publicMood);
router.post('/', weatherLimiter, publicMood);
admin.use(authRequired, adminOnly);
admin.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
admin.get('/', async (_req, res, next) => {
  try {
    res.json({
      data: {
        override: activeOverride(await repository.readOverride()),
        moods: MANUAL_MOODS,
      },
    });
  } catch (error) {
    next(error);
  }
});
admin.put('/', async (req, res, next) => {
  try {
    const value = parseOverride(req.body);
    await repository.writeOverride(value);
    revision++;
    override = value;
    checkedAt = Date.now();
    res.json({ data: { override: value, moods: MANUAL_MOODS } });
  } catch (error) {
    if (error.status === 400)
      return res.status(400).json({ message: error.message });
    next(error);
  }
});
admin.delete('/', async (_req, res, next) => {
  try {
    await repository.writeOverride(null);
    revision++;
    override = null;
    checkedAt = Date.now();
    res.json({ data: { override: null, moods: MANUAL_MOODS } });
  } catch (error) {
    next(error);
  }
});
module.exports = { router, admin };
