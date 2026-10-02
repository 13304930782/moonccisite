import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('renderer',Path(__file__).with_name('render.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class RenderTests(unittest.TestCase):
    def test_scoped_destinations_and_isolation(self):
        for region in ('CN','US'):
            config=m.render(region,'/tmp/fullchain.pem','/tmp/key.pem','a'*64)
            self.assertEqual(config.count('server_name route-test.mooncci.site;'),2)
            self.assertNotIn('cuegroveapp.com',config)
            self.assertIn('proxy_next_upstream off;',config)
            self.assertIn('proxy_pass_request_headers off;',config)
            self.assertIn('return 405;',config)
            self.assertIn('if ($http_cookie != "") { return 403; }',config)
            self.assertIn('if ($http_authorization != "") { return 403; }',config)
            self.assertIn('X-Mooncci-Node '+region,config)
            self.assertIn('127.0.0.1:'+('3102' if region=='US' else '3001'),config)
            self.assertNotIn('proxy_pass https://mooncci.site',config)
    def test_keys_and_paths(self):
        with self.assertRaises(ValueError):m.render('US','/tmp/a','/tmp/b','bad')
        with self.assertRaises(ValueError):m.render('CN','/tmp/a;injected','/tmp/b')
        with self.assertRaises(ValueError):m.render('CN','/tmp/../a','/tmp/b')
        self.assertNotIn('a'*64,m.render('CN','/tmp/a','/tmp/b','a'*64))
if __name__=='__main__':unittest.main()
