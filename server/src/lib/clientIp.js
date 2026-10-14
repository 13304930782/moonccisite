const net = require('node:net');
function clientIp(req) {
  const value = String(req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  return net.isIP(value) ? value : '';
}
module.exports = { clientIp };
