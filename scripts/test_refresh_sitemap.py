import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('refresh', Path(__file__).with_name('refresh-sitemap.py'))
refresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)


def xml(paths):
    return ('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + ''.join(
        '<url><loc>https://mooncci.site{}</loc></url>'.format(p) for p in paths) + '</urlset>').encode()


class SitemapTest(unittest.TestCase):
    def test_publish_withdraw_and_failure_preserves_previous(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(refresh.os, 'fchmod', create=True):
            target = Path(directory) / 'sitemap.xml'
            refresh.publish(xml(['/', '/article/18']), target)
            refresh.publish(xml(['/']), target)
            self.assertNotIn(b'article/18', target.read_bytes())
            for bad in [b'<html>error</html>', xml([]), xml(['/', '/']), xml(['/']).replace(b'mooncci.site', b'other.test')]:
                with self.assertRaises(ValueError):
                    refresh.publish(bad, target)
                self.assertEqual(target.read_bytes(), xml(['/']))

    def test_atomic_failure_keeps_valid_file(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(refresh.os, 'fchmod', create=True):
            target = Path(directory) / 'sitemap.xml'
            refresh.publish(xml(['/']), target)
            with patch.object(refresh.os, 'replace', side_effect=OSError('disk failure')):
                with self.assertRaises(OSError):
                    refresh.publish(xml(['/', '/article/18']), target)
            self.assertEqual(target.read_bytes(), xml(['/']))
            self.assertEqual(list(Path(directory).iterdir()), [target])


if __name__ == '__main__':
    unittest.main()
