require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth-cookie');
const postRoutes = require('./routes/posts');
const adminRoutes = require('./routes/admin');
const uploadRoutes = require('./routes/upload');
const applicationRoutes = require('./routes/applications');
const settingsRoutes = require('./routes/settings');
const commentRoutes = require('./routes/comments');
const earlyAccessRoutes = require('./routes/early-access');
const electricityRoutes = require('./routes/electricity');
const adminElectricityRoutes = require('./routes/adminElectricity');

const contentPlatform = require('./routes/contentPlatform');
const subscriptions = require('./routes/subscriptions');
const app = express();
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback');

// 安全响应头
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://accounts.google.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", 'https://accounts.google.com', 'https://www.googleapis.com'],
      fontSrc: ["'self'", "data:"],
      frameSrc: ["'self'", 'https://accounts.google.com'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'self'"],
    },
    reportOnly: true,
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS 白名单
app.use(cors({
  origin: String(process.env.CORS_ORIGINS || 'https://mooncci.site,https://www.mooncci.site').split(',').map(value => value.trim()).filter(Boolean),
  credentials: true,
}));

// Body 大小限制
app.use(express.json({ limit: '1mb' }));
app.use('/api/uploads', express.static(uploadRoutes.uploadDir));

const trustedRequestOrigins = new Set(
  String(process.env.CSRF_TRUSTED_ORIGINS || process.env.CORS_ORIGINS || 'https://mooncci.site,https://www.mooncci.site')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

function isTrustedRequestOrigin(value) {
  if (!value) return true;

  try {
    return trustedRequestOrigins.has(new URL(value).origin);
  } catch {
    return false;
  }
}

function requireRequestedWith(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }

  if (req.get('X-Requested-With') !== 'XMLHttpRequest') {
    return res.status(403).json({ message: 'Invalid request source.' });
  }

  const origin = req.get('Origin');
  const referer = req.get('Referer');

  if (origin && !isTrustedRequestOrigin(origin)) {
    return res.status(403).json({ message: 'Invalid request origin.' });
  }

  if (!origin && referer && !isTrustedRequestOrigin(referer)) {
    return res.status(403).json({ message: 'Invalid request referer.' });
  }

  next();
}

// 全局限流
const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => /^\/weather-mood(?:\/|$)/.test(req.path) || (req.method === 'POST' && /^\/auth\/logout\/?$/i.test(req.path)),
  message: { message: '请求过于频繁，请稍后重试' },
});
app.use('/api', globalLimiter);
app.use('/api', requireRequestedWith);

// 认证接口限流（防暴力破解）
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !['/login', '/google', '/register', '/forgot-password', '/reset-password'].includes(req.path.replace(/\/$/, '').toLowerCase()),
  message: { message: '请求过于频繁，请稍后重试' },
});

// 邮件接口限流
const mailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: '邮件发送过于频繁，请稍后重试' },
});

const earlyAccessLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: '申请提交过于频繁，请稍后再试。' },
});

app.get('/api/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true });
});
app.use('/api/auth', authLimiter, require('./routes/socialLogin'));
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/early-access', earlyAccessLimiter, earlyAccessRoutes.publicRouter);
app.use('/api/electricity/rss', require('./routes/electricityRss'));
app.use('/api/electricity', electricityRoutes);
app.use('/api/weather-mood', require('./routes/weatherMood').router);
app.use('/api/admin/weather-companion', require('./routes/weatherMood').admin);
app.use('/api/upload', uploadRoutes.router);
app.use('/api/applications', applicationRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/admin/early-access', earlyAccessRoutes.adminRouter);
app.use('/api/admin/electricity/rooms', require('./routes/adminElectricityRooms'));
app.use('/api/admin/electricity', adminElectricityRoutes);
app.use('/api', require('./routes/account'));
app.use('/api/admin', adminRoutes);
app.use('/api', contentPlatform.router);
app.use('/api/admin', contentPlatform.admin);
app.use('/api', subscriptions.router);
app.use('/api/admin', subscriptions.admin);

app.use('/api', (_req, res) => res.status(404).json({ message: '接口不存在。' }));

app.use((error, _req, res, _next) => {
  console.error('[api] Unhandled request error:', error?.code || error?.message);
  if (res.headersSent) return;
  const status = error.type === 'entity.parse.failed' ? 400 : error.type === 'entity.too.large' ? 413 : 500;
  res.status(status).json({ message: status === 500 ? '服务器暂时无法处理请求，请稍后再试。' : '请求内容格式或大小不合法。' });
});

const port = Number(process.env.PORT || 3001);
if (require.main === module) {
  const fatal = (error) => {
    console.error('[fatal]', error?.code || error?.message || 'Unexpected process failure');
    process.exit(1); // Let PM2 restart a failed process instead of keeping corrupted state alive.
  };
  process.on('uncaughtException', fatal);
  process.on('unhandledRejection', fatal);
  const secret = String(process.env.JWT_SECRET || '');
  if (secret.length < 32 || /replace_with|your_secret|change.?me/i.test(secret)) {
    fatal(new Error('JWT_SECRET must be a non-placeholder secret of at least 32 characters'));
  }
  app.listen(port, process.env.HOST || '127.0.0.1', () => {
    console.log(`server running on ${port}`);
  });
}

module.exports = app;
