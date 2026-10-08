const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

// Fixed sizes and bounded work prevent arbitrary public transformations.
module.exports = function imageVariants(uploadDir) {
  const cache = new Map(), pending = new Map();
  let bytes = 0;
  return async (req, res) => {
    const width = Number(req.params.width), name = req.params.name;
    if (![48, 96, 144, 180, 360, 540].includes(width) || !/^[\w.-]+\.(png|jpe?g|webp)$/i.test(name)) return res.sendStatus(404);
    try {
      const root = await fs.realpath(uploadDir);
      const file = await fs.realpath(path.join(root, name));
      if (path.dirname(file) !== root) return res.sendStatus(404);
      const stat = await fs.stat(file);
      if (!stat.isFile()) return res.sendStatus(404);
      const key = `${name}:${width}:${stat.mtimeMs}:${stat.size}`;
      let data = cache.get(key);
      if (!data) {
        if (!pending.has(key)) {
          if (pending.size >= 2) return res.redirect(302, `/api/uploads/${encodeURIComponent(name)}`);
          const work = sharp(file, { limitInputPixels: 40000000 }).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer().then(buffer => {
            while (cache.size && bytes + buffer.length > 16 * 1024 * 1024) {
              const oldest = cache.keys().next().value;
              bytes -= cache.get(oldest).length; cache.delete(oldest);
            }
            if (buffer.length <= 16 * 1024 * 1024) { cache.set(key, buffer); bytes += buffer.length; }
            return buffer;
          }).finally(() => pending.delete(key));
          pending.set(key, work);
        }
        data = await pending.get(key);
      } else { cache.delete(key); cache.set(key, data); }
      res.set('Cache-Control', 'public, max-age=3600').type('webp').send(data);
    } catch (error) {
      if (error.code === 'ENOENT') return res.sendStatus(404);
      res.redirect(302, `/api/uploads/${encodeURIComponent(name)}`);
    }
  };
};
