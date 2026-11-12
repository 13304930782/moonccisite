"""Build the scoped motion/SEO and article-likes offline release."""
import argparse
import datetime
import hashlib
import io
import json
import re
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ('server/src/index.js', 'server/src/routes/account.js', 'server/src/routes/articleLikes.js')
MIGRATION = 'server/database/migrations/202611120001_article_likes.sql'
AUX = ('server/scripts/migrate-article-likes.js',)
TOOLS = {'deploy.sh': 'deploy-motion-seo.sh', 'rollback-bilingual.sh': 'rollback-motion-seo.sh',
         'verify-bilingual-release.cjs': 'verify-bilingual-release.cjs', 'cleanup-motion-seo.cjs': 'cleanup-motion-seo.cjs'}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def safe(name):
    return bool(re.fullmatch(r'[A-Za-z0-9_@+.,/-]+', name)) and all(x not in ('', '.', '..') for x in name.split('/'))

def files(root):
    names = [*BACKEND, MIGRATION]
    for directory in ('dist', 'server/runtime'):
        for file in (root / directory).rglob('*'):
            relative = file.relative_to(root / directory)
            if 'node_modules' in relative.parts or file.name == 'deployment.json': continue
            if file.is_symlink(): raise ValueError('Symlink in build: ' + str(relative))
            if file.is_file() and not any(x.startswith('.') for x in relative.parts): names.append(file.relative_to(root).as_posix())
    for name in ('dist/index.html', 'server/runtime/document.mjs', 'server/runtime/styles.json', 'server/runtime/home.css'):
        if name not in names: raise ValueError('Missing build file: ' + name)
    return sorted(names)

def bundle(root, revision, names, baseline, backend_baseline):
    if not re.fullmatch(r'[a-f0-9]{40}', revision): raise ValueError('Invalid revision')
    if baseline.get('version') != 1 or set(baseline.get('files', {})) != set(names): raise ValueError('Baseline scope mismatch')
    age = (datetime.datetime.now(datetime.timezone.utc) - datetime.datetime.fromisoformat(baseline['captured_at'].replace('Z', '+00:00'))).total_seconds()
    if not 0 <= age <= 86400: raise ValueError('Baseline must be less than 24 hours old')
    if set(baseline.get('prerequisites', {})) != {'package.json', 'package-lock.json'}: raise ValueError('Dependency prerequisite scope')
    for name, digest in baseline['prerequisites'].items():
        if sha((root / 'server' / name).read_bytes().replace(b'\r\n', b'\n')) != digest: raise ValueError('Dependency mismatch: ' + name)
    entries = {}
    for name in names:
        if not safe(name) or not name.startswith(('dist/', 'server/runtime/')) and name not in (*BACKEND, MIGRATION): raise ValueError('Protected scope: ' + name)
        source = root / name
        if source.is_symlink() or not source.is_file(): raise ValueError('Invalid file: ' + name)
        entries[name] = source.read_bytes().replace(b'\r\n', b'\n') if name in (*BACKEND, MIGRATION) else source.read_bytes()
        previous = baseline['files'][name]
        if previous is not None and not re.fullmatch(r'[a-f0-9]{64}', previous): raise ValueError('Invalid baseline hash')
        if name in BACKEND and previous not in (backend_baseline[name], sha(entries[name])): raise ValueError('Unreviewed backend drift: ' + name)
        if name == MIGRATION and previous not in (None, sha(entries[name])): raise ValueError('Existing migration differs: ' + name)
    for name in AUX:
        entries[name] = (root / name).read_bytes().replace(b'\r\n', b'\n')
    for target, source in TOOLS.items():
        entries[target] = (root / 'scripts' / source).read_bytes().replace(b'\r\n', b'\n')
    entries['MANIFEST.json'] = (json.dumps({'version': 1, 'revision': revision, 'files': {n: sha(entries[n]) for n in names}}, indent=2) + '\n').encode()
    entries['BASELINE.json'] = (json.dumps(baseline, indent=2) + '\n').encode()
    entries['SHA256SUMS'] = ''.join(sha(data) + '  ' + name + '\n' for name, data in sorted(entries.items())).encode()
    output = root / '.cache' / ('mooncci-motion-seo-' + revision[:12] + '.tar.gz')
    output.parent.mkdir(exist_ok=True)
    with tarfile.open(output, 'w:gz') as archive:
        for name, data in sorted(entries.items()):
            info = tarfile.TarInfo(name); info.size = len(data); info.mode = 0o755 if name.endswith('.sh') else 0o644
            archive.addfile(info, io.BytesIO(data))
    with tarfile.open(output) as archive:
        assert {m.name: archive.extractfile(m).read() for m in archive.getmembers()} == entries
    for name, data in entries.items():
        if name.endswith(('.sh', '.sql')) or name in ('MANIFEST.json', 'BASELINE.json', 'SHA256SUMS'): assert b'\r' not in data
    Path(str(output) + '.sha256').write_bytes((sha(output.read_bytes()) + '  ' + output.name + '\n').encode())
    return {'package': str(output), 'sha256': sha(output.read_bytes()), 'files': len(names)}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--list-files', action='store_true'); parser.add_argument('--baseline', type=Path)
    args = parser.parse_args(); names = files(ROOT)
    if args.list_files: print(json.dumps(names, indent=2))
    else:
        if not args.baseline: raise SystemExit('--baseline is required')
        def git(*args): return subprocess.check_output(['git', *args], cwd=ROOT).decode().strip()
        if git('status', '--porcelain', '--untracked-files=all', '--', '.', ':(exclude)outputs/**'): raise SystemExit('Commit release sources before packaging')
        original = {}
        for name in BACKEND:
            try: original[name] = sha(subprocess.check_output(['git', 'show', 'c57f300:' + name], cwd=ROOT).replace(b'\r\n', b'\n'))
            except subprocess.CalledProcessError: original[name] = None
        print(json.dumps(bundle(ROOT, git('rev-parse', 'HEAD'), names, json.loads(args.baseline.read_text(encoding='utf-8-sig')), original), indent=2))
