const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const FileType = require('file-type');
const sharp = require('sharp');
const db = require('../db');
const { authRequired, editorOrAdmin } = require('../middleware/auth');

const router = express.Router();

const uploadDir = path.join(__dirname, '../../uploads');
const trashDir = path.join(uploadDir, '.trash');

for (const dir of [uploadDir, trashDir]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const allowedTypes = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
];

const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.ico'];

const extByDetected = {
  jpg: '.jpg',
  png: '.png',
  gif: '.gif',
  webp: '.webp',
  ico: '.ico',
};

const mimeByExt = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const qualityPresets = {
  low: { quality: 60, maxWidth: 1200 },
  medium: { quality: 75, maxWidth: 1600 },
  high: { quality: 88, maxWidth: 2200 },
  original: null,
};

function normalizeQuality(value) {
  const key = String(value || 'medium').toLowerCase();
  return Object.prototype.hasOwnProperty.call(qualityPresets, key) ? key : 'medium';
}

function isAllowedImage(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  return allowedExts.includes(ext) && allowedTypes.includes(file.mimetype);
}

function isPublicUploadFile(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  return allowedExts.includes(ext);
}

function safeBasename(filename) {
  return path.basename(String(filename || '')).trim();
}

function sanitizeNamePart(value) {
  const cleaned = String(value || '')
    .trim()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, 120);

  return cleaned || `image-${Date.now()}`;
}

function sanitizeDisplayText(value, max = 255) {
  return String(value || '').trim().slice(0, max);
}

function toPublicUrl(filename) {
  return `/api/uploads/${filename}`;
}

function filePathFor(filename) {
  return path.join(uploadDir, safeBasename(filename));
}

function trashPathFor(filename) {
  return path.join(trashDir, safeBasename(filename));
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function removeUploadedFile(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('[upload] failed to remove file:', err.message);
    }
  }
}

async function getDetectedImageInfo(filePath) {
  const detected = await FileType.fromFile(filePath);
  if (!detected) return { ok: false, detected: null };

  const safeExt = extByDetected[detected.ext];
  if (!safeExt || !allowedTypes.includes(detected.mime)) {
    return { ok: false, detected };
  }

  return { ok: true, detected, safeExt };
}

async function getImageMeta(filePath, filename, fallback = {}) {
  const stat = await fs.promises.stat(filePath);
  const ext = path.extname(filename).toLowerCase();
  let width = null;
  let height = null;

  try {
    const meta = await sharp(filePath).metadata();
    width = meta.width || null;
    height = meta.height || null;
  } catch {
    // gif/ico may fail in some libvips builds; size metadata is still useful.
  }

  return {
    filename,
    original_name: fallback.original_name || filename,
    display_name: fallback.display_name || path.basename(filename, ext),
    alt_text: fallback.alt_text || '',
    url: toPublicUrl(filename),
    mime: fallback.mime || mimeByExt[ext] || '',
    ext,
    size: stat.size,
    width,
    height,
    quality: fallback.quality || '',
  };
}

async function upsertMediaRecord(meta, userId = null) {
  await db.query(
    `
    INSERT INTO media_assets
    (filename, original_name, display_name, alt_text, url, mime, ext, size, width, height, quality, status, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    ON DUPLICATE KEY UPDATE
      original_name=VALUES(original_name),
      url=VALUES(url),
      mime=VALUES(mime),
      ext=VALUES(ext),
      size=VALUES(size),
      width=VALUES(width),
      height=VALUES(height),
      quality=VALUES(quality),
      status='active',
      deleted_at=NULL,
      uploaded_by=COALESCE(VALUES(uploaded_by), uploaded_by),
      updated_at=CURRENT_TIMESTAMP
    `,
    [
      meta.filename,
      meta.original_name,
      meta.display_name,
      meta.alt_text,
      meta.url,
      meta.mime,
      meta.ext,
      meta.size,
      meta.width,
      meta.height,
      meta.quality,
      userId,
    ]
  );
}

async function syncMediaRecords() {
  const files = await fs.promises.readdir(uploadDir);

  for (const filename of files) {
    if (!isPublicUploadFile(filename)) continue;

    const filePath = filePathFor(filename);
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) continue;

    const [rows] = await db.query('SELECT filename FROM media_assets WHERE filename=? LIMIT 1', [filename]);
    if (rows[0]) continue;

    const meta = await getImageMeta(filePath, filename);
    await upsertMediaRecord(meta);
  }
}

async function findMedia(filename, status = null) {
  const safeName = safeBasename(filename);
  const params = [safeName];
  let statusSql = '';

  if (status) {
    statusSql = ' AND status=?';
    params.push(status);
  }

  const [rows] = await db.query(
    `SELECT * FROM media_assets WHERE filename=?${statusSql} LIMIT 1`,
    params
  );

  return rows[0] || null;
}

async function updateReferences(oldUrl, newUrl) {
  await db.query('UPDATE posts SET content=REPLACE(content, ?, ?) WHERE content LIKE ?', [oldUrl, newUrl, `%${oldUrl}%`]);
  await db.query('UPDATE posts SET cover_image=? WHERE cover_image=?', [newUrl, oldUrl]);

  try {
    await db.query('UPDATE site_settings SET setting_value=REPLACE(setting_value, ?, ?) WHERE setting_value LIKE ?', [oldUrl, newUrl, `%${oldUrl}%`]);
  } catch (err) {
    if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
  }
}

async function countReferences(url) {
  const [[postContent]] = await db.query('SELECT COUNT(*) AS count FROM posts WHERE content LIKE ?', [`%${url}%`]);
  const [[postCover]] = await db.query('SELECT COUNT(*) AS count FROM posts WHERE cover_image=?', [url]);
  let settingsCount = { count: 0 };

  try {
    [[settingsCount]] = await db.query('SELECT COUNT(*) AS count FROM site_settings WHERE setting_value LIKE ?', [`%${url}%`]);
  } catch (err) {
    if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
  }

  return Number(postContent.count || 0) + Number(postCover.count || 0) + Number(settingsCount.count || 0);
}

async function compressImageIfNeeded(file, imageInfo, qualityKey) {
  const preset = qualityPresets[qualityKey];
  const currentExt = path.extname(file.filename || '').toLowerCase();

  if (!preset) {
    if (imageInfo.safeExt && currentExt !== imageInfo.safeExt) {
      const nextFilename = `${path.basename(file.filename, currentExt)}${imageInfo.safeExt}`;
      const nextPath = path.join(uploadDir, nextFilename);
      fs.renameSync(file.path, nextPath);
      file.filename = nextFilename;
      file.path = nextPath;
    }

    return {
      compressed: false,
      quality: 'original',
      original_size: file.size,
      output_size: fs.statSync(file.path).size,
    };
  }

  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(imageInfo.safeExt)) {
    return {
      compressed: false,
      quality: qualityKey,
      original_size: file.size,
      output_size: fs.statSync(file.path).size,
    };
  }

  const baseName = path.basename(file.filename, currentExt);
  const nextFilename = `${baseName}.webp`;
  const nextPath = path.join(uploadDir, nextFilename);
  const tmpPath = `${nextPath}.tmp`;
  const originalPath = file.path;
  const originalSize = fs.statSync(file.path).size;

  await sharp(file.path)
    .rotate()
    .resize({
      width: preset.maxWidth,
      withoutEnlargement: true,
    })
    .webp({
      quality: preset.quality,
      effort: 4,
    })
    .toFile(tmpPath);

  fs.renameSync(tmpPath, nextPath);

  if (path.resolve(originalPath) !== path.resolve(nextPath)) {
    removeUploadedFile(originalPath);
  }

  file.filename = nextFilename;
  file.path = nextPath;

  return {
    compressed: true,
    quality: qualityKey,
    original_size: originalSize,
    output_size: fs.statSync(nextPath).size,
  };
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = allowedExts.includes(ext) ? ext : '.png';
    cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 12 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedImage(file)) {
      return cb(new Error('只允许上传 jpg、jpeg、png、gif、webp、ico 图片'));
    }

    cb(null, true);
  },
});

function mapMediaRow(row) {
  return {
    ...row,
    size_text: formatFileSize(row.size),
    uploaded_at: row.created_at,
  };
}

function normalizeFilenameList(value) {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value
      .map((item) => safeBasename(item))
      .filter((filename) => filename && isPublicUploadFile(filename))
  )].slice(0, 100);
}

async function moveMediaToTrash(filename, force = false) {
  const media = await findMedia(filename, 'active');

  if (!media) {
    return { filename, ok: false, reason: 'not_found' };
  }

  const refCount = await countReferences(media.url);
  if (refCount > 0 && !force) {
    return { filename, ok: false, reason: 'referenced', ref_count: refCount };
  }

  const oldPath = filePathFor(filename);
  const nextPath = trashPathFor(filename);

  if (fs.existsSync(oldPath)) {
    fs.renameSync(oldPath, nextPath);
  }

  await db.query(
    'UPDATE media_assets SET status="trashed", deleted_at=NOW(), updated_at=CURRENT_TIMESTAMP WHERE filename=?',
    [filename]
  );

  return { filename, ok: true };
}

async function restoreMediaFromTrash(filename) {
  const media = await findMedia(filename, 'trashed');

  if (!media) {
    return { filename, ok: false, reason: 'not_found' };
  }

  const oldPath = trashPathFor(filename);
  const nextPath = filePathFor(filename);

  if (fs.existsSync(nextPath)) {
    return { filename, ok: false, reason: 'target_exists' };
  }

  if (fs.existsSync(oldPath)) {
    fs.renameSync(oldPath, nextPath);
  }

  await db.query(
    'UPDATE media_assets SET status="active", deleted_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE filename=?',
    [filename]
  );

  return { filename, ok: true };
}

async function permanentlyDeleteMedia(filename) {
  const media = await findMedia(filename, 'trashed');

  if (!media) {
    return { filename, ok: false, reason: 'not_found' };
  }

  removeUploadedFile(trashPathFor(filename));
  await db.query('DELETE FROM media_assets WHERE filename=? AND status="trashed"', [filename]);

  return { filename, ok: true };
}

router.get('/media', authRequired, editorOrAdmin, async (req, res) => {
  try {
    await syncMediaRecords();

    const status = ['active', 'trashed', 'all'].includes(req.query.status) ? req.query.status : 'active';
    const keyword = String(req.query.q || '').trim();
    const where = [];
    const params = [];

    if (status !== 'all') {
      where.push('status=?');
      params.push(status);
    }

    if (keyword) {
      where.push('(filename LIKE ? OR display_name LIKE ? OR alt_text LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await db.query(
      `
      SELECT *
      FROM media_assets
      ${whereSql}
      ORDER BY updated_at DESC, id DESC
      LIMIT 500
      `,
      params
    );

    res.json(rows.map(mapMediaRow));
  } catch (err) {
    console.error('[upload/media]', err);
    res.status(500).json({ message: '媒体库加载失败' });
  }
});

router.post('/media/batch/delete', authRequired, editorOrAdmin, async (req, res) => {
  try {
    const filenames = normalizeFilenameList(req.body.filenames);
    const force = req.body.force === true || req.body.force === '1';

    if (!filenames.length) {
      return res.status(400).json({ message: '请选择要删除的媒体文件' });
    }

    const results = [];

    for (const filename of filenames) {
      results.push(await moveMediaToTrash(filename, force));
    }

    const deleted = results.filter((item) => item.ok);
    const referenced = results.filter((item) => item.reason === 'referenced');

    if (referenced.length && !force) {
      return res.status(409).json({
        message: `有 ${referenced.length} 个文件仍被文章或站点设置引用，确认后可强制删除`,
        deleted,
        skipped: referenced,
        results,
      });
    }

    res.json({
      message: `已删除 ${deleted.length} 个媒体文件`,
      deleted,
      results,
    });
  } catch (err) {
    console.error('[upload/media/batch/delete]', err);
    res.status(500).json({ message: '批量删除失败' });
  }
});

router.post('/media/batch/restore', authRequired, editorOrAdmin, async (req, res) => {
  try {
    const filenames = normalizeFilenameList(req.body.filenames);

    if (!filenames.length) {
      return res.status(400).json({ message: '请选择要恢复的媒体文件' });
    }

    const results = [];

    for (const filename of filenames) {
      results.push(await restoreMediaFromTrash(filename));
    }

    const restored = results.filter((item) => item.ok);

    res.json({
      message: `已恢复 ${restored.length} 个媒体文件`,
      restored,
      results,
    });
  } catch (err) {
    console.error('[upload/media/batch/restore]', err);
    res.status(500).json({ message: '批量恢复失败' });
  }
});

router.post('/media/batch/permanent', authRequired, editorOrAdmin, async (req, res) => {
  try {
    const filenames = normalizeFilenameList(req.body.filenames);

    if (!filenames.length) {
      return res.status(400).json({ message: '请选择要彻底删除的媒体文件' });
    }

    const results = [];

    for (const filename of filenames) {
      results.push(await permanentlyDeleteMedia(filename));
    }

    const deleted = results.filter((item) => item.ok);

    res.json({
      message: `已彻底删除 ${deleted.length} 个媒体文件`,
      deleted,
      results,
    });
  } catch (err) {
    console.error('[upload/media/batch/permanent]', err);
    res.status(500).json({ message: '批量彻底删除失败' });
  }
});

router.put('/media/:filename', authRequired, editorOrAdmin, async (req, res) => {
  try {
    const filename = safeBasename(req.params.filename);
    const media = await findMedia(filename);

    if (!media) {
      return res.status(404).json({ message: '媒体文件不存在' });
    }

    await db.query(
      'UPDATE media_assets SET display_name=?, alt_text=? WHERE filename=?',
      [
        sanitizeDisplayText(req.body.display_name),
        sanitizeDisplayText(req.body.alt_text),
        filename,
      ]
    );

    const updated = await findMedia(filename);
    res.json(mapMediaRow(updated));
  } catch (err) {
    console.error('[upload/media/update]', err);
    res.status(500).json({ message: '媒体信息保存失败' });
  }
});

router.put('/media/:filename/rename', authRequired, editorOrAdmin, async (req, res) => {
  try {
    const filename = safeBasename(req.params.filename);
    const media = await findMedia(filename, 'active');

    if (!media) {
      return res.status(404).json({ message: '媒体文件不存在' });
    }

    const oldExt = path.extname(filename).toLowerCase();
    const requested = safeBasename(req.body.filename || '');
    const requestedExt = path.extname(requested).toLowerCase();

    if (requestedExt && requestedExt !== oldExt) {
      return res.status(400).json({ message: '改名不能修改文件类型；需要转格式请使用二次压缩' });
    }

    const nextFilename = `${sanitizeNamePart(requested || filename)}${oldExt}`;

    if (nextFilename === filename) {
      return res.json(mapMediaRow(media));
    }

    const oldPath = filePathFor(filename);
    const nextPath = filePathFor(nextFilename);

    if (!fs.existsSync(oldPath)) {
      return res.status(404).json({ message: '磁盘文件不存在' });
    }

    if (fs.existsSync(nextPath) || await findMedia(nextFilename)) {
      return res.status(409).json({ message: '目标文件名已存在' });
    }

    fs.renameSync(oldPath, nextPath);

    const oldUrl = toPublicUrl(filename);
    const nextUrl = toPublicUrl(nextFilename);
    await updateReferences(oldUrl, nextUrl);

    await db.query(
      'UPDATE media_assets SET filename=?, url=?, updated_at=CURRENT_TIMESTAMP WHERE filename=?',
      [nextFilename, nextUrl, filename]
    );

    const updated = await findMedia(nextFilename);
    res.json(mapMediaRow(updated));
  } catch (err) {
    console.error('[upload/media/rename]', err);
    res.status(500).json({ message: '媒体文件改名失败' });
  }
});

router.delete('/media/:filename', authRequired, editorOrAdmin, async (req, res) => {
  try {
    const filename = safeBasename(req.params.filename);
    const media = await findMedia(filename, 'active');

    if (!media) {
      return res.status(404).json({ message: '媒体文件不存在' });
    }

    const result = await moveMediaToTrash(filename, req.query.force === '1');

    if (result.reason === 'referenced') {
      return res.status(409).json({
        message: `该图片仍被 ${result.ref_count} 处内容引用，确认删除请再次强制删除`,
        ref_count: result.ref_count,
      });
    }

    res.json({ message: '媒体文件已移入回收站' });
  } catch (err) {
    console.error('[upload/media/delete]', err);
    res.status(500).json({ message: '媒体文件删除失败' });
  }
});

router.post('/media/:filename/restore', authRequired, editorOrAdmin, async (req, res) => {
  try {
    const filename = safeBasename(req.params.filename);
    const media = await findMedia(filename, 'trashed');

    if (!media) {
      return res.status(404).json({ message: '回收站中没有这个文件' });
    }

    const result = await restoreMediaFromTrash(filename);

    if (result.reason === 'target_exists') {
      return res.status(409).json({ message: 'uploads 中已有同名文件，无法恢复' });
    }

    const updated = await findMedia(filename, 'active');
    res.json(mapMediaRow(updated));
  } catch (err) {
    console.error('[upload/media/restore]', err);
    res.status(500).json({ message: '媒体文件恢复失败' });
  }
});

router.delete('/media/:filename/permanent', authRequired, editorOrAdmin, async (req, res) => {
  try {
    const filename = safeBasename(req.params.filename);
    const media = await findMedia(filename, 'trashed');

    if (!media) {
      return res.status(404).json({ message: '回收站中没有这个文件' });
    }

    await permanentlyDeleteMedia(filename);

    res.json({ message: '媒体文件已彻底删除' });
  } catch (err) {
    console.error('[upload/media/permanent]', err);
    res.status(500).json({ message: '彻底删除失败' });
  }
});

router.post('/media/:filename/recompress', authRequired, editorOrAdmin, async (req, res) => {
  try {
    const filename = safeBasename(req.params.filename);
    const media = await findMedia(filename, 'active');

    if (!media) {
      return res.status(404).json({ message: '媒体文件不存在' });
    }

    const filePath = filePathFor(filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: '磁盘文件不存在' });
    }

    const imageInfo = await getDetectedImageInfo(filePath);
    if (!imageInfo.ok) {
      return res.status(400).json({ message: '图片内容校验失败，无法压缩' });
    }

    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(imageInfo.safeExt)) {
      return res.status(400).json({ message: 'gif 和 ico 暂不支持二次压缩' });
    }

    const quality = normalizeQuality(req.body.quality);
    if (quality === 'original') {
      return res.status(400).json({ message: '二次压缩请选择低/中/高，不要选择原图' });
    }

    const file = {
      filename,
      path: filePath,
      size: fs.statSync(filePath).size,
    };

    const result = await compressImageIfNeeded(file, imageInfo, quality);
    const meta = await getImageMeta(file.path, file.filename, {
      original_name: media.original_name,
      display_name: media.display_name,
      alt_text: media.alt_text,
      quality,
    });

    const oldUrl = media.url;
    await updateReferences(oldUrl, meta.url);

    if (file.filename !== filename) {
      await db.query('DELETE FROM media_assets WHERE filename=?', [filename]);
    }

    await upsertMediaRecord(meta, media.uploaded_by);
    const updated = await findMedia(file.filename, 'active');

    res.json({
      ...mapMediaRow(updated),
      compressed: result.compressed,
      original_size: result.original_size,
      output_size: result.output_size,
    });
  } catch (err) {
    console.error('[upload/media/recompress]', err);
    res.status(500).json({ message: '二次压缩失败，请换一张图片或稍后重试' });
  }
});

router.post('/image', authRequired, editorOrAdmin, (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || '图片上传失败' });
    }

    if (!req.file) {
      return res.status(400).json({ message: '没有收到图片文件' });
    }

    let imageInfo = { ok: false, detected: null };

    try {
      imageInfo = await getDetectedImageInfo(req.file.path);
    } catch (magicErr) {
      console.error('[upload] image content validation failed:', magicErr.message);
    }

    if (!imageInfo.ok) {
      removeUploadedFile(req.file.path);
      return res.status(400).json({ message: '图片内容校验失败' });
    }

    const quality = normalizeQuality(req.body.quality);
    let result;

    try {
      result = await compressImageIfNeeded(req.file, imageInfo, quality);
    } catch (compressErr) {
      console.error('[upload] image compression failed:', compressErr.message);
      removeUploadedFile(req.file.path);

      return res.status(400).json({
        message: '图片压缩失败，请换一张图片，或选择原图上传',
      });
    }

    const meta = await getImageMeta(req.file.path, req.file.filename, {
      original_name: req.file.originalname,
      display_name: path.basename(req.file.originalname, path.extname(req.file.originalname || '')),
      quality: result.quality,
    });

    await upsertMediaRecord(meta, req.user?.id || null);

    res.json({
      message: '上传成功',
      url: meta.url,
      filename: meta.filename,
      quality: result.quality,
      compressed: result.compressed,
      original_size: result.original_size,
      output_size: result.output_size,
    });
  });
});

module.exports = {
  router,
  uploadDir,
};
