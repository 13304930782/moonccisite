"""Isolated filesystem and command fixtures; never invokes service commands."""
import builtins
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest

if os.name == 'nt':
    sys.modules.setdefault('fcntl', types.SimpleNamespace(flock=lambda *args: None, LOCK_EX=2))
spec = importlib.util.spec_from_file_location('sync_mail', Path(__file__).with_name('sync-mail-certificates.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class SyncTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.commands = []
        self.fail_hostname = None
        self.fail_reload = False
        self.original_path, self.original_run = m.Path, m.run
        m.Path = self.path
        m.open = lambda path, *args, **kwargs: builtins.open(self.path(path), *args, **kwargs)
        m.run = self.run_command
        self.path('/run/lock').mkdir(parents=True)
        self.pairs = [('/www/server/panel/vhost/cert/mail.cuegroveapp.com','cuegroveapp.com'),('/etc/letsencrypt/live/mx.moooncci.cn','moooncci.cn')]
        for source, domain in self.pairs:
            src, dst = self.path(source), self.path('/www/server/panel/plugin/mail_sys/cert') / domain
            src.mkdir(parents=True); dst.mkdir(parents=True)
            for name in ['fullchain.pem','privkey.pem']:
                (src/name).write_bytes(('fixture-'+name).encode())
                (dst/name).write_bytes(('fixture-'+name).encode())
        self.marker = self.path('/www/server/panel/plugin/mail_sys/cert/.mooncci-reload-pending')

    def path(self, value):
        return self.root / str(value).lstrip('/')

    def run_command(self, *args):
        self.commands.append(args)
        if '-checkhost' in args:
            host=args[args.index('-checkhost')+1]
            return ('Hostname '+host+(' does NOT match certificate' if host==self.fail_hostname else ' does match certificate')).encode()
        if args[:2] == ('systemctl','reload') and self.fail_reload:
            raise subprocess.CalledProcessError(1,args)
        if '-pubkey' in args or '-pubout' in args:return b'fixture-public-key'
        return b''

    def tearDown(self):
        m.Path, m.run = self.original_path, self.original_run
        del m.open
        self.temp.cleanup()

    def test_unchanged_validates_both_hostnames_without_reload(self):
        m.main()
        hosts = [a[a.index('-checkhost')+1] for a in self.commands if '-checkhost' in a]
        self.assertEqual(hosts,['mail.cuegroveapp.com','mx.moooncci.cn'])
        self.assertFalse(any(a[0]=='systemctl' for a in self.commands))
        self.assertFalse(self.marker.exists())

    def test_bad_second_hostname_prevents_any_write(self):
        src, domain = self.pairs[0]
        self.path(src+'/fullchain.pem').write_bytes(b'new-fixture')
        self.fail_hostname='mx.moooncci.cn'
        with self.assertRaises(RuntimeError):m.main()
        self.assertEqual((self.path('/www/server/panel/plugin/mail_sys/cert')/domain/'fullchain.pem').read_bytes(),b'fixture-fullchain.pem')
        self.assertFalse(self.marker.exists())

    def test_changed_pair_rebuilds_map_and_reloads(self):
        src, domain = self.pairs[0]
        self.path(src+'/fullchain.pem').write_bytes(b'new-fixture')
        m.main()
        self.assertEqual((self.path('/www/server/panel/plugin/mail_sys/cert')/domain/'fullchain.pem').read_bytes(),b'new-fixture')
        self.assertEqual(self.commands[-3:],[('postmap','-F','hash:/etc/postfix/vmail_ssl.map'),('doveconf','-n'),('systemctl','reload','postfix','dovecot')])
        self.assertFalse(self.marker.exists())

    def test_failed_reload_is_retried_when_files_are_unchanged(self):
        self.marker.touch()
        self.fail_reload=True
        with self.assertRaises(subprocess.CalledProcessError):m.main()
        self.assertTrue(self.marker.exists())
        self.fail_reload=False
        m.main()
        self.assertFalse(self.marker.exists())


if __name__ == '__main__':
    unittest.main()
