"""The scoped renderer package must carry its lazy dependencies without native code."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("release", Path(__file__).with_name("build-article-ui-release.py"))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class RendererDependencies(unittest.TestCase):
    def test_missing_renderer_dependency_aborts(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, "locked dependencies"):
                release.renderer_dependencies(Path(folder))

    def test_complete_js_files_are_bundled_and_native_binaries_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "jsdom").mkdir()
            (root / "jsdom/package.json").write_bytes(b'{"name":"jsdom","version":"26.1.0"}\n')
            (root / "jsdom/index.js").write_bytes(b'export const fixture = true;\n')
            (root / ".package-lock.json").write_bytes(b'{}\n')
            result = release.renderer_dependencies(root)
            self.assertEqual(set(result), {"server/runtime/node_modules/jsdom/package.json", "server/runtime/node_modules/jsdom/index.js"})
            (root / "jsdom/native.node").write_bytes(b'fixture')
            with self.assertRaisesRegex(ValueError, "Native renderer dependency"):
                release.renderer_dependencies(root)


if __name__ == "__main__":
    unittest.main()
