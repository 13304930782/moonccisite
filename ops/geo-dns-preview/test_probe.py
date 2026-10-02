import importlib.util
from pathlib import Path
import socket
import unittest
spec=importlib.util.spec_from_file_location('probe',Path(__file__).with_name('verify-geo-dns.py'))
probe=importlib.util.module_from_spec(spec);spec.loader.exec_module(probe)
class ProbeTests(unittest.TestCase):
    def test_expected_and_unexpected_answers(self):
        self.assertTrue(probe.verdict({'error':None,'addresses':['182.92.179.81']},'CN'))
        self.assertFalse(probe.verdict({'error':None,'addresses':['107.174.123.42']},'CN'))
        self.assertFalse(probe.verdict({'error':None,'addresses':['107.174.123.42','182.92.179.81']},'US'))
        self.assertFalse(probe.verdict({'error':None,'addresses':['107.174.123.42','::1']},'US'))
    def test_nxdomain_is_failure(self):
        def fail(*args,**kwargs):raise socket.gaierror(-2,'missing')
        result=probe.inspect(probe.PROBE,fail)
        self.assertFalse(probe.verdict(result,'US'))
    def test_duplicates_deduplicated(self):
        row=(socket.AF_INET,socket.SOCK_STREAM,6,'',('107.174.123.42',443))
        result=probe.inspect(probe.PROBE,lambda *args,**kwargs:[row,row])
        self.assertTrue(probe.verdict(result,'US'))
if __name__=='__main__': unittest.main()
