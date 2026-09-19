import importlib.util,json,pathlib,tempfile,unittest,hashlib,sys,types,subprocess
from unittest.mock import patch
HERE=pathlib.Path(__file__).parent

def load(name,file):
 s=importlib.util.spec_from_file_location(name,HERE/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

deploy=load('deploy','deploy.py');restore=load('restore','verify-restore.py')
class OperationsTests(unittest.TestCase):
 def test_scope_unknown_changes_and_traversal(self):
  with tempfile.TemporaryDirectory() as temp:
   root=pathlib.Path(temp);package=root/'package';payload=package/'payload/backend/src';payload.mkdir(parents=True);live=root/'live';(live/'src').mkdir(parents=True)
   (payload/'test.js').write_bytes(b'new');row={'kind':'backend','path':'src/test.js','sha256':hashlib.sha256(b'new').hexdigest(),'accepted':[None]}
   manifest={'version':1,'dependencies':[],'migrations':[],'files':[row]}
   def save(): (package/'MANIFEST.json').write_text(json.dumps(manifest))
   save();deploy.validate(package,{'backend':live})
   (live/'src/test.js').write_bytes(b'unknown')
   with self.assertRaisesRegex(ValueError,'Unknown live'): deploy.validate(package,{'backend':live})
   (live/'src/test.js').write_bytes(b'new');deploy.validate(package,{'backend':live})
   row['path']='../outside';save()
   with self.assertRaises(ValueError):deploy.validate(package,{'backend':live})
   row['path']='src/test.js';manifest['migrations']=['unreviewed.sql'];save()
   with self.assertRaises(ValueError):deploy.validate(package,{'backend':live})
 def test_restore_detects_corruption_and_escape(self):
  with tempfile.TemporaryDirectory() as temp:
   root=pathlib.Path(temp);files={}
   for name in ['database.sql','app.env']:
    (root/name).write_bytes(b'test');files[name]=hashlib.sha256(b'test').hexdigest()
   (root/'MANIFEST.json').write_text(json.dumps({'files':files}));restore.verify(root)
   (root/'database.sql').write_bytes(b'corrupt')
   with self.assertRaises(ValueError):restore.verify(root)
   files={'../outside':'bad','database.sql':'bad','app.env':'bad'};(root/'MANIFEST.json').write_text(json.dumps({'files':files}))
   with self.assertRaises(ValueError):restore.verify(root)
 def test_backup_failure_never_prunes_or_sends_success(self):
  backup=load('backup','backup.py')
  for fail in [False,True]:
   with tempfile.TemporaryDirectory() as temp:
    root=pathlib.Path(temp);(root/'uploads').mkdir();(root/'uploads/pic').write_bytes(b'image');(root/'app.env').write_bytes(b'secret')
    c={'work_dir':str(root/'work'),'uploads':str(root/'uploads'),'app_env':str(root/'app.env'),'repository':str(root/'repo'),'password_file':str(root/'password'),'mysql_defaults':str(root/'mysql.cnf'),'database':'test','min_free_bytes':1}
    calls=[]
    def run(args,**kwargs):
     calls.append(args)
     if args[0]=='mysqldump':kwargs['stdout'].write(b'CREATE TABLE x(id INT);')
     if args[1]=='backup':
      self.assertTrue((kwargs['cwd']/'MANIFEST.json').is_file())
      if fail:raise subprocess.CalledProcessError(3,args)
    flock=types.SimpleNamespace(flock=lambda *args:None,LOCK_EX=1,LOCK_NB=2)
    with patch.dict(sys.modules,{'fcntl':flock}),patch.object(backup,'run',run),patch.object(backup,'notify') as notify:
     if fail:
      with self.assertRaises(subprocess.CalledProcessError):backup.backup(c)
      notify.assert_not_called();self.assertFalse(any('forget' in args for args in calls))
     else:
      backup.backup(c);notify.assert_called_once();self.assertTrue(any('--keep-daily' in args and '--keep-weekly' in args and '--keep-monthly' in args for args in calls))
    self.assertEqual(list((root/'work').glob('snapshot-*')),[])
    self.assertEqual((root/'app.env').read_bytes(),b'secret')
if __name__=='__main__':unittest.main()
