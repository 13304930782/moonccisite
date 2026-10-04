import importlib.util
from pathlib import Path
import sys
import types
import unittest

if sys.platform == 'win32':
    sys.modules['fcntl'] = types.ModuleType('fcntl')
spec = importlib.util.spec_from_file_location('us_http2', Path(__file__).resolve().parents[1] / 'ops/mail-performance/us-http2.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class GatewayConfigTests(unittest.TestCase):
    before = b'server {\n    listen 80;\n    server_name mooncci.site;\n}\nserver {\n    listen 443 ssl;\n    server_name mooncci.site;\n    proxy_pass https://example.invalid;\n}\n'

    def test_preserves_every_existing_byte(self):
        after = module.candidate(self.before)
        self.assertEqual(after.replace(b'\n    http2 on;', b'', 1), self.before)
        self.assertEqual(after.count(b'http2 on;'), 1)

    def test_refuses_existing_explicit_policy(self):
        for setting in (b'    http2 off;\n', b'    http2 on;\n'):
            with self.assertRaises(ValueError):
                module.candidate(self.before + setting)

    def test_refuses_multiple_tls_servers_or_wrong_hostname(self):
        for data in (self.before + b'    listen 443 ssl;\n', self.before.replace(b'mooncci.site', b'other.site')):
            with self.assertRaises(ValueError):
                module.candidate(data)


if __name__ == '__main__':
    unittest.main()
