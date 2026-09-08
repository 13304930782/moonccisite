const https = require('https');
const jwt = require('jsonwebtoken');

const DEFAULT_GOOGLE_CERTS_URL = 'https://google-certs.mooncci.site/google-certs';
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
const MAX_TOKEN_LENGTH = 12000;

let certificateCache = {
  certificates: null,
  expiresAt: 0,
  request: null,
};

function cacheLifetime(headers) {
  const match = String(headers['cache-control'] || '').match(/max-age=(\d+)/i);
  const seconds = match ? Number(match[1]) : 300;
  return Math.max(60, Math.min(seconds, 24 * 60 * 60)) * 1000;
}

function requestCertificates() {
  return new Promise((resolve, reject) => {
    const certificatesUrl = String(process.env.GOOGLE_CERTS_URL || DEFAULT_GOOGLE_CERTS_URL).trim();
    const request = https.get(certificatesUrl, { timeout: 6000 }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Google certificate request failed with ${response.statusCode}`));
        return;
      }

      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
        if (body.length > 1024 * 1024) request.destroy(new Error('Google certificate response is too large'));
      });
      response.on('end', () => {
        try {
          const certificates = JSON.parse(body);
          resolve({
            certificates,
            expiresAt: Date.now() + cacheLifetime(response.headers),
          });
        } catch {
          reject(new Error('Google certificate response is invalid'));
        }
      });
    });

    request.on('timeout', () => request.destroy(new Error('Google certificate request timed out')));
    request.on('error', reject);
  });
}

async function getCertificates(forceRefresh = false) {
  if (!forceRefresh && certificateCache.certificates && certificateCache.expiresAt > Date.now()) {
    return certificateCache.certificates;
  }

  if (!certificateCache.request || forceRefresh) {
    certificateCache.request = requestCertificates()
      .then((result) => {
        certificateCache.certificates = result.certificates;
        certificateCache.expiresAt = result.expiresAt;
        return result.certificates;
      })
      .finally(() => {
        certificateCache.request = null;
      });
  }

  return certificateCache.request;
}

async function verifyGoogleCredential(credential, audience) {
  const token = String(credential || '').trim();
  const clientId = String(audience || '').trim();

  if (!clientId) throw new Error('Google client ID is not configured');
  if (!token || token.length > MAX_TOKEN_LENGTH) throw new Error('Google credential is invalid');

  const decoded = jwt.decode(token, { complete: true });
  const header = decoded && decoded.header;

  if (!header || header.alg !== 'RS256' || !header.kid) {
    throw new Error('Google credential header is invalid');
  }

  let certificates = await getCertificates();
  let certificate = certificates[header.kid];

  if (!certificate) {
    certificates = await getCertificates(true);
    certificate = certificates[header.kid];
  }

  if (!certificate) throw new Error('Google signing key was not found');

  const payload = jwt.verify(token, certificate, {
    algorithms: ['RS256'],
    audience: clientId,
    issuer: GOOGLE_ISSUERS,
  });

  if (!payload || typeof payload !== 'object' || !payload.sub || !payload.email) {
    throw new Error('Google credential payload is incomplete');
  }

  if (payload.email_verified !== true) {
    throw new Error('Google email is not verified');
  }

  return payload;
}

module.exports = { verifyGoogleCredential };
