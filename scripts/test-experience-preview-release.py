import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('release',HERE/'experience-preview-release.py')
r=importlib.util.module_from_spec(spec); spec.loader.exec_module(r)


class ReleaseTest(unittest.TestCase):
    def test_scoped_install_and_verified_rollback(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); r.LIVE=root/'server'; r.WEB=root/'web'; pkg=root/'package'; backup=root/'backup'
            for folder in [r.LIVE,r.WEB,pkg,backup]: folder.mkdir()
            names={'server/src/routes/settings.js':b'new settings','server/runtime/document.mjs':b'new ssr','dist/index.html':b'new page','dist/assets/new.js':b'new asset'}
            previous={'server/src/routes/settings.js':b'old settings','server/runtime/document.mjs':b'old ssr','dist/index.html':b'old page'}
            sha=lambda data:hashlib.sha256(data).hexdigest()
            for name,data in names.items():
                f=pkg/name;f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(data)
            for name,data in previous.items():
                f=r.target(name);f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(data)
            for name in ['experience-preview-release.py','deploy-experience-preview.sh']:(pkg/name).write_text('test')
            baseline={n:sha(previous[n]) if n in previous else None for n in names}
            (pkg/'BASELINE.json').write_text(json.dumps(baseline))
            (pkg/'MANIFEST.json').write_text(json.dumps({'revision':'abc','files':{n:sha(d) for n,d in names.items()}}))
            (r.LIVE/'.env').write_text('keep'); (r.WEB/'old-asset.js').write_text('keep')
            with patch.object(r.os,'chown',create=True):
                r.snapshot(pkg,backup); r.install(pkg)
            self.assertEqual(r.target('dist/index.html').read_bytes(),b'new page')
            self.assertEqual((r.LIVE/'.env').read_text(),'keep')
            self.assertEqual((r.WEB/'old-asset.js').read_text(),'keep')
            with patch.object(r.os,'chown',create=True): r.restore(backup)
            self.assertEqual(r.target('dist/index.html').read_bytes(),b'old page')
            self.assertFalse(r.target('dist/assets/new.js').exists())
            r.target('dist/index.html').write_text('unexpected')
            with self.assertRaisesRegex(ValueError,'drift'):r.restore(backup)
            with self.assertRaises(ValueError):r.target('server/runtime/node_modules/x')
            with self.assertRaises(ValueError):r.target('dist/../secret')


if __name__=='__main__':unittest.main()
