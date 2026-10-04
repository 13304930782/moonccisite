"""Two independently reversible packages. No dependencies, SQL or environment values."""
import hashlib, io, json, subprocess, tarfile
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
BASE = 'f72c184ff709771bbfc56dd4f4d1b1ff158527c0'
SCOPES = {'api': ['server/src/index.js', 'server/src/lib/siteDiagnostics.js'],
          'reader': ['edge/reader/server.mjs']}
def digest(data): return hashlib.sha256(data.replace(b'\r\n', b'\n')).hexdigest()
def main():
    if subprocess.check_output(['git','status','--porcelain'],cwd=ROOT).strip():
        raise SystemExit('Commit reviewed source first')
    revision = subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    for scope, files in SCOPES.items():
        entries = {name:(ROOT/name).read_bytes().replace(b'\r\n',b'\n') for name in files}
        baseline = {}
        for name in files:
            old = subprocess.run(['git','show',BASE+':'+name],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            baseline[name] = {'before': digest(old.stdout) if old.returncode == 0 else None, 'after': digest(entries[name])}
        entries['FILES.json'] = (json.dumps({'scope':scope,'files':baseline,'revision':revision},indent=2)+'\n').encode()
        for name in ['site-diagnostics-files.py','deploy-site-diagnostics.sh','rollback-site-diagnostics.sh']:
            entries[name] = (ROOT/'scripts'/name).read_bytes().replace(b'\r\n',b'\n')
        entries['SHA256SUMS'] = ''.join(digest(data)+'  '+name+'\n' for name,data in sorted(entries.items())).encode()
        output = ROOT/'.cache'/f'mooncci-site-diagnostics-{scope}-{revision[:12]}.tar.gz'
        with tarfile.open(output,'w:gz') as archive:
            for name,data in sorted(entries.items()):
                assert b'\r' not in data
                item=tarfile.TarInfo(name);item.size=len(data);item.mode=0o700 if name.endswith('.sh') else 0o600
                archive.addfile(item,io.BytesIO(data))
        with tarfile.open(output) as archive:
            assert set(archive.getnames()) == set(entries)
            for name,data in entries.items(): assert archive.extractfile(name).read() == data
        Path(str(output)+'.sha256').write_bytes((hashlib.sha256(output.read_bytes()).hexdigest()+'  '+output.name+'\n').encode())
        print(output)
if __name__ == '__main__': main()
