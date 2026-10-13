"""One backend service only; no frontend, dependencies, migrations, or secrets."""
import hashlib, io, json, subprocess, tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SERVICE = 'src/services/articleSummary.js'
BASE = '64afaecdd92610a37bc41fd2ba7f520254795a3a'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def git(*args):
    return subprocess.check_output(['git', '-c', 'safe.directory='+str(ROOT), *args], cwd=ROOT)

def main():
    if git('status', '--porcelain').strip():
        raise SystemExit('Commit source before packaging.')
    revision = git('rev-parse', 'HEAD').decode().strip()
    previous = git('show', BASE+':server/'+SERVICE).replace(b'\r\n', b'\n')
    current = (ROOT/'server'/SERVICE).read_bytes().replace(b'\r\n', b'\n')
    manifest = {'revision':revision, 'base_revision':BASE, 'service':SERVICE,
                'previous_sha256':sha(previous), 'next_sha256':sha(current),
                'restarts':['mooncci-api','mooncci-worker'], 'frontend':False,
                'dependencies_changed':False, 'migrations':[], 'env_changes':False}
    entries = {'server/'+SERVICE:current,
               'MANIFEST.json':(json.dumps(manifest, indent=2)+'\n').encode()}
    for name in ['deploy','rollback']:
        entries[name+'.sh'] = (ROOT/'scripts'/(name+'-summary-validation.sh')).read_bytes().replace(b'\r\n', b'\n')
    entries['SHA256SUMS'] = ''.join(sha(data)+'  '+name+'\n' for name,data in sorted(entries.items())).encode()
    output = ROOT/'.cache'/('mooncci-summary-validation-'+revision[:12]+'.tar.gz')
    with tarfile.open(output, 'w:gz') as archive:
        for name,data in sorted(entries.items()):
            info = tarfile.TarInfo(name)
            info.size = len(data)
            info.mode = 0o755 if name.endswith('.sh') else 0o644
            archive.addfile(info, io.BytesIO(data))
    with tarfile.open(output) as archive:
        assert set(archive.getnames()) == set(entries)
        for name,data in entries.items():
            assert archive.extractfile(name).read() == data
            assert b'\r' not in data, name
        for line in archive.extractfile('SHA256SUMS').read().decode().splitlines():
            expected,name = line.split('  ',1)
            assert sha(archive.extractfile(name).read()) == expected
    digest = sha(output.read_bytes())
    Path(str(output)+'.sha256').write_bytes((digest+'  '+output.name+'\n').encode())
    assert b'\r' not in Path(str(output)+'.sha256').read_bytes()
    if git('status', '--porcelain').strip() or git('rev-parse','HEAD').decode().strip()!=revision:
        raise SystemExit('Source changed while packaging.')
    result={'archive':str(output),'sha256':digest,'revision':revision,'files':list(entries),'bytes':output.stat().st_size}
    (ROOT/'.cache/summary-validation-release.json').write_bytes((json.dumps(result,indent=2)+'\n').encode())
    print(json.dumps(result,indent=2))

if __name__=='__main__':
    main()
