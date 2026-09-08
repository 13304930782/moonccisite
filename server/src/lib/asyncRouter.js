const express = require('express');

// Express 4 does not forward rejected async handlers to error middleware.
function wrap(handler) {
  if (Array.isArray(handler)) return handler.map(wrap);
  if (typeof handler !== 'function' || handler.constructor.name !== 'AsyncFunction') return handler;
  if (handler.length === 4) return (error, req, res, next) => Promise.resolve(handler(error, req, res, next)).catch(next);
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
module.exports = function asyncRouter(...options) {
  const router = express.Router(...options);
  for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all', 'use']) {
    const register = router[method];
    router[method] = function (...args) { return register.apply(this, args.map(wrap)); };
  }
  return router;
};
