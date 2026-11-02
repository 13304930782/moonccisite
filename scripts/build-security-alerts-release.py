"""Package only the reviewed dependency delta, built frontend and document runtime."""
import hashlib, importlib.util, io, json, os, subprocess, tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = 'c1ed37b980991c14ad06cf98be9c7f4528bdd853'

def sha(data): return hashlib.sha256(data).hexdigest()
def normalized(path): return path.read_bytes().replace(b'\r\n', b'\n')

def dependency_delta(before, after):
    names = sorted(name for name in set(before['packages']) | set(after['packages'])
                   if name.startswith('node_modules/') and before['packages'].get(name) != after['packages'].get(name))
    return [name for name in names if not any(name.startswith(parent + '/') for parent in names if parent != name)]

def make_bundle(root, revision, previous):
    spec = importlib.util.spec_from_file_location('frontend_release', root/'scripts/build-offline-release.py')
    frontend = importlib.util.module_from_spec(spec); spec.loader.exec_module(frontend)
    with tarfile.open(frontend.make_bundle(root, revision)['package']) as archive:
        entries = {m.name: archive.extractfile(m).read() for m in archive.getmembers()}
    entries.pop('SHA256SUMS')
    modules = dependency_delta(json.loads(previous['package-lock.json']), json.loads(normalized(root/'server/package-lock.json')))
    if not modules: raise ValueError('Dependency delta is empty')
    for name in ['package.json', 'package-lock.json']:
        entries['server/'+name] = normalized(root/'server'/name)
    versions = {}
    old_lock = json.loads(previous['package-lock.json'])['packages']
    new_lock = json.loads(entries['server/package-lock.json'])['packages']
    for name in modules:
        if name not in new_lock: raise ValueError('Dependency removal requires a separately reviewed package: '+name)
        directory = root/'server'/name
        if json.loads((directory/'package.json').read_text(encoding='utf-8'))['version'] != new_lock[name]['version']:
            raise ValueError('Installed dependency differs from lock: '+name)
        versions[name] = {'before': old_lock.get(name, {}).get('version'), 'after': new_lock[name]['version']}
        for path in sorted(directory.rglob('*')):
            if path.is_symlink(): raise ValueError('Dependency symlink: '+str(path))
            if path.is_file():
                if path.suffix in ['.node', '.dll', '.exe']: raise ValueError('Native dependency requires Linux packaging')
                entries['server/'+path.relative_to(root/'server').as_posix()] = path.read_bytes()
    for path in sorted((root/'server/runtime').rglob('*')):
        relative = path.relative_to(root/'server/runtime')
        if 'node_modules' in relative.parts or path.name == 'deployment.json': continue
        if path.is_symlink(): raise ValueError('Runtime symlink')
        if path.is_file(): entries['server/runtime/'+relative.as_posix()] = path.read_bytes()
    for required in ['server/runtime/document.mjs', 'server/runtime/styles.json', 'server/runtime/home.css']:
        if not entries.get(required): raise ValueError('Missing built runtime: '+required)
    entries['deploy.py'] = normalized(root/'scripts/deploy-security-alerts.py')
    entries['deploy.sh'] = b'#!/bin/bash\nset -euo pipefail\ncd "$(dirname "$0")"\nsha256sum --strict -c SHA256SUMS\npython3 deploy.py\n'
    manifest = {'version': 1, 'revision': revision, 'dependencies': versions,
                'baseline': {name: sha(data) for name, data in previous.items()},
                'files': {name: sha(data) for name, data in entries.items() if name.startswith(('server/', 'dist/'))},
                'restart': ['mooncci-api', 'mooncci-worker'], 'migrations': False}
    entries['MANIFEST.json'] = (json.dumps(manifest, indent=2)+'\n').encode()
    entries['SHA256SUMS'] = ''.join(sha(data)+'  '+name+'\n' for name,data in sorted(entries.items())).encode()
    output = root/'.cache'/f'mooncci-security-alerts-{revision[:12]}.tar.gz'
    with tarfile.open(output,'w:gz') as archive:
        for name,data in sorted(entries.items()):
            item=tarfile.TarInfo(name);item.size=len(data);item.mode=0o755 if name.endswith('.sh') else 0o644
            archive.addfile(item,io.BytesIO(data))
    with tarfile.open(output) as archive:
        assert {m.name:archive.extractfile(m).read() for m in archive.getmembers()} == entries
    for name in ['deploy.py','deploy.sh','REVISION','MANIFEST.json','SHA256SUMS']:
        assert b'\r' not in entries[name],name
    digest=sha(output.read_bytes());Path(str(output)+'.sha256').write_bytes((digest+'  '+output.name+'\n').encode())
    result={'package':str(output.resolve()),'revision':revision,'sha256':digest,'dependencies':versions}
    (root/'.cache/security-alerts-release.json').write_bytes((json.dumps(result,indent=2)+'\n').encode())
    return result

if __name__ == '__main__':
    def git(*args): return subprocess.check_output(['git',*args],cwd=ROOT)
    if git('status','--porcelain').strip(): raise SystemExit('Commit all release changes before packaging')
    revision=git('rev-parse','HEAD').decode().strip()
    npm='npm.cmd' if os.name=='nt' else 'npm'
    for task in ['build','check:bundle']: subprocess.run([npm,'run',task],cwd=ROOT,check=True)
    if git('status','--porcelain').strip() or git('rev-parse','HEAD').decode().strip()!=revision:
        raise SystemExit('Source changed during build')
    previous={name:git('show',BASE+':server/'+name).replace(b'\r\n',b'\n') for name in ['package.json','package-lock.json']}
    print(json.dumps(make_bundle(ROOT,revision,previous),indent=2))
