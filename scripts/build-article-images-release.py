"""Article display metadata only; guarded two-file backend deployment."""
import argparse,hashlib,io,json,tarfile,gzip
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def sha(data):return hashlib.sha256(data).hexdigest()
def main():
 p=argparse.ArgumentParser();p.add_argument('--commit',required=True);a=p.parse_args()
 files=['src/lib/articleImages.js','src/routes/posts.js']
 entries={'server/'+file:(ROOT/'server'/file).read_bytes().replace(b'\r\n',b'\n') for file in files}
 for mode in ['deploy','rollback']:entries[mode+'.sh']=(ROOT/'scripts'/(mode+'-article-images.sh')).read_bytes().replace(b'\r\n',b'\n')
 entries['BASELINE.json']=(json.dumps({'src/routes/posts.js':'2ddcfca99709211ac8165e51fb488dfbe7b2aa68cca7d27162c6f96b8fbe0cfd','src/lib/articleImages.js':None})+'\n').encode()
 entries['BACKEND_FILES']=('\n'.join(files)+'\n').encode()
 entries['MANIFEST.json']=(json.dumps({'source_commit':a.commit,'scope':files,'restart':'verified API only','frontend':False,'dependencies':False,'migrations':False,'nginx':False},indent=2)+'\n').encode()
 entries['SHA256SUMS']=''.join(sha(data)+'  '+name+'\n' for name,data in sorted(entries.items())).encode()
 output=ROOT/'outputs/mooncci-article-images-20261001.tar.gz';output.parent.mkdir(exist_ok=True)
 with output.open('wb') as raw:
  with gzip.GzipFile(fileobj=raw,mode='wb',filename='',mtime=0) as compressed:
   with tarfile.open(fileobj=compressed,mode='w') as archive:
    for name,data in sorted(entries.items()):
     assert b'\r' not in data
     item=tarfile.TarInfo(name);item.size=len(data);item.mode=0o755 if name.endswith('.sh') else 0o644;archive.addfile(item,io.BytesIO(data))
 with tarfile.open(output) as archive:
  assert set(archive.getnames())==set(entries)
  for name,data in entries.items():assert archive.extractfile(name).read()==data
 Path(str(output)+'.sha256').write_bytes((sha(output.read_bytes())+'  '+output.name+'\n').encode())
 print(json.dumps({'archive':str(output),'sha256':sha(output.read_bytes()),'verified':True}))
if __name__=='__main__':main()
