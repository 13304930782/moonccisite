import hashlib,importlib.util,pathlib,tempfile,unittest
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
if __name__=='__main__':unittest.main()
