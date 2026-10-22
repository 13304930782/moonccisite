"""Domain migration validation without BaoTa access, SMTP or password changes."""
import contextlib
import io
import json
from pathlib import Path
import runpy
import types
import unittest
from unittest.mock import patch

class MailboxDomainTest(unittest.TestCase):
    def test_only_new_and_legacy_mailbox_domains_are_accepted(self):
        class ExistingMailbox:
            def where(self, *args): return self
            def count(self): return 1
            def find(self): return None
        plugin = types.SimpleNamespace(mail_sys_main=lambda: types.SimpleNamespace(M=lambda _: ExistingMailbox()))
        for script in ('create_mailbox.py', 'update_mailbox.py'):
            with patch('os.chdir'), patch.dict('sys.modules', {'mail_sys_main': plugin}):
                main = runpy.run_path(str(Path(__file__).with_name(script)))['main']
                for address in ('alice@moooncci.cn', 'alice@mooncci.site'):
                    with self.subTest(script=script, address=address), patch('sys.stdin', io.StringIO(json.dumps({'address': address, 'password': 'ExistingPassword42!abc'}))), contextlib.redirect_stdout(io.StringIO()):
                        main()
                for address in ('alice@evil.test', 'alice@moooncci.cn.evil', 'alice@@moooncci.cn', 'alice@mooncci.site\n', 'x/y@moooncci.cn'):
                    with self.subTest(script=script, address=address), patch('sys.stdin', io.StringIO(json.dumps({'address': address, 'password': 'ExistingPassword42!abc'}))):
                        with self.assertRaises(ValueError): main()

if __name__ == '__main__': unittest.main()
