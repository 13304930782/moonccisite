# US Roundcube webmail
Target: mail.cuegroveapp.com (107.174.123.42), webmail.cuegroveapp.com.
Requires an existing BaoTa PHP 8.2 website and a valid certificate at the standard
BaoTa path. PHP fileinfo, mbstring, intl, DOM/XML, OpenSSL, curl and PDO SQLite
must be installed. Requires Python 3, curl and openssl on the server.

This offline package installs Roundcube 1.7.4 complete. It creates only
roundcube-1.7.4 and roundcube-data beneath the webmail site's directory,
backs up and replaces only that site's Nginx configuration, then reloads Nginx.
No mail server settings, mailbox data, existing databases or PM2 apps are changed.
SQLite stores preferences, contacts, sessions and cache; mail stays in Dovecot.
Login uses the full existing mailbox address and its mailbox password.

Run in a child shell with nohup, not by sourcing scripts in an interactive shell.
run.sh verifies internal checksums. The installer validates local IMAPS and SMTPS
certificates without sending mail. Certificate renewal must continue independently.
Only public_html is served; installer access is blocked. The SQLite file is private.

On HTTP verification failure the old vhost is restored and Nginx reloaded.
New application/data files remain for diagnosis; reruns stop before overwrite.
The printed rollback.sh restores the vhost without deleting any data.
Logs: /www/wwwroot/webmail.cuegroveapp.com/roundcube-data/logs/.
Acceptance requires a user login, viewing old messages and a send/reply test.
Manual DNS issuance does not provide automatic renewal: configure that separately.
