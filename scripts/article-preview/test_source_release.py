import importlib.util,json,tempfile,unittest
from unittest import mock
from types import SimpleNamespace
from pathlib import Path

HERE=Path(__file__).resolve().parent
def load(name):
    spec=importlib.util.spec_from_file_location(name,HERE/(name+'.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
p=load('prepare');d=load('deploy')

class SourceRelease(unittest.TestCase):
    def put(self,root,name,data):
        file=root/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(data)
    def fixture(self,target='main'):
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup);base=Path(temp.name)
        source=base/'source';web=base/'web';live=base/'live';backups=base/'backups'
        for folder in [source,web,live/'runtime',backups]:folder.mkdir(parents=True,exist_ok=True)
        for name in ['index.html','assets/app.js','assets/app.css','licenses/info.txt','login-icons/icon.svg','mail/config.xml']:self.put(source,'dist/'+name,('new '+name).encode())
        self.put(source,'server/runtime/document.mjs',b'new SSR');self.put(source,'server/runtime/home.css',b'new CSS')
        self.put(source,'server/runtime/styles.json',json.dumps({'index':{'css':['/assets/app.css'],'js':['/assets/app.js']}}).encode())
        self.put(source,'.cache/preview-ssr-deps/node_modules/jsdom/package.json',b'{"name":"jsdom"}')
        for name in p.PREREQUISITES:self.put(source,'server/'+name,b'unchanged backend');self.put(live,name,b'unchanged backend')
        pkg=p.prepare(source,target,revision='a'*40)
        self.put(web,'index.html',b'old frontend');self.put(web,'old-hash.js',b'keep old asset')
        self.put(live,'runtime/document.mjs',b'old SSR');self.put(live,'runtime/chunks/old.mjs',b'old chunk');self.put(live,'runtime/node_modules/old/index.js',b'old dependency')
        self.put(live,'.env',b'keep env');self.put(live,'database/schema.sql',b'keep SQL');self.put(live,'uploads/original.webp',b'keep original')
        return source,pkg,web,live,backups
    def hooks(self,stage=lambda x:None,installed=lambda:None):return {'pm':lambda:{},'stage':stage,'installed':installed}
    def test_scoped_main_and_reader_deployment(self):
        for target in ['main','reader']:
            with self.subTest(target=target):
                source,pkg,web,live,backups=self.fixture(target);original=d.files(live)
                d.deploy(pkg,web,live,backups,self.hooks())
                self.assertEqual(d.hashes(web,d.files(source/'dist')),d.files(source/'dist'))
                for name,value in original.items():
                    if not name.startswith('runtime/'):self.assertEqual(d.digest((live/name).read_bytes()),value)
                for name in ['assets','licenses','login-icons','mail']:self.assertEqual((web/name).stat().st_mode & 0o777,0o755)
                if target=='reader':self.assertEqual(d.files(live),original)
    def test_failed_acceptance_restores_complete_files(self):
        source,pkg,web,live,backups=self.fixture();old_web=d.files(web);old_ssr=d.files(live/'runtime')
        def fail():raise RuntimeError('simulated acceptance failure')
        with self.assertRaisesRegex(RuntimeError,'simulated'):d.deploy(pkg,web,live,backups,self.hooks(installed=fail))
        self.assertEqual(d.files(web),old_web);self.assertEqual(d.files(live/'runtime'),old_ssr)
    def test_preflight_drift_rejects_before_install(self):
        source,pkg,web,live,backups=self.fixture()
        def drift(stage):(web/'index.html').write_bytes(b'concurrent change')
        with self.assertRaisesRegex(ValueError,'changed during preflight'):d.deploy(pkg,web,live,backups,self.hooks(stage=drift))
        self.assertEqual((web/'index.html').read_bytes(),b'concurrent change')
        self.assertEqual((live/'runtime/document.mjs').read_bytes(),b'old SSR')
    def test_checksum_and_scope_reject_corruption(self):
        source,pkg,web,live,backups=self.fixture();(pkg/'dist/index.html').write_bytes(b'corrupt')
        with self.assertRaises(ValueError):d.verify_package(pkg)
    def test_prerequisite_drift_rejects(self):
        source,pkg,web,live,backups=self.fixture();(live/'src/routes/posts.js').write_bytes(b'other backend')
        with self.assertRaisesRegex(ValueError,'Backend does not match'):d.deploy(pkg,web,live,backups,self.hooks())
        self.assertEqual((web/'index.html').read_bytes(),b'old frontend')
    def test_tampered_backup_rejected(self):
        source,pkg,web,live,backups=self.fixture();backup=d.deploy(pkg,web,live,backups,self.hooks());current=d.files(web)
        (backup/'runtime-before.tar').write_bytes(b'corrupt')
        with self.assertRaisesRegex(ValueError,'Backup changed'):d.rollback(backup,restart=False)
        self.assertEqual(d.files(web),current)
    def test_missing_dependency_and_missing_asset_reject(self):
        source,pkg,web,live,backups=self.fixture();(source/'.cache/preview-ssr-deps/node_modules/jsdom/package.json').unlink()
        with self.assertRaisesRegex(ValueError,'dependency missing'):p.prepare(source,'main',revision='b'*40)
        self.put(source,'.cache/preview-ssr-deps/node_modules/jsdom/package.json',b'{}');(source/'dist/assets/app.css').unlink()
        with self.assertRaisesRegex(ValueError,'Missing referenced resource'):p.prepare(source,'main',revision='b'*40)
    def test_python36_subprocess_arguments(self):
        source,pkg,web,live,backups=self.fixture()
        def check_output(*args,**kwargs):
            self.assertNotIn('text',kwargs);self.assertTrue(kwargs.get('universal_newlines'));return 'c'*40+'\n'
        with mock.patch.object(p.subprocess,'check_output',side_effect=check_output):
            self.assertEqual(d.verify_package(p.prepare(source,'main'))['revision'],'c'*40)
        def run(*args,**kwargs):
            self.assertNotIn('text',kwargs);self.assertTrue(kwargs.get('universal_newlines'));return SimpleNamespace(returncode=0,stdout='[]')
        with mock.patch.object(d.subprocess,'run',side_effect=run):self.assertEqual(d.pm('jlist'),'[]')
    def test_runtime_stage_empty_and_legacy_unlink(self):
        source,pkg,web,live,backups=self.fixture();stage=backups/'stage';stage.mkdir()
        d.copy_to_empty(pkg/'server/runtime',stage)
        self.assertEqual(d.files(stage),d.files(pkg/'server/runtime'))
        with self.assertRaisesRegex(ValueError,'must be empty'):d.copy_to_empty(pkg/'server/runtime',stage)
        absent=backups/'missing';d.unlink_if_present(absent);absent.write_bytes(b'new');d.unlink_if_present(absent);self.assertFalse(absent.exists())
    def test_no_python37_or_newer_runtime_apis(self):
        for file in ['prepare.py','deploy.py']:
            content=(HERE/file).read_text()
            for modern in ['text=True','missing_ok=True','time_ns(']:self.assertNotIn(modern,content)
        self.assertNotIn('dirs_exist_ok=True',(HERE/'deploy.py').read_text())

if __name__=='__main__':unittest.main()
