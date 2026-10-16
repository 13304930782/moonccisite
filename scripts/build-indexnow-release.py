#!/usr/bin/env python3
"""Build a verified offline IndexNow package without rebuilding the application."""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    'indexnow.py': 'scripts/indexnow.py',
    'deploy.sh': 'scripts/deploy-indexnow.sh',
    'rollback.sh': 'scripts/rollback-indexnow.sh',
    'mooncci-indexnow.service': 'scripts/mooncci-indexnow.service',
    'mooncci-indexnow.timer': 'scripts/mooncci-indexnow.timer',
}
README = '''Run this package in a child shell; never source deploy.sh or rollback.sh.

Verify the archive sidecar before extraction, then start:
  nohup bash deploy.sh > deploy.log 2>&1 < /dev/null &

Installation keeps mooncci-indexnow.timer disabled and does not submit URLs.
After the public key URL returns the exact key over HTTPS, perform the first run:
  /usr/bin/python3 /opt/mooncci-indexnow/indexnow.py run
Review the result, then enable periodic checks:
  systemctl enable --now mooncci-indexnow.timer
  journalctl -u mooncci-indexnow.service -n 30 --no-pager

deploy.log prints a UTC timestamped BACKUP and a complete nohup rollback command.
The backup includes persistent/key, state.json, lock and any prior public key,
with a separate SHA256SUMS. These private copies have mode 0600. Rollback restores
the previous scoped files and unit states; the current key and submission queue
remain in place so successful submissions are not replayed by a rollback.
This package never deploys frontend/backend files, restarts PM2, runs SQL,
changes .env, changes the sitemap service, or modifies the reader.
'''


def digest(data):
    return hashlib.sha256(data).hexdigest()


def build(output=None):
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=str(ROOT)).decode().strip()
    entries = {name: (ROOT / source).read_bytes().replace(b'\r\n', b'\n')
               for name, source in SOURCES.items()}
    entries['README.txt'] = README.encode('utf-8')
    if any(b'\r' in data for data in entries.values()):
        raise ValueError('Release text must use LF bytes')
    manifest = {'version': 1, 'component': 'mooncci-indexnow', 'revision': revision,
                'files': {name: digest(data) for name, data in sorted(entries.items())},
                'dependencies': False, 'migrations': False, 'restarts': [],
                'timer_enabled': False, 'initial_submit': False}
    entries['MANIFEST.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    entries['SHA256SUMS'] = ''.join(digest(entries[name]) + '  ' + name + '\n'
                                  for name in sorted(entries)).encode()
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode='wb', filename='', mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w') as archive:
            for name, data in sorted(entries.items()):
                member = tarfile.TarInfo(name)
                member.size = len(data)
                member.mode = 0o755 if name.endswith('.sh') else 0o644
                archive.addfile(member, io.BytesIO(data))
    payload = buffer.getvalue()
    with tarfile.open(fileobj=io.BytesIO(payload), mode='r:gz') as archive:
        members = archive.getmembers()
        if len(members) != len(entries) or set(archive.getnames()) != set(entries):
            raise ValueError('Archive file list mismatch')
        for member in members:
            if not member.isfile() or archive.extractfile(member).read() != entries[member.name]:
                raise ValueError('Archive readback mismatch')
        for line in archive.extractfile('SHA256SUMS').read().decode().splitlines():
            expected, name = line.split('  ', 1)
            if digest(archive.extractfile(name).read()) != expected:
                raise ValueError('Archived checksum mismatch')
    destination = output or ROOT / '.cache' / ('mooncci-indexnow-' + revision[:12] + '.tar.gz')
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(payload)
    sidecar = (digest(payload) + '  ' + destination.name + '\n').encode()
    Path(str(destination) + '.sha256').write_bytes(sidecar)
    if b'\r' in sidecar or destination.read_bytes() != payload:
        raise ValueError('Release write verification failed')
    return {'archive': str(destination), 'sha256': digest(payload), 'revision': revision,
            'bytes': len(payload), 'files': sorted(entries), 'verified': True}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    print(json.dumps(build(parser.parse_args().output), indent=2))
