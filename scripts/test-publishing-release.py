
import hashlib,json,os,subprocess,sys,tarfile,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
class PublishingReleaseTests(unittest.TestCase):
 def test_archive_scope_checksums_and_lf(self):
  package=ROOT/'outputs/mooncci-publishing-phase1.tar.gz'
  checksum=Path(str(package)+'.sha256').read_bytes()
  self.assertNotIn(b'\r',checksum)
  self.assertEqual(checksum.decode().split()[0],hashlib.sha256(package.read_bytes()).hexdigest())
  with tarfile.open(package) as archive:
   entries={m.name:archive.extractfile(m).read() for m in archive.getmembers()}
  for line in entries['SHA256SUMS'].decode().splitlines():
   digest,name=line.split('  ',1);self.assertEqual(digest,hashlib.sha256(entries[name]).hexdigest(),name)
  for name,data in entries.items():
   self.assertNotIn('..',Path(name).parts)
   self.assertFalse(any(x in name.split('/') for x in ['.env','node_modules','uploads','cloudflare','ops']))
   if name.endswith(('.sh','.js','.py','.sql','.json')) or name in ['BACKEND_FILES','SHA256SUMS']:self.assertNotIn(b'\r',data,name)
  migrations=[n for n in entries if n.endswith('.sql')]
  self.assertEqual(migrations,['server/database/migrations/202609210001_publishing.sql'])
  manifest=json.loads(entries['MANIFEST.json'])
  self.assertFalse(manifest['production_accepted'])
  self.assertEqual(manifest['restarts'],['mooncci-api','mooncci-worker'])
  files=entries['BACKEND_FILES'].decode().splitlines()
  self.assertEqual(set(files),set(json.loads(entries['BASELINE.json'])))
  self.assertEqual({n for n in entries if n.startswith('server/')}, {'server/'+f for f in files}|{'server/scripts/migrate-publishing.js'})
 def test_flag_changes_preserve_other_settings(self):
  for newline in ['\n','\r\n']:
   with tempfile.TemporaryDirectory(prefix='publishing-env-') as directory:
    path=Path(directory)/'.env'
    secret='JWT_SECRET=fixture-only\nGOOGLE_CERTS_URL=https://existing.example\nGITHUB_PROXY_KEY=fixture-key\n'.replace('\n',newline)
    path.write_bytes((secret+'PUBLISHING_ENABLED=false'+newline).encode())
    for flag in ['true','false']:
     subprocess.run([sys.executable,str(ROOT/'scripts/publishing-env.py'),str(path),flag],check=True)
     data=path.read_bytes().decode()
     self.assertIn(secret,data)
     self.assertEqual(data.count('PUBLISHING_ENABLED='),1)
     self.assertIn('PUBLISHING_ENABLED='+flag,data)
 def test_deploy_preflight_refuses_unreviewed_server_edits(self):
  shell=(ROOT/'scripts/deploy-publishing.sh').read_text(encoding='utf-8')
  code=shell.split("<<'NODE'\n",1)[1].split('\nNODE',1)[0]
  with tempfile.TemporaryDirectory(prefix='publishing-baseline-') as directory:
   root=Path(directory);live=root/'live';live.mkdir()
   (root/'server/src').mkdir(parents=True);(live/'src').mkdir()
   old=b'old\n';new=b'new\n'
   (root/'BASELINE.json').write_text(json.dumps({'src/index.js':hashlib.sha256(old).hexdigest()}))
   (root/'server/src/index.js').write_bytes(new)
   for data,passed in [(old,True),(new,True),(b'production-hotfix\n',False)]:
    (live/'src/index.js').write_bytes(data)
    result=subprocess.run(['node','-',str(live)],input=code,text=True,cwd=root,capture_output=True)
    self.assertEqual(result.returncode==0,passed,result.stderr)
    self.assertEqual((live/'src/index.js').read_bytes(),data)
if __name__=='__main__':unittest.main()
