"""Build a baseline-bound frontend, SSR and site-settings offline release."""
import argparse
import hashlib
import io
import json
import re
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def digest(data):
    return hashlib.sha256(data).hexdigest()


def files():
    result = ['server/src/routes/settings.js']
    for directory in ['dist', 'server/runtime']:
        root = ROOT / directory
        for file in sorted(root.rglob('*')):
            rel = file.relative_to(root)
            if 'node_modules' in rel.parts or file.name == 'deployment.json':
                continue
            if file.is_symlink():
                raise ValueError('Symlink in output: ' + str(file))
            if file.is_file() and not any(part.startswith('.') for part in rel.parts):
                result.append(directory + '/' + rel.as_posix())
    for required in ['dist/index.html', 'server/runtime/document.mjs', 'server/runtime/home.css', 'server/runtime/styles.json']:
        if required not in result:
            raise ValueError('Missing output: ' + required)
    return sorted(result)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--list-files', action='store_true')
    parser.add_argument('--baseline', type=Path)
    args = parser.parse_args()
    names = files()
    if args.list_files:
        print(json.dumps(names, indent=2)); return
    if not args.baseline:
        raise ValueError('Production baseline required')
    status = subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True)
    if status.strip():
        raise ValueError('Commit source before packaging')
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    baseline = json.loads(args.baseline.read_text(encoding='utf-8-sig'))
    if set(baseline) != set(names) or any(v is not None and not re.fullmatch('[0-9a-f]{64}', v) for v in baseline.values()):
        raise ValueError('Production baseline scope mismatch')
    entries = {}
    for name in names:
        data = (ROOT / name).read_bytes()
        entries[name] = data.replace(b'\r\n', b'\n') if name.startswith('server/') and Path(name).suffix in ('.js', '.mjs', '.json', '.css') else data
    entries['BASELINE.json'] = (json.dumps(baseline, sort_keys=True) + '\n').encode()
    entries['MANIFEST.json'] = (json.dumps({'revision': revision, 'files': {n: digest(d) for n,d in entries.items() if n != 'BASELINE.json'}}, sort_keys=True) + '\n').encode()
    for name in ['deploy-experience-preview.sh', 'experience-preview-release.py']:
        entries[name] = (ROOT / 'scripts' / name).read_bytes().replace(b'\r\n', b'\n')
    entries['SHA256SUMS'] = ''.join(digest(data)+'  '+name+'\n' for name,data in sorted(entries.items())).encode()
    out = ROOT / '.cache' / ('mooncci-experience-' + revision[:12] + '.tar.gz')
    out.parent.mkdir(exist_ok=True)
    with tarfile.open(out, 'w:gz') as archive:
        for name,data in sorted(entries.items()):
            info=tarfile.TarInfo(name); info.size=len(data); info.mode=0o755 if name.endswith('.sh') else 0o644
            archive.addfile(info,io.BytesIO(data))
    with tarfile.open(out) as archive:
        assert {m.name: archive.extractfile(m).read() for m in archive.getmembers()} == entries
    checksum=digest(out.read_bytes())
    Path(str(out)+'.sha256').write_bytes((checksum+'  '+out.name+'\n').encode())
    print(json.dumps({'package':str(out),'sha256':checksum,'files':len(names),'revision':revision}))


if __name__ == '__main__':
    main()
