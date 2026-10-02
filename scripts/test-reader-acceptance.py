import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location('acceptance', Path(__file__).with_name('verify-reader-preview.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class AssetTypes(unittest.TestCase):
    def test_observed_valid_types(self):
        for path, mime in [('a.js','text/javascript'),('a.js','application/javascript; charset=utf-8'),('a.css','text/css'),('a.css','text/css; charset=utf-8')]:
            with self.subTest(mime=mime):
                self.assertTrue(module.valid_asset_type(path,mime,'/* 中文 */'.encode()))
    def test_reject_html_missing_or_cross_type(self):
        for path, mime in [('a.js','text/html'),('a.css','text/javascript'),('a.js','text/css'),('a.js',None)]:
            self.assertFalse(module.valid_asset_type(path,mime,b'anything'))
    def test_reject_wrong_or_ambiguous_encoding(self):
        for mime in ['text/css; charset=gbk','text/css; charset=utf-8; charset=gbk','text/css; nonsense']:
            self.assertFalse(module.valid_asset_type('a.css',mime,b'abc'))
        self.assertFalse(module.valid_asset_type('a.css','text/css',b'\xff'))

if __name__ == '__main__':
    unittest.main()
