# Domain and mailbox migration — 2026-10

## Scope and deployment boundary

The canonical website is `https://moooncci.cn`; the status page is `https://status.moooncci.cn`. The old website host is retained for redirects. This branch is based on main and contains only domain/mail migration changes. It excludes the separate unmerged Halloween work. **Do not deploy this branch as a full replacement for the current production application:** production also contains that independent work. Build any production follow-up against its verified deployed scope and overlay only reviewed files.

No database schema migration is introduced. Existing production configuration takes precedence over source defaults. The correct default registrations are 辽ICP备2024042989号-1 and 辽公网安备21041102000430号. Nginx live vhosts, credentials and backups are deliberately not copied into Git.

## Website operations

Keep the existing physical root `/www/wwwroot/mooncci.site` and Node service paths. Configure SITE_URL, CORS/CSRF allowed origins and OAuth proxy return allowlists for the new host. QQ uses the already registered moooncci.cn application and its own credentials; each provider callback must exactly match the new domain in its provider console before enabling login. Do not replace a provider credential with another application's secret. Validate canonical, robots, sitemap and redirect responses after a scoped release. Public robots and sitemap-pages are generated/server-owned, not checked-in static files. The checked-in sitemap-index and the IndexNow/sitemap validators now use moooncci.cn; physical deployment paths stay unchanged.

## Mail compatibility and data handling

New mailbox applications and business senders use `@moooncci.cn`. Production migration moved 19 mailboxes to the new domain and resealed the 8 website mailbox identities using the new address as AAD. Old addresses remain usable for login and receiving mail. Client setup and the mail agent accept both suffixes. IMAP/SMTP client host stays `mail.cuegroveapp.com` (993/465 SSL). Existing password ciphertext is authenticated against the exact stored mailbox address: never rename a database address without decrypting under its original address and resealing under the new address. Existing legacy mail and delivery routes must remain available during the migration. Do not bulk rename mail directories or delete legacy accounts.

Operational database updates, routing aliases, backups and secret values are handled outside Git. The protected production backup root for this migration is `/www/backup/mail-domain-20261022`. A source rollback alone cannot reverse already migrated identity rows. Restore only a verified compatible backup or explicitly reverse/reseal affected identity rows; retain both domain receive routes throughout rollback.

## Mail TLS renewal

`scripts/ops/sync-mail-certificates.py` copies verified renewed certificates into BaoTa's mail copies, rebuilds the Postfix map and reloads Postfix/Dovecot. It validates the public key pair, hostname and remaining validity before replacing files, serializes runs with flock, and leaves a retry marker if reload fails. It uses fixed local paths and does not fetch certificates or print private keys. Its tests use temporary paths and mocked commands only.

Install the reviewed script on the mail server as `/usr/local/sbin/mooncci-sync-mail-certificates.py` (root-owned, mode 700). The installed Certbot deploy hook is `/etc/letsencrypt/renewal-hooks/deploy/mooncci-mail-certificates`; the BaoTa renewal fallback cron is `/etc/cron.d/mooncci-mail-certificate-sync`. Preserve any existing renewal hooks. The exact installed paths and schedules should be checked against the deployment record before replacing live files. Verify certificates externally on SMTP/IMAP after reload. To roll back, remove only the added hook/cron entry and restore the backed-up certificate copies/map before reloading mail services.

PTR/reverse DNS is controlled by the server provider: the owner must request the agreed mail hostname for the mail server IP and verify forward/reverse correspondence. Changing domain DNS alone does not change PTR. Do not claim PTR complete until the provider record is verified.

## Local verification

Run `npm run check`, `python scripts/prepare-ip-database.py`, `npm test --prefix server`, `python scripts/test_indexnow.py`, `python scripts/test_refresh_sitemap.py`, `python scripts/ops/test_sync_mail_certificates.py` and `python server/mail-agent/test_addresses.py`. Optional database integrations require the documented test database environment; skips are reported separately. No test here sends real mail or changes production.
