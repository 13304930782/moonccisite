"""Build a one-file backend fix; no frontend, migration or dependency changes."""
import hashlib,io,json,tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
BEFORE='3c5da63450ad4f413afaae1060a0019375fa9abc50fa0e504eb3f5bb670e41d6'
def sha(b):return hashlib.sha256(b).hexdigest()
def main():
 entries={name:(ROOT/path).read_bytes().replace(b'\r\n',b'\n') for name,path in {'server/src/lib/electricityReport.js':'server/src/lib/electricityReport.js','deploy.sh':'scripts/deploy-electricity-report-time.sh','rollback.sh':'scripts/rollback-electricity-report-time.sh'}.items()}
 entries['MANIFEST.json']=(json.dumps({'scope':'electricity report timestamp precision','before':BEFORE,'after':sha(entries['server/src/lib/electricityReport.js']),'restarts':['mooncci-api','mooncci-worker'],'migrations':[],'resend':False,'production_accepted':False},indent=2)+'\n').encode()
 entries['SHA256SUMS']=''.join(sha(b)+'  '+n+'\n' for n,b in sorted(entries.items())).encode()
 output=ROOT/'outputs/mooncci-electricity-report-time.tar.gz'
 with tarfile.open(output,'w:gz') as a:
  for n,b in entries.items():
   assert b'\r' not in b
   t=tarfile.TarInfo(n);t.size=len(b);t.mode=0o755 if n.endswith('.sh') else 0o644;a.addfile(t,io.BytesIO(b))
 with tarfile.open(output) as a:
  assert set(a.getnames())==set(entries)
  for n,b in entries.items():assert a.extractfile(n).read()==b
 Path(str(output)+'.sha256').write_bytes((sha(output.read_bytes())+'  '+output.name+'\n').encode())
 print(json.dumps({'package':str(output),'bytes':output.stat().st_size,'sha256':sha(output.read_bytes())},indent=2))
if __name__=='__main__':main()
