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
        (self.root / 'dist/asset-manifest.json').write_bytes(b'{"rev":2}')
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
        # TarInfo uses mtime=0. A same-size manifest from an earlier release must
        # be copied even though rsync's ordinary size/mtime quick check matches.
        (web / 'asset-manifest.json').write_bytes(b'{"rev":1}')
        os.utime(web / 'asset-manifest.json', (0, 0))
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
        self.assertEqual((web / 'asset-manifest.json').read_bytes(), b'{"rev":2}')
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


    @unittest.skipUnless(os.name != 'nt' and shutil.which('rsync'), 'Linux social deployment fault tests run in CI')
    def test_social_deployment_is_scoped_and_rolls_back(self):
        self.check_social_deployment(False)

    @unittest.skipUnless(os.name != 'nt' and shutil.which('rsync'), 'Linux Google deployment fault tests run in CI')
    def test_google_deployment_is_scoped_and_rolls_back(self):
        self.check_social_deployment(True)

    def check_social_deployment(self, google):
        package = self.root / 'social'
        with tarfile.open(self.result['package']) as archive:
            archive.extractall(package, filter='data')
        shutil.copy(HERE / ('deploy-google-login.sh' if google else 'deploy-social-login.sh'), package / 'deploy.sh')
        files = ['src/index.js', 'src/routes/auth-cookie.js', 'src/lib/authSession.js',
                 'database/migrations/202609100001_social_login.sql']
        if google: files = ['src/routes/socialLogin.js', 'src/lib/socialConfig.js', 'src/lib/socialProviders.js']
        checked_file = 'src/routes/socialLogin.js' if google else 'src/routes/auth-cookie.js'
        for name in files:
            target = package / 'server' / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text('-- fixture' if name.endswith('.sql') else 'module.exports = "new";')
        if not google:
            (package / 'server/scripts').mkdir()
            (package / 'server/scripts/migrate-social-login.js').write_text('// fixture migration')
        (package / 'BACKEND_FILES').write_text('\n'.join(files) + '\n')
        (package / 'SHA256SUMS').write_bytes(''.join(
            f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.relative_to(package).as_posix()}\n'
            for p in sorted(package.rglob('*')) if p.is_file() and p.name != 'SHA256SUMS'
        ).encode())
        live = self.root / 'live'
        for name in ['src/index.js', 'src/routes/auth-cookie.js', 'src/lib/googleIdentity.js', 'src/lib/asyncRouter.js', 'src/middleware/auth.js'] + files:
            target = live / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text('module.exports = "original";')
        (live / '.env').write_text('CF_PROXY=preserve')
        web = self.root / 'web'
        (web / 'assets').mkdir(parents=True)
        binaries = self.root / 'bin'
        binaries.mkdir()
        real_node = shutil.which('node')
        stubs = {
            'su': '#!/bin/sh\necho restart >> "$QA_PM_COUNT"\nexit 0\n',
            'curl': '#!/bin/sh\nprintf \'{"ok":true,"providers":[]}\'\n',
            'install': '#!/usr/bin/env python3\nimport os,sys\na=sys.argv[1:]; b=[]\nwhile a:\n x=a.pop(0)\n if x in ["-o","-g"]: a.pop(0)\n else: b.append(x)\nos.execv("/usr/bin/install",["install"]+b)\n',
            'node': f'#!/bin/sh\nif [ "$1" = server/scripts/migrate-social-login.js ] || [ "$1" = - ]; then [ "$QA_MODE" != migration-failure ]; exit $?; fi\nexec "{real_node}" "$@"\n',
            'rsync': '#!/bin/sh\nif [ "$QA_MODE" = corrupt ]; then printf corrupt > "$MOONCCI_WEB_ROOT/assets/app.js"; exit 0; fi\nexec /usr/bin/rsync "$@"\n',
        }
        for name, content in stubs.items():
            (binaries / name).write_text(content)
            (binaries / name).chmod(0o755)
        env = {**os.environ, 'PATH': str(binaries) + ':' + os.environ['PATH'],
               'MOONCCI_WEB_ROOT': str(web), 'MOONCCI_SERVER_ROOT': str(live),
               'MOONCCI_BACKUP_ROOT': str(self.root / 'backups'), 'QA_PM_COUNT': str(self.root / 'pm-count')}
        for mode in ['migration-failure', 'corrupt', 'success']:
            env['QA_MODE'] = mode
            (self.root / 'pm-count').write_text('')
            (live / 'src/index.js').write_text('module.exports = "original";')
            (live / checked_file).write_text('module.exports = "original";')
            (web / 'index.html').write_text('original page')
            result = subprocess.run(['bash', str(package / 'deploy.sh')], env=env, capture_output=True, timeout=20)
            with self.subTest(mode=mode):
                self.assertEqual(result.returncode == 0, mode == 'success', result.stdout.decode() + result.stderr.decode())
                self.assertEqual((live / '.env').read_text(), 'CF_PROXY=preserve')
                self.assertEqual((live / 'src/lib/googleIdentity.js').read_text(), 'module.exports = "original";')
                if mode != 'success':
                    self.assertEqual((web / 'index.html').read_text(), 'original page')
                    self.assertEqual((live / checked_file).read_text(), 'module.exports = "original";')
                self.assertEqual(len((self.root / 'pm-count').read_text().splitlines()), {'migration-failure': 0, 'corrupt': 2, 'success': 1}[mode])


if __name__ == '__main__':
    unittest.main()
