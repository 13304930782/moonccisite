import datetime, hashlib, importlib.util, json, pathlib, tarfile, tempfile, unittest
HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('bilingual_release', HERE / 'build-bilingual-release.py')
release = importlib.util.module_from_spec(spec); spec.loader.exec_module(release)
class PackageTests(unittest.TestCase):
    def test_archive_scope_checksums_and_baseline(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            files = {'dist/index.html': b'index', 'dist/assets/app.js': b'js', 'server/runtime/document.mjs': b'export {};\n', 'server/runtime/styles.json': b'{}\n', 'server/runtime/home.css': b'css'}
            for name, data in files.items():
                p = root / name; p.parent.mkdir(parents=True, exist_ok=True); p.write_bytes(data)
            (root / 'scripts').mkdir()
            for name in ['deploy-bilingual.sh','rollback-bilingual.sh','verify-bilingual-release.cjs']:
                (root / 'scripts' / name).write_bytes((HERE / name).read_bytes())
            for name in ['package.json', 'package-lock.json']: (root / 'server' / name).write_bytes(b'{}\n')
            baseline = {'version':1, 'captured_at':datetime.datetime.now(datetime.timezone.utc).isoformat(), 'files':dict.fromkeys(files), 'prerequisites':{n:release.sha(b'{}\n') for n in ['package.json','package-lock.json']}}
            result = release.bundle(root,'a'*40,list(files),baseline)
            with tarfile.open(result['package']) as archive:
                for line in archive.extractfile('SHA256SUMS').read().decode().splitlines():
                    digest,name = line.split('  ',1); self.assertEqual(digest,release.sha(archive.extractfile(name).read()))
                for name in ['MANIFEST.json','BASELINE.json','SHA256SUMS','deploy-bilingual.sh','rollback-bilingual.sh']: self.assertNotIn(b'\r',archive.extractfile(name).read())
            baseline['files']['server/.env'] = None
            with self.assertRaisesRegex(ValueError,'scope'): release.bundle(root,'a'*40,list(files),baseline)
if __name__ == '__main__': unittest.main()
