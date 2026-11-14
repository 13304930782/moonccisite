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
import sys
import http.server
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("works_release", PROJECT / "scripts/build-editor-release.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class EditorRelease(unittest.TestCase):
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
        for name in ["deploy-editor-release.sh", "rollback-editor-release.sh", "verify-editor-release.cjs"]:
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
            "main": {name: h for name in ["index", "asset_manifest", "runtime_document", "runtime_styles", "runtime_home_css"]},
            "verify_articles": [17, 18],
            "pm2": {name: {"max_memory_restart": budget * 1024 * 1024, "node_args": ["--max-old-space-size=256"],
                             "exec_interpreter": "/opt/mooncci-node-v24.20.0/bin/node", "pm_exec_path": "/server/index.js", "pm_cwd": "/server"}
                    for name, budget in [("mooncci-api", 450), ("mooncci-worker", 300)]},
        }

    def tearDown(self):
        release.ROOT, release.renderer_dependencies = self.original_root, self.original_deps
        assert (PROJECT / ".cache").resolve() in self.root.resolve().parents
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
            archive.extractall(folder)
        return result, folder

    def verify(self, folder):
        return subprocess.run(["node", str(folder / "verify.cjs"), "package", str(folder)], universal_newlines=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    def test_main_archive_is_scoped_and_has_no_migrations(self):
        release.validate_baseline(self.baseline)
        result, folder = self.package()
        checked = self.verify(folder)
        self.assertEqual(checked.returncode, 0, checked.stderr)
        names = (folder / 'FILELIST').read_text().splitlines()
        self.assertEqual(sorted(n for n in names if n.startswith('server/src/')), sorted('server/' + n for n in release.BACKEND_FILES))
        self.assertFalse(any('migrat' in n or n.endswith('.env') for n in names))
        manifest = json.loads((folder / 'MANIFEST.json').read_text())
        self.assertEqual(manifest['runtime_install'], 'managed-files-atomic-entry')
        self.assertEqual(manifest['migrations'], [])
        self.assertEqual(Path(result['archive']+'.sha256').read_bytes(), (result['sha256']+'  '+Path(result['archive']).name+'\n').encode())

    def test_partial_install_guard_and_restore_preserve_existing_bytes(self):
        _, package = self.package()
        live, web, backup = self.root / 'production/server', self.root / 'web', self.root / 'backup'
        backup.mkdir(); (web / 'assets').mkdir(parents=True); (web / 'index.html').write_bytes(b'old-entry\n')
        runtime = live / 'runtime'; runtime.mkdir(parents=True)
        for name in ['document.mjs', 'styles.json', 'home.css']: (runtime / name).write_bytes(b'old-runtime\n')
        for name in [*release.UNCHANGED_BACKEND, *release.BACKEND_FILES, *release.PREREQUISITES]:
            target = live / name; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(b'old\n')
        verifier = self.write('isolated-verifier.cjs', (package / 'verify.cjs').read_text().replace('function roots(live, web, target) {', 'function roots(live, web, target) { return;'))
        def command(name, *args, ok=True):
            code = 'const v=require(process.argv[1]);v[process.argv[2]](...process.argv.slice(3));'
            result = subprocess.run(['node', '-e', code, str(verifier), name, *map(str,args)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
            self.assertEqual(result.returncode == 0, ok, result.stderr)
        command('snapshot', package, live, web, backup)
        before = json.loads((backup/'BEFORE.json').read_text())
        for scope, root in [('frontend',web),('backend',live),('runtime',runtime)]:
            with tarfile.open(backup/(scope+'.tar'),'w') as archive:
                for name, digest in before[scope].items():
                    if digest is not None: archive.add(root/name,arcname=name,recursive=False)
        # Simulate failure after only one backend file and one runtime entry were installed.
        backend_name=release.BACKEND_FILES[0]; (live/backend_name).write_bytes((package/'server'/backend_name).read_bytes())
        (runtime/'document.mjs').write_bytes((package/'server/runtime/document.mjs').read_bytes())
        command('guardRollback', backup)
        (live/backend_name).write_bytes(b'later administrator update\n'); command('guardRollback', backup, ok=False)
        (live/backend_name).write_bytes((package/'server'/backend_name).read_bytes())
        for scope, root in [('frontend',web),('backend',live),('runtime',runtime)]:
            with tarfile.open(backup/(scope+'.tar')) as archive: archive.extractall(root)
        command('removeNew', backup); command('restored', backup)

    def test_only_reviewed_asset_manifest_may_replace_existing_file(self):
        self.write('dist/asset-manifest.json', '{"new":true}\n')
        self.write('dist/favicon.ico', b'new-icon')
        self.baseline['main']['asset_manifest'] = release.sha(b'old-manifest')
        _, package = self.package()
        live, web = self.root/'prod/server', self.root/'prod/web'
        web.mkdir(parents=True); (web/'index.html').write_bytes(b'old\n');(web/'asset-manifest.json').write_bytes(b'old-manifest')
        for name in [*release.UNCHANGED_BACKEND,*release.BACKEND_FILES,*release.PREREQUISITES]:
            target=live/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b'old\n')
        for name in ['document.mjs','styles.json','home.css']:
            target=live/'runtime'/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b'old\n')
        target=live/'runtime/node_modules/jsdom/package.json';target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b'{"name":"jsdom","version":"26.1.0"}\n')
        verifier=self.write('asset-verifier.cjs',(package/'verify.cjs').read_text().replace('function roots(live, web, target) {','function roots(live, web, target) { return;'))
        def check(): return subprocess.run(['node','-e',"require(process.argv[1]).verifyBaseline(...process.argv.slice(2))",str(verifier),str(package),str(live),str(web)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,universal_newlines=True)
        self.assertEqual(check().returncode,0)
        (web/'asset-manifest.json').write_bytes(b'unreviewed')
        self.assertNotEqual(check().returncode,0)
        (web/'asset-manifest.json').write_bytes(b'old-manifest');(web/'favicon.ico').write_bytes(b'custom-icon')
        self.assertNotEqual(check().returncode,0)

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
            result = subprocess.run(["node", "-e", code, str(isolated), cmd, *map(str, args)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
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
            deadline = time.monotonic() + 3
            while state["count"] <= count_at_install and not state["errors"] and time.monotonic() < deadline:
                time.sleep(.01)
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
        result = subprocess.run(["node", "-e", code, str(folder / "verify.cjs")], stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
        self.assertEqual(result.returncode, 0, result.stderr)


    def test_same_origin_article_redirects_are_bounded(self):
        _, package = self.package()
        code = """const {followArticleRedirect:follow}=require(process.argv[1]);
(async()=>{
 const routes=[];
 const result=await follow('/article/18',1000,async (url,remaining)=>{routes.push([url,remaining]); return url==='/article/18'?{status:301,location:'https://moooncci.cn/article/cities-skylines-ii'}:{status:200,body:Buffer.from('ok')}});
 if(result.toString()!=='ok'||routes.length!==2||routes[1][0]!=='/article/cities-skylines-ii') throw Error('redirect failed');
 for (const location of ['https://evil.example/article/slug','//evil.example/article/slug','http://moooncci.cn/article/slug','https://moooncci.cn/admin','https://moooncci.cn/article/x?x=1']) {
  let failed=false; try {await follow('/article/18',1000,async()=>({status:301,location}))} catch(e) {failed=true} if(!failed) throw Error('unsafe redirect accepted');
 }
 let count=0; try {await follow('/article/18',1000,async()=>{count++;return {status:301,location:'/article/again'}});throw Error('loop accepted')} catch(e) {if(count!==3) throw e}
 let calls=0;try {await follow('/article/18',10,async()=>{calls++;return {status:301,location:'/article/test'}},()=>calls*11);throw Error('timeout accepted')} catch(e) {if(calls!==1)throw e}
})().catch(e=>{console.error(e);process.exit(1)});"""
        result = subprocess.run(['node','-e',code,str(package/'verify.cjs')],stdout=subprocess.PIPE,stderr=subprocess.PIPE,universal_newlines=True)
        self.assertEqual(result.returncode,0,result.stderr)

    def test_staged_ssr_checks_rendered_markup_and_payload(self):
        _, package = self.package()
        code = """const v=require(process.argv[1]);
const good=(html)=>({html,data:{status:200,resources:{}}});
v.checkStagedDocument('/',good('<main class=\"home-hero\"></main>'));
v.checkStagedDocument('/article/18',good('<article class=\"article-no-cover\"></article>'));
for(const [url,doc] of [['/',good('mooncci-document-data')],['/article/18',good('home-hero')],['/',{html:'home-hero',data:{status:404,resources:{}}}]]) {
  let failed=false;try {v.checkStagedDocument(url,doc)} catch(e) {failed=true} if(!failed) process.exit(2);
}"""
        result = subprocess.run(['node','-e',code,str(package/'verify.cjs')],stdout=subprocess.PIPE,stderr=subprocess.PIPE,universal_newlines=True)
        self.assertEqual(result.returncode,0,result.stderr)

    @unittest.skipUnless(sys.platform.startswith('linux'), 'Real shell/rsync fault injection requires Linux')
    def test_real_deploy_shell_failure_restores_managed_runtime(self):
        live=self.root/'live/server'; web=self.root/'web'; backups=self.root/'backup'; bindir=self.root/'bin'
        for folder in [live/'runtime/node_modules/jsdom',live/'node_modules/dotenv',web/'assets',backups,bindir]:folder.mkdir(parents=True,exist_ok=True)
        (live/'.env').write_text('PORT=3001\n');(web/'index.html').write_bytes(b'old\n')
        (live/'node_modules/dotenv/index.js').write_text('exports.parse=()=>({});\n')
        self.baseline['backend'][release.BACKEND_FILES[-1]]=None
        for name in [*release.UNCHANGED_BACKEND,*release.BACKEND_FILES,*release.PREREQUISITES]:
            if name==release.BACKEND_FILES[-1]: continue
            target=live/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b'old\n')
        package_json=live/'package.json'; package_json.write_text('{"name":"isolated-fixture"}\n')
        self.baseline['prerequisites']['package.json']=release.sha(package_json.read_bytes())
        public=live/'src/lib/publicDocument.js'; public.write_text('exports.loadPublicResource=async()=>({});\n')
        self.baseline['prerequisites']['src/lib/publicDocument.js']=release.sha(public.read_bytes())
        for name in ['document.mjs','styles.json','home.css']:(live/'runtime'/name).write_bytes(b'old\n')
        (live/'runtime/node_modules/jsdom/package.json').write_bytes(b'{"name":"jsdom","version":"26.1.0"}\n')
        self.write('server/runtime/document.mjs',"export async function renderDocument(url){return {html:url==='/'?'home-hero':'article-has-cover',data:{status:200,resources:{}}}}\n")
        fixture_pm=[{'name':name,'pm2_env':{'status':'online',**config}} for name,config in self.baseline['pm2'].items()]
        class Health(http.server.BaseHTTPRequestHandler):
            def do_GET(self): self.send_response(200); self.end_headers(); self.wfile.write(b'{"ok":true}')
            def log_message(self,*_): pass
        health=http.server.HTTPServer(('127.0.0.1',0),Health);threading.Thread(target=health.serve_forever,daemon=True).start()
        try:
            for name in ['deploy-editor-release.sh','rollback-editor-release.sh','verify-editor-release.cjs']:
                f=self.root/'scripts'/name; text=f.read_text()
                text=text.replace('/www/wwwroot/mooncci-source/server',str(live)).replace('/www/wwwroot/mooncci.site',str(web)).replace('/www/backup',str(backups))
                text=text.replace('127.0.0.1:3001',f'127.0.0.1:{health.server_port}')
                if name.endswith('.cjs'):
                    text=text.replace('async function publicChecks(root, live, web, folder) {', "async function publicChecks(root, live, web, folder) { throw Error('isolated test must never contact a public site');")
                if name.endswith('.sh'):
                    start=text.index('pm() {');end=text.index('\n',start)
                    text=text[:start]+'''pm() { if [ "$1" = jlist ]; then cat "$FIXTURE_PM2"; fi; return 0; }'''+text[end:]
                f.write_text(text)
            pmfile=self.root/'pm.json';pmfile.write_text(json.dumps(fixture_pm))
            script=bindir/'mv';script.write_text('#!/bin/sh\nfor last do :; done\nif [ "$last" = "$FAIL_TARGET" ] && [ ! -e "$FAIL_MARKER" ]; then touch "$FAIL_MARKER"; exit 1; fi\nexec /usr/bin/mv "$@"\n');script.chmod(0o755)
            _,package=self.package()
            env=os.environ.copy();env.update({'PATH':str(bindir)+os.pathsep+env['PATH'],'FAIL_TARGET':str(live/'runtime/document.mjs'),'FAIL_MARKER':str(self.root/'failed'),'FIXTURE_PM2':str(pmfile)})
            runtime=live/'runtime';inode=runtime.stat().st_ino;stop=threading.Event();errors=[];counter={'value':0}
            def writer():
                try:
                    while not stop.is_set():
                        counter['value']+=1
                        for n in ['worker.json','deployment.json']:
                            tmp=runtime/(n+'.'+str(os.getpid())+'.tmp');tmp.write_text(json.dumps(counter));os.replace(tmp,runtime/n)
                        time.sleep(.005)
                except Exception as error: errors.append(error)
            writer_thread=threading.Thread(target=writer);writer_thread.start()
            try: result=subprocess.run(['bash',str(package/'deploy.sh')],cwd=package,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,universal_newlines=True,timeout=120)
            finally: stop.set();writer_thread.join()
            self.assertNotEqual(result.returncode,0,'injected failure should abort deploy')
            self.assertTrue((self.root/'failed').exists(),result.stdout+result.stderr)
            logs=list(backups.glob('mooncci-editor-main.*/rollback-exit-code'))
            self.assertEqual(len(logs),1,result.stdout+result.stderr)
            self.assertEqual(logs[0].read_text().strip(),'0',logs[0].with_name('rollback.log').read_text())
            self.assertEqual(runtime.stat().st_ino,inode);self.assertFalse(errors)
            self.assertEqual((runtime/'document.mjs').read_bytes(),b'old\n');self.assertEqual((web/'index.html').read_bytes(),b'old\n')
            self.assertFalse((live/release.BACKEND_FILES[-1]).exists())
            self.assertGreater(json.loads((runtime/'worker.json').read_text())['value'],0)
        finally: health.shutdown()

if __name__ == "__main__": unittest.main()
