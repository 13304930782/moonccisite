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

const app = express();
app.set('trust proxy', 1);

// 安全响应头
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
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
  origin: ['https://mooncci.site', 'https://www.mooncci.site'],
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

app.get('/api/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true });
});
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/upload', uploadRoutes.router);
app.use('/api/applications', applicationRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/admin', adminRoutes);

const port = Number(process.env.PORT || 3001);
app.listen(port, () => console.log(`server running on ${port}`));

// 全局异常处理
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
