import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {'indexnow.py': 'indexnow.py', 'deploy.sh': 'deploy-indexnow.sh',
           'rollback.sh': 'rollback-indexnow.sh', 'mooncci-indexnow.service': 'mooncci-indexnow.service',
           'mooncci-indexnow.timer': 'mooncci-indexnow.timer'}


@unittest.skipUnless(sys.platform.startswith('linux') and os.geteuid() == 0, 'Linux root fixture required')
class IndexNowReleaseTest(unittest.TestCase):
    def test_install_and_rollback(self):
        for existing in [False, True]:
            with self.subTest(existing=existing), tempfile.TemporaryDirectory(prefix='indexnow-release-') as directory:
                root = Path(directory)

                def mapped(value):
                    for prefix in ['/www', '/opt', '/var/lib', '/etc/systemd']:
                        value = value.replace(prefix, str(root / prefix[1:]))
                    return value

                def path(value):
                    return Path(mapped(value))

                package = root / 'package'
                package.mkdir()
                for name, source in SOURCES.items():
                    (package / name).write_bytes((ROOT / 'scripts' / source).read_bytes().replace(b'\r\n', b'\n'))
                (package / 'README.txt').write_bytes(b'Offline fixture; no application deployment.\n')
                digest = lambda data: hashlib.sha256(data).hexdigest()
                manifest = {'version': 1, 'component': 'mooncci-indexnow', 'revision': 'a' * 40,
                            'files': {item.name: digest(item.read_bytes()) for item in package.iterdir()},
                            'dependencies': False, 'migrations': False, 'restarts': [],
                            'timer_enabled': False, 'initial_submit': False}
                (package / 'MANIFEST.json').write_bytes((json.dumps(manifest) + '\n').encode())
                backup = path('/www/backup/mooncci-indexnow.20261016T000000Z.fixture')
                backup.mkdir(parents=True)
                extension = path('/www/server/panel/vhost/nginx/extension/mooncci.site')
                extension.mkdir(parents=True)
                vhost = path('/www/server/panel/vhost/nginx/moooncci.cn.conf')
                vhost.write_text('include ' + str(extension) + '/*.conf;\n')
                for name in ['/etc/systemd/system', '/opt', '/var/lib']:
                    path(name).mkdir(parents=True, exist_ok=True)
                units = {name: {'enabled': 'disabled', 'active': 'inactive'}
                         for name in ['mooncci-indexnow.timer', 'mooncci-indexnow.service']}
                originals = {}
                if existing:
                    path('/opt/mooncci-indexnow').mkdir()
                    names = ['/opt/mooncci-indexnow/indexnow.py', '/opt/mooncci-indexnow/MANIFEST.json',
                             '/etc/systemd/system/mooncci-indexnow.service', '/etc/systemd/system/mooncci-indexnow.timer',
                             '/www/server/panel/vhost/nginx/extension/mooncci.site/mooncci-indexnow.conf']
                    for name in names:
                        target = path(name)
                        target.write_bytes(('original ' + target.name).encode())
                        target.chmod(0o640)
                        originals[target] = target.read_bytes()
                    private = path('/var/lib/mooncci-indexnow')
                    private.mkdir(mode=0o700)
                    (private / 'key').write_bytes(('a' * 64 + '\n').encode())
                    (private / 'state.json').write_bytes(b'{"queue":"keep"}\n')
                    units['mooncci-indexnow.timer'] = {'enabled': 'enabled', 'active': 'active'}
                commands, fail_nginx = [], [existing]
                real_run = subprocess.run

                def run(args, **kwargs):
                    commands.append(args)
                    if args[0] == 'sha256sum':
                        return real_run(args, **kwargs)
                    output = ''
                    if args[0] == 'systemctl':
                        verb, unit = args[1], args[-1]
                        loaded = unit in units and path('/etc/systemd/system/' + unit).exists()
                        if verb == 'show': output = 'LoadState=' + ('loaded' if loaded else 'not-found')
                        elif verb == 'is-enabled': output = units[unit]['enabled'] if loaded else 'not-found'
                        elif verb == 'is-active': output = units[unit]['active'] if loaded else 'inactive'
                        elif verb in ['stop', 'start']: units[unit]['active'] = 'active' if verb == 'start' else 'inactive'
                        elif verb in ['enable', 'disable']: units[unit]['enabled'] = 'enabled' if verb == 'enable' else 'disabled'
                        else: self.assertEqual(verb, 'daemon-reload')
                    elif args[0].endswith('/nginx'):
                        if args[1] == '-t' and fail_nginx[0]:
                            fail_nginx[0] = False
                            raise subprocess.CalledProcessError(1, args)
                    else:
                        self.fail('Unexpected command: ' + repr(args))
                    return types.SimpleNamespace(stdout=output, returncode=0)

                def inline(name):
                    return mapped((package / name).read_text().split("<<'PY'\n", 1)[1].rsplit('\nPY', 1)[0])

                scope = {}
                with patch('pwd.getpwnam', return_value=types.SimpleNamespace(pw_uid=0)), patch('grp.getgrnam', return_value=types.SimpleNamespace(gr_gid=0)), patch.object(subprocess, 'run', side_effect=run), patch.object(sys, 'argv', ['deploy', str(package), str(backup)]):
                    try:
                        if existing:
                            with self.assertRaises(subprocess.CalledProcessError):
                                exec(compile(inline('deploy.sh'), 'deploy-inline', 'exec'), scope)
                        else:
                            exec(compile(inline('deploy.sh'), 'deploy-inline', 'exec'), scope)
                    finally:
                        if 'runtime_lock' in scope: scope['runtime_lock'].close()
                    key = path('/var/lib/mooncci-indexnow/key').read_text().strip()
                    self.assertEqual(path('/var/lib/mooncci-indexnow-public/' + key + '.txt').read_bytes(), key.encode())
                    self.assertEqual(path('/var/lib/mooncci-indexnow/key').stat().st_mode & 0o777, 0o600)
                    self.assertEqual(path('/var/lib/mooncci-indexnow').stat().st_mode & 0o777, 0o700)
                    self.assertEqual(units['mooncci-indexnow.timer'], {'enabled': 'disabled', 'active': 'inactive'})
                    self.assertFalse(any(args[:2] == ['systemctl', 'start'] for args in commands))
                    if existing:
                        self.assertEqual([args[-1] for args in commands if args[:2] == ['systemctl', 'stop']][:2], list(units))
                        self.assertEqual((backup / 'persistent/state.json').read_bytes(), b'{"queue":"keep"}\n')
                    with patch.object(sys, 'argv', ['rollback', str(backup)]):
                        exec(compile(inline('rollback.sh'), 'rollback-inline', 'exec'), {})
                    for target, data in originals.items():
                        self.assertEqual(target.read_bytes(), data)
                        self.assertEqual(target.stat().st_mode & 0o777, 0o640)
                    if not existing:
                        self.assertFalse(path('/opt/mooncci-indexnow/indexnow.py').exists())
                        self.assertFalse(path('/etc/systemd/system/mooncci-indexnow.timer').exists())
                        self.assertFalse((extension / 'mooncci-indexnow.conf').exists())
                    else:
                        self.assertEqual(key, 'a' * 64)
                        self.assertEqual(units['mooncci-indexnow.timer'], {'enabled': 'enabled', 'active': 'active'})
                        self.assertEqual(path('/var/lib/mooncci-indexnow/state.json').read_bytes(), b'{"queue":"keep"}\n')
                    self.assertEqual(path('/var/lib/mooncci-indexnow/key').read_text().strip(), key)
                    self.assertEqual(vhost.read_text(), 'include ' + str(extension) + '/*.conf;\n')


if __name__ == '__main__':
    unittest.main()
