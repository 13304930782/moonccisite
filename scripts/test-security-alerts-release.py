import hashlib, importlib.util, json, pathlib, shutil, tarfile, tempfile, unittest

HERE=pathlib.Path(__file__).resolve().parent
def load(name,file):
    spec=importlib.util.spec_from_file_location(name,HERE/file);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
release=load('security_build','build-security-alerts-release.py')
deploy=load('security_deploy','deploy-security-alerts.py')

class SecurityReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=pathlib.Path(self.temp.name)
        self.source=self.root/'source';self.live=self.root/'live';self.web=self.root/'web';self.backups=self.root/'backups'
        for path in [self.source/'scripts',self.source/'dist/assets',self.source/'server/runtime',self.source/'server/node_modules/multer',self.live/'runtime/node_modules/jsdom',self.live/'node_modules/multer',self.live/'src/routes',self.web/'assets']:
            path.mkdir(parents=True,exist_ok=True)
        for name in ['build-offline-release.py','deploy-offline-frontend.sh','verify-live.mjs','deploy-security-alerts.py']:
            shutil.copy2(HERE/name,self.source/'scripts'/name)
        self.previous={'package.json':b'{"dependencies":{"multer":"2.4.0"}}\n','package-lock.json':b'{"packages":{"node_modules/multer":{"version":"2.4.0"}}}\n'}
        for name,data in self.previous.items(): (self.live/name).write_bytes(data)
        (self.source/'server/package.json').write_bytes(b'{"dependencies":{"multer":"2.5.0"}}\n')
        (self.source/'server/package-lock.json').write_bytes(b'{"packages":{"node_modules/multer":{"version":"2.5.0"}}}\n')
        (self.source/'server/node_modules/multer/package.json').write_bytes(b'{"version":"2.5.0"}')
        (self.source/'server/node_modules/multer/index.js').write_bytes(b'new multer')
        (self.live/'node_modules/multer/package.json').write_bytes(b'{"version":"2.4.0"}')
        (self.live/'node_modules/multer/index.js').write_bytes(b'old multer')
        (self.live/'node_modules/multer/old-only.js').write_bytes(b'old-only')
        for file in ['document.mjs','styles.json','home.css']:
            (self.source/'server/runtime'/file).write_bytes(b'new runtime');(self.live/'runtime'/file).write_bytes(b'old runtime')
        (self.source/'dist/index.html').write_bytes(b'new page');(self.source/'dist/assets/new.js').write_bytes(b'new script')
        (self.web/'index.html').write_bytes(b'old page');(self.web/'assets/old.js').write_bytes(b'old script')
        (self.live/'.env').write_bytes(b'preserve env');(self.live/'runtime/node_modules/jsdom/package.json').write_bytes(b'preserve isolated jsdom')
        (self.live/'src/routes/nodeMonitor.js').write_bytes(b'preserve upstream9443')
        result=release.make_bundle(self.source,'a'*40,self.previous);self.archive=pathlib.Path(result['package']);self.package=self.root/'package'
        with tarfile.open(self.archive) as archive: archive.extractall(self.package,filter='data')

    def test_archive_scope_checksums_and_lf(self):
        with tarfile.open(self.archive) as archive:
            for file in ['deploy.py','deploy.sh','SHA256SUMS','MANIFEST.json','REVISION']: self.assertNotIn(b'\r',archive.extractfile(file).read())
            for line in archive.extractfile('SHA256SUMS').read().decode().splitlines():
                sha,name=line.split('  ',1);self.assertEqual(hashlib.sha256(archive.extractfile(name).read()).hexdigest(),sha)
            self.assertFalse(any('/src/' in name or '/runtime/node_modules/' in name for name in archive.getnames()))
        self.assertNotIn(b'\r',pathlib.Path(str(self.archive)+'.sha256').read_bytes())

    def test_deploy_and_rollback_preserve_unrelated_files(self):
        restarts=[]
        backup=deploy.deploy(self.package,self.live,self.web,self.backups,lambda:restarts.append('restart'),lambda:None)
        self.assertEqual(restarts,['restart']);self.assertEqual((self.live/'node_modules/multer/index.js').read_bytes(),b'new multer')
        self.assertFalse((self.live/'node_modules/multer/old-only.js').exists())
        self.assertEqual((self.web/'index.html').read_bytes(),b'new page');self.assertEqual((self.web/'assets/old.js').read_bytes(),b'old script')
        deploy.restore(backup,self.live,self.web)
        self.assertEqual((self.web/'index.html').read_bytes(),b'old page');self.assertFalse((self.web/'assets/new.js').exists())
        self.assertEqual((self.live/'node_modules/multer/old-only.js').read_bytes(),b'old-only')
        self.assertEqual((self.live/'.env').read_bytes(),b'preserve env')
        self.assertEqual((self.live/'src/routes/nodeMonitor.js').read_bytes(),b'preserve upstream9443')
        self.assertEqual((self.live/'runtime/node_modules/jsdom/package.json').read_bytes(),b'preserve isolated jsdom')

    def test_failed_health_restores_original_and_restarts_again(self):
        calls=[]
        def health():
            calls.append('health')
            if len(calls)==1: raise RuntimeError('simulated broken API')
        restarts=[]
        with self.assertRaisesRegex(RuntimeError,'simulated broken API'):
            deploy.deploy(self.package,self.live,self.web,self.backups,lambda:restarts.append(1),health)
        self.assertEqual(len(restarts),2);self.assertEqual(len(calls),2)
        self.assertEqual((self.live/'node_modules/multer/index.js').read_bytes(),b'old multer')
        self.assertEqual((self.web/'index.html').read_bytes(),b'old page')
        self.assertEqual((self.live/'runtime/document.mjs').read_bytes(),b'old runtime')

    def test_tamper_and_source_scope_rejected_before_mutation(self):
        target=self.package/'server/node_modules/multer/index.js';target.write_bytes(b'corrupt')
        with self.assertRaisesRegex(ValueError,'checksum'): deploy.verify(self.package,self.live,self.web)
        target.write_bytes(b'new multer')
        manifest=json.loads((self.package/'MANIFEST.json').read_text());manifest['files']['server/src/routes/nodeMonitor.js']='invalid'
        (self.package/'MANIFEST.json').write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError,'scope'): deploy.verify(self.package,self.live,self.web)
        self.assertEqual((self.web/'index.html').read_bytes(),b'old page')

    def test_dependency_drift_and_tampered_backup_rejected(self):
        file=self.live/'node_modules/multer/package.json';file.write_bytes(b'{"version":"unexpected"}')
        with self.assertRaisesRegex(ValueError,'version drift'): deploy.verify(self.package,self.live,self.web)
        file.write_bytes(b'{"version":"2.4.0"}')
        backup=deploy.deploy(self.package,self.live,self.web,self.backups,lambda:None,lambda:None)
        (backup/'before/dist/index.html').write_bytes(b'tampered rollback')
        with self.assertRaisesRegex(ValueError,'Backup checksum'): deploy.restore(backup,self.live,self.web)
        self.assertEqual((self.web/'index.html').read_bytes(),b'new page')

if __name__=='__main__': unittest.main()
