"""Exercise actual scoped archives, verifier rejection and complete rollback snapshots."""
import copy
import datetime
import importlib.util
import json
import subprocess
import tarfile
import tempfile
import unittest
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("cover_focus_release", PROJECT / "scripts/build-cover-focus-release.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class CoverFocusRelease(unittest.TestCase):
    def setUp(self):
        cache = PROJECT / ".cache"
        cache.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix="cover-focus-release-test-", dir=cache)
        self.root = Path(self.temp.name)
        self.original_root, self.original_deps = release.ROOT, release.renderer_dependencies
        release.ROOT = self.root
        release.renderer_dependencies = lambda _: {"server/runtime/node_modules/jsdom/package.json": b'{"name":"jsdom","version":"26.1.0"}\n'}
        self.write("dist/index.html", '<script src="/assets/app.js"></script>\n')
        self.write("dist/assets/app.js", 'console.log("fixture");\n')
        self.write("dist/assets/app.css", "body{margin:0}\n")
        self.write("server/runtime/document.mjs", "export function renderDocument() {}\n")
        self.write("server/runtime/styles.json", '{"main":{"css":["/assets/app.css"],"js":["/assets/app.js"]}}\n')
        self.write("server/runtime/home.css", "body{margin:0}\n")
        self.write("scripts/document-runtime/package-lock.json", "{}\n")
        for name in release.SOURCES:
            self.write(name, "/* new frontend source */\n")
        for name in ["deploy-cover-focus.sh", "rollback-cover-focus.sh", "verify-cover-focus-release.cjs"]:
            self.write("scripts/" + name, (PROJECT / "scripts" / name).read_bytes())
        h = release.sha(b"old\n")
        for name in release.PREREQUISITES:
            self.write("server/" + name, "old\n")
        self.baseline = {
            "version": 1, "captured_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "backend": {name: h for name in release.UNCHANGED_BACKEND},
            "prerequisites": {name: h for name in release.PREREQUISITES},
            "frontend_source": {name: h if name != "src/styles/mobile-inputs.css" else None for name in release.SOURCES},
            "main": {name: h for name in ["index", "runtime_document", "runtime_styles", "runtime_home_css"]},
            "reader": {"index": h, "node": "/usr/bin/node"},
            "verify_articles": [{"id": 17, "cover": True}, {"id": 18, "cover": True}],
            "original_covers": [],
            "pm2": {name: {"max_memory_restart": budget * 1024 * 1024, "node_args": ["--max-old-space-size=256"],
                             "exec_interpreter": "/opt/mooncci-node-v24.20.0/bin/node", "pm_exec_path": "/server/index.js", "pm_cwd": "/server"}
                    for name, budget in [("mooncci-api", 450), ("mooncci-worker", 300)]},
        }

    def tearDown(self):
        release.ROOT, release.renderer_dependencies = self.original_root, self.original_deps
        assert self.root.resolve().is_relative_to((PROJECT / ".cache").resolve())
        self.temp.cleanup()

    def write(self, name, data):
        target = self.root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data.encode() if isinstance(data, str) else data)
        return target

    def package(self, target="main"):
        result = release.bundle(target, "a" * 40, self.baseline)
        folder = self.root / (target + "-unpacked")
        folder.mkdir()
        with tarfile.open(result["archive"]) as archive:
            archive.extractall(folder, filter="data")
        return result, folder

    def verify(self, folder):
        return subprocess.run(["node", str(folder / "verify.cjs"), "package", str(folder)], text=True, capture_output=True)

    def test_actual_main_and_reader_archives(self):
        release.validate_baseline(self.baseline)
        for target in ["main", "reader"]:
            result, folder = self.package(target)
            checked = self.verify(folder)
            self.assertEqual(checked.returncode, 0, checked.stderr)
            names = (folder / "FILELIST").read_text().splitlines()
            self.assertFalse(any(name.startswith("server/src/") or "/migrations/" in name or "/uploads/" in name for name in names))
            manifest = json.loads((folder / "MANIFEST.json").read_text())
            self.assertEqual(manifest["restarts"], ["mooncci-api"] if target == "main" else [])
            self.assertEqual(manifest["migrations"], [])
            self.assertEqual(manifest["backend_files"], [])
            self.assertEqual(Path(result["archive"] + ".sha256").read_bytes(), (result["sha256"] + "  " + Path(result["archive"]).name + "\n").encode())

    def test_modified_asset_rejected(self):
        _, folder = self.package()
        (folder / "dist/assets/app.js").write_bytes(b"tampered\n")
        result = self.verify(folder)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Package bytes changed", result.stderr)

    def test_extra_secret_file_rejected(self):
        _, folder = self.package()
        (folder / ".env").write_bytes(b"not-a-real-secret\n")
        self.assertNotEqual(self.verify(folder).returncode, 0)

    def test_missing_asset_reference_rejected_before_archive(self):
        self.write("server/runtime/styles.json", '{"main":{"css":["/assets/missing.css"]}}\n')
        with self.assertRaisesRegex(ValueError, "Missing packaged asset"):
            self.package()

    def test_stale_and_incomplete_baselines_rejected(self):
        old = copy.deepcopy(self.baseline)
        old["captured_at"] = "2020-01-01T00:00:00Z"
        with self.assertRaisesRegex(ValueError, "fresh"):
            release.validate_baseline(old)
        del old["frontend_source"][release.SOURCES[0]]
        with self.assertRaisesRegex(ValueError, "source baseline"):
            release.validate_baseline(old)

    def test_sources_runtime_and_entry_snapshot_restore(self):
        _, package = self.package()
        live, web, backup = self.root / "production/server", self.root / "web", self.root / "backup"
        backup.mkdir()
        for name in [name for name in release.SOURCES if name != "src/styles/mobile-inputs.css"]:
            dest = live.parent / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(b"old-source\n")
        (web / "assets").mkdir(parents=True)
        (web / "index.html").write_bytes(b"old-entry\n")
        (web / "assets/app.js").write_bytes(b"old-js\n")
        (live / "runtime/nested").mkdir(parents=True)
        (live / "runtime/document.mjs").write_bytes(b"old-runtime\n")
        (live / "runtime/nested/old.js").write_bytes(b"old-nested\n")
        for name in [*release.UNCHANGED_BACKEND, *release.PREREQUISITES]:
            dest = live / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(b"old\n")
        # Rewrite ONLY the root guard in an isolated verifier copy, never production code.
        verifier = (package / "verify.cjs").read_text().replace("function roots(live, web, target) {", "function roots(live, web, target) { return;")
        isolated = self.write("isolated-verifier.cjs", verifier)
        def command(cmd, *args):
            code = "const v=require(process.argv[1]);v[process.argv[2]](...process.argv.slice(3));"
            result = subprocess.run(["node", "-e", code, str(isolated), cmd, *map(str, args)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
        command("snapshot", package, live, web, backup)
        before = json.loads((backup / "BEFORE.json").read_text())
        self.assertIsNone(before["source"]["src/styles/mobile-inputs.css"])
        command("guardRollback", backup)
        scopes = [("source", live.parent), ("runtime", live / "runtime"), ("frontend", web)]
        for scope, root in scopes:
            archive_path = backup / (scope + ".tar")
            with tarfile.open(archive_path, "w") as archive:
                for name, digest in before[scope].items():
                    if digest is not None:
                        archive.add(root / name, arcname=name, recursive=False)
            with tarfile.open(archive_path) as archive:
                for member in archive.getmembers():
                    self.assertEqual(release.sha(archive.extractfile(member).read()), before[scope][member.name])
            for name in before[scope]:
                dest = root / name
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(b"new bytes\n")
            with tarfile.open(archive_path) as archive:
                archive.extractall(root, filter="data")
        command("removeNew", backup)
        command("restored", backup)
        self.assertFalse((live.parent / "src/styles/mobile-inputs.css").exists())
        command("guardRollback", backup)
        # A later source-only hotfix is protected even when the frontend entry is unchanged.
        (live.parent / release.SOURCES[1]).write_bytes(b"later source update\n")
        rejected = subprocess.run(["node", "-e", "require(process.argv[1]).guardRollback(process.argv[2])", str(isolated), str(backup)], capture_output=True, text=True)
        self.assertNotEqual(rejected.returncode, 0)
        self.assertIn("later file drift", rejected.stderr)
        (live.parent / release.SOURCES[1]).write_bytes(b"old-source\n")
        (live / "runtime/later.mjs").write_bytes(b"later runtime update\n")
        rejected = subprocess.run(["node", "-e", "require(process.argv[1]).guardRollback(process.argv[2])", str(isolated), str(backup)], capture_output=True, text=True)
        self.assertNotEqual(rejected.returncode, 0)
        self.assertIn("later runtime drift", rejected.stderr)
        (live / "runtime/later.mjs").unlink()
        # The safe atomic-transfer intermediate state also remains recoverable.
        (live / "runtime").rename(backup / "runtime-prior")
        command("guardRollback", backup)

    def test_cache_retry_is_bounded_and_structure_failures_are_immediate(self):
        _, folder = self.package()
        code = r'''
const assert=require('node:assert/strict'),v=require(process.argv[1]);
(async()=>{
 let clock=0,calls=0;
 const good='<div data-document-hydrating="true"></div><script src="/assets/new.js"></script>';
 const old=good.replace('new.js','old.js');
 const options={now:()=>clock,sleep:async ms=>{clock+=ms},budgetMs:20000};
 const validate=html=>{if(!html.includes('data-document-hydrating'))throw Error('SSR structure missing')};
 const bytes=await v.matchingDocument(async()=>Buffer.from(++calls<4?old:good),'/', ['/assets/new.js'],validate,options);
 assert.equal(bytes.toString(),good);assert.equal(calls,4);assert.equal(clock,6000);
 clock=0;calls=0;
 await assert.rejects(v.matchingDocument(async()=>{calls++;return Buffer.from(old)},'/', ['/assets/new.js'],validate,options),/bounded cache wait/);
 assert.equal(clock,20000);assert.equal(calls,11);
 calls=0;
 await assert.rejects(v.matchingDocument(async()=>{calls++;return Buffer.from('<script src="/assets/old.js"></script>')},'/', ['/assets/new.js'],validate,options),/SSR structure missing/);
 assert.equal(calls,1);
 calls=0;
 await assert.rejects(v.matchingDocument(async()=>{calls++;throw Error('HTTP 503')},'/', ['/assets/new.js'],validate,options),/HTTP 503/);
 assert.equal(calls,1);
})().catch(e=>{console.error(e);process.exitCode=1});
'''
        result = subprocess.run(["node", "-e", code, str(folder / "verify.cjs")], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_reader_public_routes_and_resources_without_local_api(self):
        _, folder = self.package("reader")
        output = self.root / "reader-public-results"
        output.mkdir()
        code = r'''
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),https=require('node:https'),{EventEmitter}=require('node:events');
const root=process.argv[1],folder=process.argv[2],seen=[];let invalid=false;
global.fetch=()=>{throw Error('Reader must not call local API')};
https.get=(options,callback)=>{
 assert.equal(options.hostname,'mooncci.site');seen.push(options.path);
 const req=new EventEmitter();req.setTimeout=()=>req;
 process.nextTick(()=>{
  const res=new EventEmitter();res.statusCode=200;callback(res);
  const file=options.path.startsWith('/assets/')?path.join(root,'dist',options.path):path.join(root,'dist/index.html');
  const html='<div class="article-has-cover" data-document-hydrating="true"></div><script id="mooncci-document-data" type="application/json">{"resources":{}}</script>';
  const bytes=fs.readFileSync(file);
  res.emit('data',options.path.startsWith('/assets/')||invalid?bytes:Buffer.concat([bytes,Buffer.from(html)]));res.emit('end');req.emit('close');
 });return req;
};
const v=require(path.join(root,'verify.cjs'));
v.publicChecks(root,'/unused',path.join(root,'dist'),folder).then(async()=>{
 for(const url of ['/','/articles','/article/17','/article/18','/assets/app.js'])assert.ok(seen.includes(url),url);
 const result=JSON.parse(fs.readFileSync(path.join(folder,'acceptance.json')));
 assert.equal(result.public_documents,4);assert.equal(result.api_operations,'none');assert.equal(result.entry_matches,true);
 invalid=true;
 await assert.rejects(v.publicChecks(root,'/unused',path.join(root,'dist'),folder),/SSR document\/hydration missing/);
}).catch(e=>{console.error(e);process.exitCode=1});
'''
        result = subprocess.run(["node", "-e", code, str(folder), str(output)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_scripts_preserve_deployment_scope_and_lf(self):
        for name in ["deploy-cover-focus.sh", "rollback-cover-focus.sh"]:
            data = (PROJECT / "scripts" / name).read_bytes()
            self.assertNotIn(b"\r", data)
            text = data.decode()
            self.assertIn("BASH_SOURCE", text)
            self.assertIn("pm reload mooncci-api", text)
            self.assertNotIn("pm restart mooncci-worker", text)
            self.assertNotIn("npm install", text)
            self.assertNotIn("migrate-", text)
            self.assertNotIn("--update-env", text)
        deploy = (PROJECT / "scripts/deploy-cover-focus.sh").read_text()
        self.assertNotIn("rsync -ac --delete", deploy)
        self.assertLess(deploy.index('source-before.tar'), deploy.index('changed=1'))
        self.assertIn('bash "$backup/rollback.sh"', deploy)
        self.assertIn("EXPECTED.json", deploy)
        rollback = (PROJECT / "scripts/rollback-cover-focus.sh").read_text()
        self.assertLess(rollback.index("rollback-guard"), rollback.index("tar -xpf"))


if __name__ == "__main__":
    unittest.main()
