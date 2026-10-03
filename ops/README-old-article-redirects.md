# Old WordPress article redirects

This release maps the four published WordPress articles on `moooncci.cn` to
their matching published articles on `mooncci.site`. It changes no other old
site route and does not alter the new site, database, PM2, or WordPress files.

Build with `python scripts/build-old-article-redirect-release.py`. Copy the
archive and `.sha256` sidecar to the old-domain host. Verify the sidecar,
extract into a fresh directory, then run `deploy.sh` in a `nohup` child shell.
The installer checks the current virtual-host and rewrite hashes, checks the
release files, installs one Nginx extension file, tests Nginx syntax, and
reloads Nginx. It removes the new file if syntax or reload fails.

After installation, request all four old URLs and confirm a direct 301 to the
matching new article. Check that the old homepage still responds normally and
that the new article pages are 200 with new-domain canonicals. Keep the old
domain and these redirects available during search reindexing.

Rollback only this release by comparing the installed extension file's SHA256
to the released config, removing that exact file, then running `nginx -t` and
`nginx -s reload`. Do not remove the extension directory or `site_total.conf`.
