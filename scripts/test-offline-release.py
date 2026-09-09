import importlib.util
import hashlib
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
        shutil.copy(HERE / 'verify-live.mjs', self.root / 'scripts')
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
        # A copier that reports success but corrupts a resource must trigger rollback.
        (web / 'index.html').write_bytes(b'rollback target')
        binaries = self.root / 'bin'
        binaries.mkdir()
        (binaries / 'rsync').write_text('#!/bin/sh\nprintf corrupt > "$MOONCCI_WEB_ROOT/assets/app.js"\nexit 0\n')
        (binaries / 'rsync').chmod(0o755)
        env['PATH'] = str(binaries) + ':' + env['PATH']
        self.assertNotEqual(run().returncode, 0)
        self.assertEqual((web / 'index.html').read_bytes(), b'rollback target')

    @unittest.skipUnless(os.name != 'nt' and shutil.which('rsync'), 'Linux deployment test runs in CI')
    def test_scoped_backend_rollback_reports_recovery_failures(self):
        package = self.root / 'scoped'
        with tarfile.open(self.result['package']) as archive:
            archive.extractall(package, filter='data')
        shutil.copy(HERE / 'deploy-admin-lists.sh', package / 'deploy.sh')
        (package / 'server/src/routes').mkdir(parents=True)
        (package / 'server/src/routes/admin.js').write_text('module.exports = "new";')
        files = sorted(p for p in package.rglob('*') if p.is_file() and p.name != 'SHA256SUMS')
        (package / 'SHA256SUMS').write_bytes(''.join(
            f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.relative_to(package).as_posix()}\n'
            for p in files
        ).encode())
        live = self.root / 'live'
        (live / 'src/routes').mkdir(parents=True)
        (live / 'src/lib').mkdir()
        (live / 'src/lib/listPagination.js').write_text('module.exports = {};')
        web = self.root / 'web'
        (web / 'assets').mkdir(parents=True)
        binaries = self.root / 'bin'
        binaries.mkdir()
        # Never invoke real su/PM2, network health probes or privileged install.
        stubs = {
            'su': '#!/bin/sh\nn=$(cat "$QA_PM_COUNT" 2>/dev/null || echo 0)\nn=$((n+1))\necho "$n" > "$QA_PM_COUNT"\n[ "$QA_FAIL_ROLLBACK" != 1 ] || [ "$n" != 2 ]\n',
            'curl': '#!/bin/sh\nprintf \'{"ok":true}\'\n',
            'install': '#!/bin/sh\nif [ "$1" = -o ]; then shift 4; fi\nexec /usr/bin/install "$@"\n',
            'rsync': '#!/bin/sh\nprintf corrupt > "$MOONCCI_WEB_ROOT/assets/app.js"\nexit 0\n',
        }
        for name, content in stubs.items():
            (binaries / name).write_text(content)
            (binaries / name).chmod(0o755)
        env = {**os.environ, 'PATH': str(binaries) + ':' + os.environ['PATH'],
               'MOONCCI_WEB_ROOT': str(web), 'MOONCCI_SERVER_ROOT': str(live),
               'MOONCCI_BACKUP_ROOT': str(self.root / 'backups'), 'QA_PM_COUNT': str(self.root / 'pm-count')}
        for fail_rollback in ['0', '1']:
            with self.subTest(fail_rollback=fail_rollback):
                (web / 'index.html').write_bytes(b'original page')
                (live / 'src/routes/admin.js').write_bytes(b'module.exports = "original";')
                (self.root / 'pm-count').write_text('0')
                env['QA_FAIL_ROLLBACK'] = fail_rollback
                result = subprocess.run(['bash', str(package / 'deploy.sh')], env=env, capture_output=True, timeout=20)
                self.assertNotEqual(result.returncode, 0, result.stderr)
                self.assertEqual((web / 'index.html').read_bytes(), b'original page')
                self.assertEqual((live / 'src/routes/admin.js').read_bytes(), b'module.exports = "original";')
                self.assertEqual((self.root / 'pm-count').read_text().strip(), '2')
                expected = 'API 自动恢复失败' if fail_rollback == '1' else '原 API 已恢复并通过健康检查'
                self.assertIn(expected, result.stdout.decode())


if __name__ == '__main__':
    unittest.main()
