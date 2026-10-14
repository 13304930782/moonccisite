"""Exercise actual scoped archives, verifier rejection and complete rollback snapshots."""
import copy
import datetime
import importlib.util
import json
import subprocess
import tarfile
import tempfile
import os
import threading
import time
import unittest
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("works_release", PROJECT / "scripts/build-works-release.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class WorksRelease(unittest.TestCase):
    def setUp(self):
        cache = PROJECT / ".cache"
        cache.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix="works-release-test-", dir=cache)
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
            self.write(name, b"\x89PNG\r\n\x1a\nraw\x00bytes\r\n" if name.endswith(".png") else "/* new frontend source */\n")
        for name in ["deploy-works.sh", "rollback-works.sh", "verify-works-release.cjs", "stage-works-reader-assets.sh", "backup-works.cjs"]:
            self.write("scripts/" + name, (PROJECT / "scripts" / name).read_bytes())
        for name in release.PACKAGE_BACKEND:
            self.write("server/" + name, "/* scoped backend fixture */\n")
        h = release.sha(b"old\n")
        for name in release.PREREQUISITES:
            self.write("server/" + name, "old\n")
        self.baseline = {
            "version": 1, "captured_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "backend": {name: h for name in release.UNCHANGED_BACKEND + release.BACKEND_FILES},
            "prerequisites": {name: h for name in release.PREREQUISITES},
            "frontend_source": {name: h if name != "src/styles/project-detail.css" else None for name in release.SOURCES},
            "main": {name: h for name in ["index", "runtime_document", "runtime_styles", "runtime_home_css"]},
            "reader": {"index": h, "node": "/usr/bin/node"},
            "verify_articles": [{"id": 17, "cover": True}, {"id": 18, "cover": True}],
            "original_covers": [],
            "verify_projects": [{"slug":"promptdock", "name":"PromptDock", "cover":False}],
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
            self.assertFalse(any("/uploads/" in name or name.endswith("schema.sql") for name in names))
            self.assertEqual([name for name in names if name.startswith("server/src/")], sorted("server/" + name for name in release.BACKEND) if target == "main" else [])
            manifest = json.loads((folder / "MANIFEST.json").read_text())
            self.assertEqual(manifest["restarts"], ["mooncci-api"] if target == "main" else [])
            self.assertEqual(manifest["migrations"], [release.MIGRATION] if target == "main" else [])
            self.assertEqual(manifest["backend_files"], release.BACKEND_FILES if target == "main" else [])
            self.assertEqual(Path(result["archive"] + ".sha256").read_bytes(), (result["sha256"] + "  " + Path(result["archive"]).name + "\n").encode())

    def test_binary_icon_source_bytes_preserved(self):
        _, folder = self.package()
        name = "src/assets/projects/promptdock-icon.png"
        self.assertEqual((folder / "source" / name).read_bytes(), (self.root / name).read_bytes())
        self.assertIn(b"\r\n", (folder / "source" / name).read_bytes())

    def test_invalid_project_baseline_rejected(self):
        bad = copy.deepcopy(self.baseline)
        bad["verify_projects"][0]["slug"] = "../../unsafe"
        with self.assertRaisesRegex(ValueError, "published project"):
            release.validate_baseline(bad)
        bad = copy.deepcopy(self.baseline)
        bad["verify_projects"] = []
        with self.assertRaisesRegex(ValueError, "published project"):
            release.validate_baseline(bad)

    def test_reader_preparation_is_scoped_and_preserves_entry(self):
        _, folder = self.package("reader")
        shell = (folder / "stage-assets.sh").read_text()
        self.assertIn("--ignore-existing", shell)
        self.assertNotIn("pm reload", shell)
        self.assertNotIn("dist/index.html", shell)
        self.assertIn("flock -w 120", shell)
        self.assertIn("prestage", shell)
        code = r'''
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.argv[1],web=process.argv[2];
const original=fs.readFileSync(path.join(root,'verify.cjs'),'utf8');
const isolated=path.join(web,'isolated.cjs');
fs.writeFileSync(isolated,original.replace('function roots(live, web, target) {','function roots(live, web, target) { return;'));
const v=require(isolated);const entry=fs.readFileSync(path.join(web,'index.html'));
v.prestage(root,'/unused',web,'before');
assert.throws(()=>v.prestage(root,'/unused',web,'after'),/asset missing/);
for(const file of fs.readdirSync(path.join(root,'dist/assets')))fs.copyFileSync(path.join(root,'dist/assets',file),path.join(web,'assets',file));
v.prestage(root,'/unused',web,'after');
assert.deepEqual(fs.readFileSync(path.join(web,'index.html')),entry);
fs.writeFileSync(path.join(web,'assets/app.js'),'collision');
assert.throws(()=>v.prestage(root,'/unused',web,'before'),/asset differs/);
'''
        web = self.root / "reader-assets-preparation"
        (web / "assets").mkdir(parents=True)
        (web / "index.html").write_bytes(b"old\n")
        result = subprocess.run(["node", "-e", code, str(folder), str(web)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

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
        for name in [name for name in release.SOURCES if name != "src/styles/project-detail.css"]:
            dest = live.parent / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(b"old-source\n")
        (web / "assets").mkdir(parents=True)
        (web / "index.html").write_bytes(b"old-entry\n")
        (web / "assets/app.js").write_bytes(b"old-js\n")
        (live / "runtime/nested").mkdir(parents=True)
        (live / "runtime/document.mjs").write_bytes(b"old-runtime\n")
        (live / "runtime/nested/old.js").write_bytes(b"old-nested\n")
        for name in [*release.UNCHANGED_BACKEND, *release.BACKEND_FILES, *release.PREREQUISITES]:
            if name in self.baseline["backend"] and self.baseline["backend"][name] is None:
                continue
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
        self.assertIsNone(before["source"]["src/styles/project-detail.css"])
        command("guardRollback", backup)
        scopes = [("source", live.parent), ("backend", live), ("runtime", live / "runtime"), ("frontend", web)]
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
        self.assertFalse((live.parent / "src/styles/project-detail.css").exists())
        self.assertFalse((live / release.RUNNER).exists())
        self.assertFalse((live / "database/migrations" / release.MIGRATION).exists())
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
        self.assertIn("unknown runtime code", rejected.stderr)
        (live / "runtime/later.mjs").unlink()
        # A partially installed known SSR file set remains recoverable.
        (live / "runtime/document.mjs").write_bytes((package / "server/runtime/document.mjs").read_bytes())
        command("guardRollback", backup)

    def test_continuously_renamed_worker_state_survives_install_and_restore(self):
        _, package = self.package()
        live, web, backup = self.root / "active-production/server", self.root / "active-web", self.root / "active-backup"
        backup.mkdir()
        for name in release.SOURCES:
            target = live.parent / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(b"old-source\n")
        for name in [*release.UNCHANGED_BACKEND, *release.BACKEND_FILES, *release.PREREQUISITES]:
            if name in self.baseline["backend"] and self.baseline["backend"][name] is None:
                continue
            target = live / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(b"old\n")
        (web / "assets").mkdir(parents=True)
        (web / "index.html").write_bytes(b"old-entry\n")
        runtime = live / "runtime"
        runtime.mkdir()
        for name in ["document.mjs", "styles.json", "home.css"]:
            (runtime / name).write_bytes(b"old-runtime\n")
        inode = runtime.stat().st_ino
        isolated = self.write("active-isolated-verifier.cjs", (package / "verify.cjs").read_text().replace("function roots(live, web, target) {", "function roots(live, web, target) { return;"))
        def command(cmd, *args, ok=True):
            code = "const v=require(process.argv[1]);v[process.argv[2]](...process.argv.slice(3));"
            result = subprocess.run(["node", "-e", code, str(isolated), cmd, *map(str, args)], capture_output=True, text=True)
            self.assertEqual(result.returncode == 0, ok, result.stderr)
            return result
        stop, state = threading.Event(), {"count": 0, "errors": []}
        def writer():
            try:
                while not stop.is_set():
                    state["count"] += 1
                    for name in ["worker.json", "deployment.json"]:
                        tmp = runtime / (name + "." + str(os.getpid()) + ".tmp")
                        tmp.write_text(json.dumps({"counter": state["count"]}) + "\n")
                        os.replace(tmp, runtime / name)
                    time.sleep(.002)
            except Exception as error:
                state["errors"].append(repr(error))
        thread = threading.Thread(target=writer)
        thread.start()
        try:
            command("snapshot", package, live, web, backup)
            before = json.loads((backup / "BEFORE.json").read_text())
            self.assertNotIn("worker.json", before["runtime"])
            self.assertNotIn("deployment.json", before["runtime"])
            self.assertFalse(any(name.endswith(".tmp") for name in before["runtime"]))
            command("restored", backup)  # Periodic writes are not code drift.
            saved = backup / "runtime-before.tar"
            with tarfile.open(saved, "w") as archive:
                for name in before["runtime"]:
                    archive.add(runtime / name, arcname=name, recursive=False)
            # Install non-entry assets first, retaining old hashed files. Then
            # perform actual same-filesystem atomic entry replacement.
            candidate = package / "server/runtime"
            incoming = backup / "incoming"
            incoming.mkdir()
            for source in sorted(candidate.rglob("*")):
                if source.is_file():
                    name = source.relative_to(candidate).as_posix()
                    if name in ["document.mjs", "styles.json", "home.css"]:
                        continue
                    dest = runtime / name
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    dest.write_bytes(source.read_bytes())
            command("guardRollback", backup)  # Valid partial update.
            for name in ["document.mjs", "styles.json", "home.css"]:
                (incoming / name).write_bytes((candidate / name).read_bytes())
                os.replace(incoming / name, runtime / name)
                command("guardRollback", backup)
            count_at_install = state["count"]
            self.assertEqual(runtime.stat().st_ino, inode)
            # Third-value source changes and unknown runtime files still fail.
            (runtime / "home.css").write_bytes(b"later SSR hotfix\n")
            command("guardRollback", backup, ok=False)
            (runtime / "home.css").write_bytes((candidate / "home.css").read_bytes())
            (runtime / "worker.json.not-a-pid.tmp").write_bytes(b"unexpected-code\n")
            command("guardRollback", backup, ok=False)
            (runtime / "worker.json.not-a-pid.tmp").unlink()
            (runtime / "later.mjs").write_bytes(b"unexpected-code\n")
            command("guardRollback", backup, ok=False)
            (runtime / "later.mjs").unlink()
            # Restore only managed tar members and atomically replace entries;
            # state writers are still running throughout.
            with tarfile.open(saved) as archive:
                for member in archive.getmembers():
                    self.assertFalse(release.runtime_state(member.name))
                    (incoming / member.name).parent.mkdir(parents=True, exist_ok=True)
                    (incoming / member.name).write_bytes(archive.extractfile(member).read())
                    os.replace(incoming / member.name, runtime / member.name)
            command("removeNew", backup)
            command("restored", backup)
            self.assertEqual(runtime.stat().st_ino, inode)
            self.assertGreater(state["count"], count_at_install)
        finally:
            stop.set()
            thread.join()
        self.assertEqual(state["errors"], [])
        self.assertGreaterEqual(json.loads((runtime / "worker.json").read_text())["counter"], count_at_install)
        self.assertGreaterEqual(json.loads((runtime / "deployment.json").read_text())["counter"], count_at_install)

    def test_runtime_state_is_not_a_release_input(self):
        self.write("server/runtime/worker.json", '{"not":"packaged"}\n')
        with self.assertRaisesRegex(ValueError, "state must never"):
            self.package()

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
  const html='<div class="article-has-cover project-card project-card-icon project-reading project-reading-body project-reading-rail project-mobile-toc project-releases" data-document-hydrating="true"></div><script id="mooncci-document-data" type="application/json">{"resources":{}}</script>';
  const bytes=fs.readFileSync(file);
  res.emit('data',options.path.startsWith('/assets/')||invalid?bytes:Buffer.concat([bytes,Buffer.from(html)]));res.emit('end');req.emit('close');
 });return req;
};
const v=require(path.join(root,'verify.cjs'));
v.publicChecks(root,'/unused',path.join(root,'dist'),folder).then(async()=>{
 for(const url of ['/','/projects','/projects/promptdock','/articles','/article/17','/article/18','/assets/app.js'])assert.ok(seen.includes(url),url);
 const result=JSON.parse(fs.readFileSync(path.join(folder,'acceptance.json')));
 assert.equal(result.public_documents,6);assert.equal(result.api_operations,'none');assert.equal(result.entry_matches,true);
 invalid=true;
 await assert.rejects(v.publicChecks(root,'/unused',path.join(root,'dist'),folder),/SSR document\/hydration missing/);
}).catch(e=>{console.error(e);process.exitCode=1});
'''
        result = subprocess.run(["node", "-e", code, str(folder), str(output)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_project_presentation_requires_real_showcase_only(self):
        _, folder = self.package()
        code = r'''
const assert=require('node:assert/strict'),v=require(process.argv[1]);
const baseline={verify_projects:[{slug:'promptdock',name:'PromptDock',cover:false}]};
const detail='<div class="project-reading project-reading-body project-reading-rail project-mobile-toc project-releases"></div>';
v.checkProjectDocument('/projects/promptdock',detail,baseline);
assert.throws(()=>v.checkProjectDocument('/projects/promptdock',detail+'project-detail-showcase',baseline),/real cover/);
baseline.verify_projects[0].cover=true;
assert.throws(()=>v.checkProjectDocument('/projects/promptdock',detail,baseline),/real cover/);
v.checkProjectDocument('/projects/promptdock',detail+'project-detail-showcase',baseline);
assert.throws(()=>v.checkProjectDocument('/', '<div>empty</div>',baseline),/cards missing/);
v.checkProjectDocument('/', '<div class="project-card project-card-icon"></div>',baseline);
'''
        result = subprocess.run(["node", "-e", code, str(folder / "verify.cjs")], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_database_backup_rejects_incomplete_tampered_and_bad_rows(self):
        script = PROJECT / "scripts/backup-works.cjs"
        folder = self.root / "database-proof"
        folder.mkdir()
        code = r'''
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),v=require(process.argv[1]),folder=process.argv[2];
const file=path.join(folder,'database-before.sql');
const tables=['projects','project_releases','schema_migrations'];
const body=tables.map(t=>'CREATE TABLE `'+t+'` (`id` int);\n-- Dumping data for table `'+t+'`\nINSERT INTO `'+t+'` VALUES (1,\'quoted, punctuation ) here\');\n').join('');
const complete=body+'-- Dump completed on 2026-10-15 00:00:00\n';
fs.writeFileSync(file,complete);
const info=v.inspectDump(file);assert.deepEqual(info.counts,{projects:1,project_releases:1,schema_migrations:1});
fs.writeFileSync(path.join(folder,'database-backup.json'),JSON.stringify(info,null,2)+'\n');
fs.writeFileSync(path.join(folder,'database-before.sql.sha256'),info.sha256+'  database-before.sql\n');
v.verifyBackup(folder);
fs.writeFileSync(file,complete.replace('here','changed'));
assert.throws(()=>v.verifyBackup(folder),/changed/);
fs.writeFileSync(file,body);assert.throws(()=>v.inspectDump(file),/completion marker/);
fs.writeFileSync(file,complete.replace('VALUES (1,','VALUES (1),(2,'));assert.throws(()=>v.inspectDump(file),/single-row/);
fs.writeFileSync(file,'USE production;\n'+complete);assert.throws(()=>v.inspectDump(file),/separately chosen/);
'''
        result = subprocess.run(["node", "-e", code, str(script), str(folder)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_scripts_preserve_deployment_scope_and_lf(self):
        for name in ["deploy-works.sh", "rollback-works.sh"]:
            data = (PROJECT / "scripts" / name).read_bytes()
            self.assertNotIn(b"\r", data)
            text = data.decode()
            self.assertIn("BASH_SOURCE", text)
            self.assertIn("pm reload mooncci-api", text)
            self.assertNotIn("pm restart mooncci-worker", text)
            self.assertNotIn("npm install", text)
            self.assertNotIn("migrate.js", text)
            self.assertNotIn("DROP COLUMN", text)
            self.assertNotIn("--update-env", text)
        deploy = (PROJECT / "scripts/deploy-works.sh").read_text()
        self.assertNotIn("rsync -ac --delete", deploy)
        self.assertLess(deploy.index('source-before.tar'), deploy.index('changed=1'))
        self.assertIn('bash "$backup/rollback.sh"', deploy)
        self.assertIn("EXPECTED.json", deploy)
        self.assertLess(deploy.index("backup.cjs verify"), deploy.index("--apply"))
        self.assertLess(deploy.index("--apply"), deploy.index("changed=1"))
        self.assertIn("backend-before.tar", deploy)
        self.assertIn("--temp-dir=", deploy)
        self.assertNotIn('mv -- "$live/runtime"', deploy)
        self.assertNotIn('mv -- "$live/runtime"', (PROJECT / "scripts/rollback-works.sh").read_text())
        rollback = (PROJECT / "scripts/rollback-works.sh").read_text()
        self.assertLess(rollback.index("rollback-guard"), rollback.index("tar -xpf"))


if __name__ == "__main__":
    unittest.main()
