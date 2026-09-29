"""Six audited backend route files only; no dependencies, frontend, or SQL."""
import hashlib, io, json, tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
def sha(b):return hashlib.sha256(b).hexdigest()
def main():
    files=['src/routes/'+name+'.js' for name in ['engagement','loginSessions','operations','series','posts','upload']]
    audit=json.loads((ROOT/'outputs/version-unification/domestic-live-audit.json').read_text())
    entries={'server/'+name:(ROOT/'server'/name).read_bytes().replace(b'\r\n',b'\n') for name in files}
    for name in ['deploy','rollback']:entries[name+'.sh']=(ROOT/'scripts'/f'{name}-route-security.sh').read_bytes().replace(b'\r\n',b'\n')
    entries['BASELINE.json']=(json.dumps({name:audit['files'][name] for name in files},indent=2)+'\n').encode()
    entries['BACKEND_FILES']=('\n'.join(files)+'\n').encode()
    entries['MANIFEST.json']=(json.dumps({'scope':files,'restart':'API only, selected by verified entry path','frontend':False,'dependencies':False,'migrations':False,'nginx':False},indent=2)+'\n').encode()
    entries['SHA256SUMS']=''.join(sha(b)+'  '+n+'\n' for n,b in sorted(entries.items())).encode()
    output=ROOT/'outputs/mooncci-route-security-20260929.tar.gz'
    with tarfile.open(output,'w:gz') as t:
        for name,data in sorted(entries.items()):
            assert b'\r' not in data
            m=tarfile.TarInfo(name);m.size=len(data);m.mode=0o755 if name.endswith('.sh') else 0o644;t.addfile(m,io.BytesIO(data))
    with tarfile.open(output) as t:
        assert set(t.getnames())==set(entries)
        for name,b in entries.items():assert t.extractfile(name).read()==b
    Path(str(output)+'.sha256').write_bytes((sha(output.read_bytes())+'  '+output.name+'\n').encode())
    print(output.name,sha(output.read_bytes()))
if __name__=='__main__':main()

