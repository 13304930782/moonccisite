// Snapshot supplied by the user on 2026-09-20; not a new deployment.
const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v1/certs';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } });
    }
    if (url.pathname !== '/google-certs') return new Response('Not Found', { status: 404 });
    try {
      const upstream = await fetch(GOOGLE_CERTS_URL, { headers: { Accept: 'application/json' } });
      if (!upstream.ok) return new Response('Google certificate service unavailable', { status: 502 });
      const certificates = await upstream.json();
      return Response.json(certificates, {
        headers: {
          'Cache-Control': upstream.headers.get('Cache-Control') || 'public, max-age=300',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch {
      return new Response('Google certificate service unavailable', { status: 502 });
    }
  },
};
