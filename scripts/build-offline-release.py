"""Build and verify a frontend-only offline release. Metadata is always LF bytes."""
import hashlib
import io
import json
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def make_bundle(root, revision):
    name = f'mooncci-frontend-{revision[:12]}'
    entries = {}
    for file in sorted((root / 'dist').rglob('*')):
        if file.is_symlink():
            raise ValueError(f'Symlinks are not allowed: {file}')
        if file.is_file():
            relative = file.relative_to(root).as_posix()
            if any(part.startswith('.') for part in file.relative_to(root / 'dist').parts):
                raise ValueError(f'Hidden files are not publishable: {file}')
            entries[relative] = file.read_bytes()
    if not entries.get('dist/index.html'):
        raise ValueError('Missing built index.html')
    entries['deploy.sh'] = (root / 'scripts/deploy-offline-frontend.sh').read_bytes().replace(b'\r\n', b'\n')
    entries['REVISION'] = (revision + '\n').encode('ascii')
    entries['SHA256SUMS'] = ''.join(
        f'{hashlib.sha256(data).hexdigest()}  {path}\n' for path, data in sorted(entries.items())
    ).encode('utf-8')
    output = root / '.cache' / f'{name}.tar.gz'
    output.parent.mkdir(exist_ok=True)
    with tarfile.open(output, 'w:gz') as archive:
        for path, data in sorted(entries.items()):
            info = tarfile.TarInfo(path)
            info.size = len(data)
            info.mode = 0o755 if path.endswith('.sh') else 0o644
            archive.addfile(info, io.BytesIO(data))
    # Verify every archived byte, not only that tar creation returned successfully.
    with tarfile.open(output) as archive:
        for path, data in entries.items():
            assert archive.extractfile(path).read() == data
    checksum = hashlib.sha256(output.read_bytes()).hexdigest()
    Path(str(output) + '.sha256').write_bytes(f'{checksum}  {output.name}\n'.encode('ascii'))
    result = {'revision': revision, 'package': str(output.resolve()), 'bytes': output.stat().st_size, 'sha256': checksum}
    (root / '.cache/offline-release.json').write_bytes(json.dumps(result, indent=2).encode('utf-8'))
    return result


def main():
    def git(*args):
        return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()
    if git('status', '--porcelain'):
        raise SystemExit('Commit source changes before building a release.')
    revision = git('rev-parse', 'HEAD')
    subprocess.run(['npm.cmd' if __import__('os').name == 'nt' else 'npm', 'run', 'build'], cwd=ROOT, check=True)
    if git('status', '--porcelain') or git('rev-parse', 'HEAD') != revision:
        raise SystemExit('Source changed during build; release aborted.')
    print(json.dumps(make_bundle(ROOT, revision), indent=2))


if __name__ == '__main__':
    main()
