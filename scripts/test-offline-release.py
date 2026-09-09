import importlib.util
import os
import shutil
import subprocess
import tarfile
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('release', HERE / 'build-offline-release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class OfflineReleaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / 'dist/assets').mkdir(parents=True)
        (self.root / 'dist/index.html').write_bytes(b'new page')
        (self.root / 'dist/assets/app.js').write_bytes(b'new script')
        (self.root / 'scripts').mkdir()
        shutil.copy(HERE / 'deploy-offline-frontend.sh', self.root / 'scripts')
        self.result = release.make_bundle(self.root, 'a' * 40)

    def test_windows_checksum_and_archive_bytes(self):
        checksum = Path(self.result['package'] + '.sha256').read_bytes()
        self.assertNotIn(b'\r', checksum)
        self.assertTrue(checksum.endswith(b'\n'))
        with tarfile.open(self.result['package']) as archive:
            self.assertNotIn(b'\r', archive.extractfile('SHA256SUMS').read())
            self.assertNotIn(b'\r', archive.extractfile('deploy.sh').read())
            self.assertEqual(archive.extractfile('dist/assets/app.js').read(), b'new script')

    def test_hidden_build_files_rejected(self):
        (self.root / 'dist/.env').write_bytes(b'not publishable')
        with self.assertRaises(ValueError):
            release.make_bundle(self.root, 'a' * 40)

    @unittest.skipUnless(os.name != 'nt' and shutil.which('rsync'), 'Linux deployment test runs in CI')
    def test_deploy_tamper_and_rollback(self):
        package = self.root / 'package'
        with tarfile.open(self.result['package']) as archive:
            archive.extractall(package, filter='data')
        web = self.root / 'web'
        web.mkdir()
        (web / 'index.html').write_bytes(b'old page')
        (web / 'old-hash.js').write_bytes(b'old asset')
        env = {**os.environ, 'MOONCCI_WEB_ROOT': str(web), 'MOONCCI_BACKUP_ROOT': str(self.root / 'backups')}
        def run():
            return subprocess.run(['bash', str(package / 'deploy.sh')], env=env, capture_output=True, timeout=20)
        # Corruption is rejected before the existing page is changed.
        (package / 'dist/assets/app.js').write_bytes(b'tampered')
        self.assertNotEqual(run().returncode, 0)
        self.assertEqual((web / 'index.html').read_bytes(), b'old page')
        (package / 'dist/assets/app.js').write_bytes(b'new script')
        result = run()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((web / 'index.html').read_bytes(), b'new page')
        self.assertEqual((web / 'old-hash.js').read_bytes(), b'old asset')
        # A failed post-switch verification restores the old entry.
        (web / 'index.html').write_bytes(b'rollback target')
        binaries = self.root / 'bin'
        binaries.mkdir()
        (binaries / 'cmp').write_text('#!/bin/sh\nexit 1\n')
        (binaries / 'cmp').chmod(0o755)
        env['PATH'] = str(binaries) + ':' + env['PATH']
        self.assertNotEqual(run().returncode, 0)
        self.assertEqual((web / 'index.html').read_bytes(), b'rollback target')


if __name__ == '__main__':
    unittest.main()
