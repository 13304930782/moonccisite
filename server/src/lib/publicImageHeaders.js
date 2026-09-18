// Public raster images may be embedded by reader views and feed readers.
module.exports = function publicImageHeaders(res, filePath) {
  if (/\.(?:png|jpe?g|gif|webp|avif)$/i.test(filePath)) {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
};
