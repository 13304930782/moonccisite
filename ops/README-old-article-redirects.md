# Old WordPress article redirects

This release maps the four published WordPress articles on `moooncci.cn` to
their matching published articles on `mooncci.site`. It also redirects the
bare old homepage to the new homepage. Query-driven WordPress routes such as
`/?p=171` and `/?s=term` continue through WordPress. It does not alter the
new site, database, PM2, or WordPress files.

Build with `python scripts/build-old-article-redirect-release.py`. Copy the
archive and `.sha256` sidecar to the old-domain host. Verify the sidecar,
extract into a fresh directory, then run `deploy.sh` in a `nohup` child shell.
The installer checks the current virtual-host, rewrite, and previous redirect
file hashes, checks the release files, backs up the previous extension file,
installs the replacement, tests Nginx syntax, and reloads Nginx. It restores
the previous extension file if syntax or reload fails.

After installation, request all four old URLs and confirm a direct 301 to the
matching new article. Check that the bare old homepage redirects to the new
homepage, `/?p=171` still reaches the matching article, and the new pages are
200 with new-domain canonicals. Keep the old domain and these redirects
available during search reindexing.

Rollback only this upgrade by comparing the installed extension file's SHA256
to the released config, restoring the `BACKUP_FILE` printed in the deployment
log to the `INSTALLED_FILE`, then running `nginx -t` and `nginx -s reload`.
Do not remove the extension directory or `site_total.conf`.
