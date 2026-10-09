DB-IP IP to City Lite, October 2026

Source: https://download.db-ip.com/free/dbip-city-lite-2026-10.mmdb.gz
License: Creative Commons Attribution 4.0 International (CC BY 4.0)
License text: https://creativecommons.org/licenses/by/4.0/legalcode
Database provider and attribution: https://db-ip.com/db/lite.php

This unmodified database is used for city-level foreign IP fallback only.
It is not used to infer Chinese cities because the validation sample failed.
The original compressed database is versioned; the expanded binary stays
outside Git. The offline release verifies and bundles the expanded database.
Pages displaying results link to DB-IP.com.

After a fresh checkout, run `python scripts/prepare-ip-database.py` from the
repository root before running the server tests or packaging weather services.
The script expands the versioned archive and checks the SHA-256 from
PROVENANCE.json, refusing changed bytes. CI runs the same preparation without
network access; it does not skip database tests.

Reader: mmdb-lib 3.0.3, https://www.npmjs.com/package/mmdb-lib, MIT.
Pinned package integrity: sha512-xQPoBXcNjjHiOvOraFBKtA++uNWF6aCVHL9dRKFXEov8eI3QJwtgiw3qApsonFT5SpoqsEVISUTg3HIDs2DiXw==
