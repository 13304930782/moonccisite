"""Package verified source bytes and dist without secrets or machine dependencies."""
from pathlib import Path
import hashlib
import io
import json
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parent.parent
NAME = 'mooncci-audit-20260909'
ROOT_FILES = {'package.json', 'package-lock.json', 'index.html', 'vite.config.ts',
              'postcss.config.mjs', 'pnpm-workspace.yaml', 'README.md', 'DEPLOY.md',
              'AUDIT-2026-09-09.md', 'AUDIT-DEPLOY.md', 'ATTRIBUTIONS.md'}

def main():
    tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    sources = []
    for name in tracked:
        if not name or not (ROOT / name).is_file():
            continue
        selected = name in ROOT_FILES or name.startswith(('src/', 'public/', 'server/src/', 'server/database/'))
        selected |= name in {'server/package.json', 'server/package-lock.json', 'server/.env.example', 'scripts/editor-sanitizer.mjs'}
        selected |= name.startswith('server/scripts/') and name != 'server/scripts/test-integration.js'
        if selected:
            assert not any(part in {'.env', 'node_modules', 'uploads', '.cache', 'backups'} for part in Path(name).parts)
            sources.append(name)
    entries = {name: (ROOT / name).read_bytes() for name in sources}
    assert (ROOT / 'dist/index.html').is_file(), 'Run npm run build first'
    for file in sorted((ROOT / 'dist').rglob('*')):
        if file.is_file():
            entries[file.relative_to(ROOT).as_posix()] = file.read_bytes()
    entries['deploy-audit.sh'] = (ROOT / 'scripts/deploy-audit.sh').read_bytes().replace(b'\r\n', b'\n')
    entries['SOURCE-FILES.txt'] = ('\n'.join(sorted(sources)) + '\n').encode()
    entries['RELEASE.json'] = (json.dumps({'name': NAME, 'commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT).decode().strip(),
                                         'migration': '202609090002_auth_revocation.sql'}, indent=2) + '\n').encode()
    entries['SHA256SUMS'] = ''.join(f'{hashlib.sha256(data).hexdigest()}  {name}\n' for name, data in sorted(entries.items())).encode()
    output = ROOT / '.cache' / (NAME + '.tar.gz')
    output.parent.mkdir(exist_ok=True)
    with tarfile.open(output, 'w:gz') as archive:
        for name, data in sorted(entries.items()):
            assert not name.startswith('/') and '..' not in Path(name).parts
            info = tarfile.TarInfo(name)
            info.size = len(data)
            info.mode = 0o755 if name.endswith('.sh') else 0o644
            archive.addfile(info, io.BytesIO(data))
    with tarfile.open(output) as archive:
        assert all(member.isfile() for member in archive.getmembers())
        for name, data in entries.items():
            assert archive.extractfile(name).read() == data
    result = {'package': str(output), 'bytes': output.stat().st_size,
              'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'files': len(entries)}
    (ROOT / '.cache' / 'audit-package.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result))

if __name__ == '__main__':
    main()
