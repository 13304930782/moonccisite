import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import install as m
import tempfile
import unittest

class InstallTests(unittest.TestCase):
    def test_other_host_rejected(self):
        with self.assertRaises(ValueError):m.validate_old('server_name cuegroveapp.com;')
        with self.assertRaises(ValueError):m.validate_old('server_name route-test.mooncci.site mooncci.site;')
    def test_success_and_backup(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);target=root/'site.conf';target.write_bytes(b'old');events=[]
            m.transaction(target,b'new',root/'backup',lambda:events.append('check'),lambda:events.append('reload'),lambda:events.append('probe'))
            self.assertEqual(target.read_bytes(),b'new')
            self.assertEqual((root/'backup/original.conf').read_bytes(),b'old')
            self.assertEqual(events,['check','reload','probe'])
    def test_failed_health_restores(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);target=root/'site.conf';target.write_bytes(b'old');events=[]
            def fail():raise RuntimeError('probe failed')
            with self.assertRaisesRegex(RuntimeError,'restored'):
                m.transaction(target,b'new',root/'backup',lambda:events.append('check'),lambda:events.append('reload'),fail)
            self.assertEqual(target.read_bytes(),b'old')
            self.assertEqual(events,['check','reload','check','reload'])
    def test_failed_config_never_loads_new_config(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);target=root/'site.conf';target.write_bytes(b'old');loaded=[]
            def check():
                if target.read_bytes()==b'new':raise RuntimeError('invalid config')
            with self.assertRaisesRegex(RuntimeError,'restored'):
                m.transaction(target,b'new',root/'backup',check,lambda:loaded.append(target.read_bytes()),lambda:None)
            self.assertEqual(loaded,[b'old'])
    def test_concurrent_edit_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);target=root/'site.conf';target.write_bytes(b'old')
            def changed():target.write_bytes(b'other');raise RuntimeError('changed')
            with self.assertRaisesRegex(RuntimeError,'Concurrent'):
                m.transaction(target,b'new',root/'backup',lambda:None,lambda:None,changed)
            self.assertEqual(target.read_bytes(),b'other')
if __name__=='__main__':unittest.main()
