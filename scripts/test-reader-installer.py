import hashlib,importlib.util,pathlib,tempfile,unittest
from unittest.mock import patch
from contextlib import ExitStack
ROOT=pathlib.Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('installer',ROOT/'edge/reader/install.py');installer=importlib.util.module_from_spec(spec);spec.loader.exec_module(installer)
class InstallerTests(unittest.TestCase):
 def test_payload_validation_and_unknown_files(self):
  with tempfile.TemporaryDirectory() as temp:
   root=pathlib.Path(temp);data=('a'*40+'\n').encode();(root/'REVISION').write_bytes(data)
   (root/'SHA256SUMS').write_text(hashlib.sha256(data).hexdigest()+'  REVISION\n')
   self.assertEqual(installer.check_package(root),'a'*40)
   (root/'unexpected').write_text('x')
   with self.assertRaisesRegex(ValueError,'Unlisted'):installer.check_package(root)
   (root/'unexpected').unlink();(root/'REVISION').write_text('corrupt')
   with self.assertRaisesRegex(ValueError,'checksum mismatch'):installer.check_package(root)
 def test_manifest_traversal_and_duplicate(self):
  with tempfile.TemporaryDirectory() as temp:
   root=pathlib.Path(temp)
   (root/'SHA256SUMS').write_text('a'*64+'  ../outside\n')
   with self.assertRaisesRegex(ValueError,'Invalid checksum'):installer.check_package(root)
 def test_recovery_accepts_only_exact_failed_tree(self):
  with tempfile.TemporaryDirectory() as temp:
   root=pathlib.Path(temp);revision='b'*40;release=root/'releases'/revision;release.mkdir(parents=True)
   data=b'original';(release/'REVISION').write_bytes(data)
   stack=ExitStack();self.addCleanup(stack.close)
   try:(root/'current').symlink_to(release,target_is_directory=True)
   except OSError:
    # Windows without symlink privilege: emulate only the link metadata; all hashes remain real files.
    current=root/'current';current.write_text('link')
    original_link=pathlib.Path.is_symlink;original_resolve=pathlib.Path.resolve
    stack.enter_context(patch.object(pathlib.Path,'is_symlink',lambda p: True if p==current else original_link(p)))
    stack.enter_context(patch.object(pathlib.Path,'resolve',lambda p,*a,**k: original_resolve(release,*a,**k) if p==current else original_resolve(p,*a,**k)))
   (root/'INSTALL_FAILED').write_text('Inspect this isolated directory before retry.\n')
   baseline={'revision':revision,'files':{'REVISION':hashlib.sha256(data).hexdigest()}}
   self.assertTrue(installer.failed_install_matches(root,baseline))
   (root/'INSTALL.json').write_text('{}');self.assertFalse(installer.failed_install_matches(root,baseline));(root/'INSTALL.json').unlink()
   (release/'REVISION').write_bytes(b'changed');self.assertFalse(installer.failed_install_matches(root,baseline))
   (release/'REVISION').write_bytes(data);(root/'unknown').write_text('keep');self.assertFalse(installer.failed_install_matches(root,baseline))
if __name__=='__main__':unittest.main()
