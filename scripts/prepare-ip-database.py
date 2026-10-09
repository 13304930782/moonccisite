"""Fetch the pinned public DB-IP dataset for local setup and CI; verify before install."""
import gzip
import hashlib
import json
from pathlib import Path

directory = Path(__file__).resolve().parent.parent / 'server/data/dbip'
provenance = json.loads((directory / 'PROVENANCE.json').read_text(encoding='utf-8'))
target = directory / 'dbip-city-lite-2026-10.mmdb'
expected = provenance['verifiedSha256']
if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == expected:
    print('Pinned DB-IP database verified')
else:
    # Keep CI reproducible when the provider rejects hosted-runner downloads.
    data = gzip.decompress((directory / 'dbip-city-lite-2026-10.mmdb.gz').read_bytes())
    if len(data) != provenance['uncompressedBytes'] or hashlib.sha256(data).hexdigest() != expected:
        raise SystemExit('DB-IP dataset checksum mismatch; nothing installed')
    temporary = target.with_suffix('.tmp')
    temporary.write_bytes(data)
    temporary.replace(target)
    print('Pinned DB-IP database installed and verified')
