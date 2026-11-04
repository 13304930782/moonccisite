"""Build a baseline-bound bilingual package; never includes environment or dependencies."""
import argparse, datetime, hashlib, io, json, re, subprocess, tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OPS = {'ops/nginx-blog-seo.conf': 'scripts/nginx-blog-seo.conf', 'ops/refresh-sitemap.py': 'scripts/refresh-sitemap.py', 'ops/indexnow.py': 'scripts/indexnow.py'}
MIGRATIONS = [f"20261104000{n}_{name}.sql" for n, name in [(1, "article_translations"), (2, "content_translations"), (3, "translation_draft_source")]]
def sha(data): return hashlib.sha256(data).hexdigest()
def safe(name): return bool(re.fullmatch(r"[A-Za-z0-9_@+.,/-]+", name)) and all(p not in ("", ".", "..") for p in name.split("/"))
def git(*args): return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()
def inputs(base):
    names = git("diff", "--name-only", base, "HEAD", "--", "server/src").splitlines()
    if git("diff", "--name-only", "--diff-filter=D", base, "HEAD", "--", "server/src"):
        raise ValueError("Backend deletion needs explicit release review")
    names += ["server/scripts/migrate-bilingual.js"] + ["server/database/migrations/" + n for n in MIGRATIONS]
    for directory in ["dist", "server/runtime"]:
        for file in sorted((ROOT / directory).rglob("*")):
            rel = file.relative_to(ROOT).as_posix()
            if "node_modules" in file.relative_to(ROOT / directory).parts or file.name == "deployment.json": continue
            if file.is_symlink(): raise ValueError("Release symlink: " + rel)
            if file.is_file() and not any(p.startswith(".") for p in file.relative_to(ROOT / directory).parts): names.append(rel)
    return sorted(set(names) | set(OPS))
def bundle(root, revision, names, baseline):
    if baseline.get("version") != 1 or set(baseline.get("files", {})) != set(names): raise ValueError("Baseline does not match exact payload scope")
    stamp = datetime.datetime.fromisoformat(baseline["captured_at"].replace("Z", "+00:00"))
    age = (datetime.datetime.now(datetime.timezone.utc) - stamp).total_seconds()
    if not 0 <= age <= 86400: raise ValueError("Capture a fresh baseline within 24 hours")
    if set(baseline.get("prerequisites", {})) != {"package.json", "package-lock.json"}: raise ValueError("Dependency prerequisite scope")
    for name, digest in baseline["prerequisites"].items():
        if sha((root / "server" / name).read_bytes().replace(b"\r\n", b"\n")) != digest: raise ValueError("Production dependency manifest differs: " + name)
    entries = {}
    for name in names:
        if not safe(name) or not name.startswith(("server/src/", "server/runtime/", "server/database/migrations/", "dist/")) and name != "server/scripts/migrate-bilingual.js" and name not in OPS: raise ValueError("Unsafe payload " + name)
        if "/node_modules/" in name or name.endswith("deployment.json"): raise ValueError("Protected payload")
        if baseline["files"][name] is not None and not re.fullmatch(r"[a-f0-9]{64}", baseline["files"][name]): raise ValueError("Invalid baseline digest")
        if name in OPS and baseline["files"][name] is None: raise ValueError("Existing operations file required: " + name)
        file = root / OPS.get(name, name)
        if file.is_symlink() or not file.is_file(): raise ValueError("Missing regular payload " + name)
        data = file.read_bytes()
        entries[name] = data.replace(b"\r\n", b"\n") if name.startswith(("server/", "ops/")) else data
    for required in ["dist/index.html", "server/runtime/document.mjs", "server/runtime/styles.json", "server/runtime/home.css"]:
        if not entries.get(required): raise ValueError("Missing built artifact " + required)
    manifest = {"version": 1, "revision": revision, "files": {n: sha(d) for n, d in entries.items()}, "migrations": MIGRATIONS}
    entries["MANIFEST.json"] = (json.dumps(manifest, indent=2) + "\n").encode()
    entries["BASELINE.json"] = (json.dumps(baseline, indent=2) + "\n").encode()
    for name in ["deploy-bilingual.sh", "rollback-bilingual.sh", "verify-bilingual-release.cjs"]:
        entries[name] = (root / "scripts" / name).read_bytes().replace(b"\r\n", b"\n")
    entries["SHA256SUMS"] = "".join(sha(d) + "  " + n + "\n" for n, d in sorted(entries.items())).encode()
    output = root / ".cache" / ("mooncci-bilingual-" + revision[:12] + ".tar.gz")
    output.parent.mkdir(exist_ok=True)
    with tarfile.open(output, "w:gz") as archive:
        for name, data in sorted(entries.items()):
            item = tarfile.TarInfo(name); item.size = len(data); item.mode = 0o755 if name.endswith(".sh") else 0o644
            archive.addfile(item, io.BytesIO(data))
    with tarfile.open(output) as archive:
        assert {m.name: archive.extractfile(m).read() for m in archive.getmembers()} == entries
    for name, data in entries.items():
        if name.endswith((".sh", ".sql")) or name in ["MANIFEST.json", "BASELINE.json", "SHA256SUMS"]: assert b"\r" not in data, name
    Path(str(output) + ".sha256").write_bytes((sha(output.read_bytes()) + "  " + output.name + "\n").encode())
    return {"package": str(output), "sha256": sha(output.read_bytes()), "files": len(names)}
if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("--base", required=True); parser.add_argument("--baseline", type=Path); parser.add_argument("--list-files", action="store_true"); args = parser.parse_args()
    names = inputs(args.base)
    if args.list_files: print(json.dumps(names, indent=2))
    else:
        if git("status", "--porcelain", "--untracked-files=all", "--", ".", ":(exclude)outputs/**"): raise SystemExit("Commit all release changes before packaging (only outputs evidence is excluded)")
        if not args.baseline: raise SystemExit("--baseline required")
        print(json.dumps(bundle(ROOT, git("rev-parse", "HEAD"), names, json.loads(args.baseline.read_text(encoding="utf-8-sig"))), indent=2))
