import importlib.util,unittest
from pathlib import Path
from unittest.mock import patch
from subprocess import CompletedProcess
spec=importlib.util.spec_from_file_location('installer',Path(__file__).parents[1]/'install.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Readiness(unittest.TestCase):
    def test_reload_race_recovers_without_disabling_tls(self):
        with patch.object(m.subprocess,'run',side_effect=[CompletedProcess([],60,'','mismatch'),CompletedProcess([],0,'','')]) as run,patch.object(m.time,'sleep'):
            m.verify_https()
            self.assertEqual(run.call_count,2)
            for call in run.call_args_list:
                args=call.args[0]
                self.assertNotIn('-k',args)
                self.assertNotIn('--insecure',args)
    def test_persistent_failure_does_not_pass(self):
        with patch.object(m.subprocess,'run',return_value=CompletedProcess([],60,'','mismatch')) as run,patch.object(m.time,'sleep'):
            with self.assertRaises(RuntimeError):m.verify_https()
            self.assertEqual(sum(c.args[0][0]=='curl' for c in run.call_args_list),8)
if __name__=='__main__':unittest.main()
