# US login relay
Prepared service, not yet deployed. Requires Node.js 22 or later, no npm dependencies.
Bind only 127.0.0.1:3103 behind a dedicated TLS Nginx host.
Use a root-controlled service environment file containing GITHUB_OAUTH_PROXY_KEY.
Do not print, commit or put that key into browser code.

GET /google-certs fetches Google's fixed public certificate endpoint. Valid certificates
are cached for at most the upstream max-age, five minutes and certificate expiry.
Expired cache is never served after upstream failure.

POST /token, GET /user and GET /emails preserve the existing version-3 Worker protocol.
GitHub requests have fixed upstreams, no redirects, no retries and no credential cache.
No request bodies, headers or raw errors are logged.
Keep the old Cloudflare proxy and CN environment backup until real login acceptance.

Deployment must use DNS-only A to 107.174.123.42; an orange-cloud host would retain
the problematic CN-to-Cloudflare hop. Preflight port 3103, Node path, Nginx and TLS.
Then compare repeated CN probes before switching GOOGLE_CERTS_URL and
GITHUB_OAUTH_PROXY_URL. Only mooncci-api is restarted after scoped env changes.
Microsoft is outside this package's scope.
