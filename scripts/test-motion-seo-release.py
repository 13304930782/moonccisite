import datetime, importlib.util, json, pathlib, tarfile, tempfile, unittest

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('release', HERE / 'build-motion-seo-release.py')
release = importlib.util.module_from_spec(spec); spec.loader.exec_module(release)

class ReleaseTests(unittest.TestCase):
    def test_archive_scope_integrity_and_backend_drift(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            payload = {'dist/index.html': b'index', 'dist/assets/app.js': b'app', 'server/runtime/document.mjs': b'export {};',
                       'server/runtime/styles.json': b'{}', 'server/runtime/home.css': b'css'}
            for name in (*release.BACKEND, release.MIGRATION, *release.AUX): payload[name] = (name + '\r\n').encode()
            for name, data in payload.items():
                file = root / name; file.parent.mkdir(parents=True, exist_ok=True); file.write_bytes(data)
            (root / 'scripts').mkdir()
            for name in release.TOOLS.values(): (root / 'scripts' / name).write_bytes((HERE / name).read_bytes())
            for name in ('package.json', 'package-lock.json'): (root / 'server' / name).write_bytes(b'{}\n')
            names = release.files(root)
            previous = {name: None for name in release.BACKEND}
            baseline = {'version': 1, 'captured_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                        'files': dict.fromkeys(names), 'prerequisites': {n: release.sha(b'{}\n') for n in ('package.json', 'package-lock.json')}}
            result = release.bundle(root, 'a' * 40, names, baseline, previous)
            with tarfile.open(result['package']) as archive:
                for line in archive.extractfile('SHA256SUMS').read().decode().splitlines():
                    digest, name = line.split('  ', 1); self.assertEqual(digest, release.sha(archive.extractfile(name).read()))
                manifest = json.load(archive.extractfile('MANIFEST.json'))
                self.assertEqual(set(manifest['files']), set(names))
                self.assertIn(release.MIGRATION, manifest['files'])
                self.assertTrue(all(n not in manifest['files'] for n in release.AUX))
                for name in (*release.AUX, 'deploy.sh', 'rollback-bilingual.sh', 'MANIFEST.json', 'BASELINE.json', 'SHA256SUMS'):
                    self.assertNotIn(b'\r', archive.extractfile(name).read())
                self.assertFalse(any('.env' in n or '/node_modules/' in n or 'uploads/' in n for n in archive.getnames()))
            baseline['files'][release.BACKEND[0]] = 'a' * 64
            with self.assertRaisesRegex(ValueError, 'Unreviewed backend drift'): release.bundle(root, 'a' * 40, names, baseline, previous)
            baseline['files'][release.BACKEND[0]] = None
            baseline['files'][release.MIGRATION] = 'a' * 64
            with self.assertRaisesRegex(ValueError, 'Existing migration differs'): release.bundle(root, 'a' * 40, names, baseline, previous)
            baseline['files'][release.MIGRATION] = None
            baseline['files']['server/.env'] = None
            with self.assertRaisesRegex(ValueError, 'scope'): release.bundle(root, 'a' * 40, names, baseline, previous)

if __name__ == '__main__': unittest.main()
