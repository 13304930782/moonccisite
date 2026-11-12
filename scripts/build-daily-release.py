#!/usr/bin/env python3
"""Build this release from a reviewed, freshly captured production baseline."""
import argparse, hashlib, io, json, pathlib, re, subprocess, tarfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
BACKEND = ('src/index.js', 'src/lib/articlePublishing.js', 'src/lib/articleRevisions.js', 'src/lib/articleConflict.js', 'src/repositories/weatherMoodRepository.js', 'src/routes/articleDrafts.js', 'src/routes/posts.js', 'src/routes/weatherMood.js', 'src/lib/dailyQuestion.js', 'src/routes/dailyQuestions.js', 'src/routes/serviceTokens.js', 'src/routes/publishing.js', 'src/routes/contentTranslations.js', 'scripts/migrate-article-likes.js', 'scripts/migrate-post-aside.js', 'database/migrations/202611120002_post_aside.sql', 'database/migrations/202611120003_daily_questions.sql')
MIGRATIONS = ('202611120002_post_aside.sql', '202611120003_daily_questions.sql')
TOOLS = ('release-daily-install.py', 'release-daily-migrate.cjs', 'release-daily-backup.cjs')
REVIEWED = {
    'src/index.js': '283cfdcf08a4400ea52709520ac4df4e20f754a67e96d35251ba274aaa20fa4a',
    'src/lib/articlePublishing.js': '17c161d5441ccc965bd41092559d2010a2c7ff8e2c1b32112d837f16ad7fed34',
    'src/lib/articleRevisions.js': 'dfe4a026ea3c84e1a63bdf438fea6643538d24722716e8fddc548d168e2b1228',
    'src/lib/articleConflict.js': '5ac3b3b7656296751280c73e53d2f4d5c43c6f40b6c3ffe3fd4b46a020196e9d',
    'src/repositories/weatherMoodRepository.js': '814f1cb2c7f1b58bb432ac941dc4a9154a77e02a8f52b7745827b9291825b653',
    'src/routes/articleDrafts.js': '4402be385bb5740c5478dea13b0e6c6dc3b7b528a839152953578d93641cf261',
    'src/routes/posts.js': '5e9cbedad5c2ed626cf073d5f5eb61435725b584010c1d650b5709417c1fceea',
    'src/routes/weatherMood.js': '4d4003b9b241d0c014e4904ea5e9f84cabedacb29daeb33b455febcd91d471c5',
    'src/lib/dailyQuestion.js': None, 'src/routes/dailyQuestions.js': None,
    'src/routes/serviceTokens.js': '16d7f5c9481464c89f71a27c4ed295fccbe80f08a022f80e092f00d79447045c',
    'src/routes/publishing.js': '925fbc9f29c23d70150d35b070dfb80c65877ad7f24f88ec48b6140b1758bb97',
    'src/routes/contentTranslations.js': '07282d5d58c23d8b09a5c11c2f2c642826080a7c388b8fd50ea791b17f75cfd1',
    'scripts/migrate-article-likes.js': None,
    'scripts/migrate-post-aside.js': None,
    'database/migrations/202611120002_post_aside.sql': None,
    'database/migrations/202611120003_daily_questions.sql': None,
}
REVIEWED_RUNTIME = {
    'server/runtime/document.mjs': '1e2a6a38c7583808b8aa00e28c66f7c7849d31590df14693eba681cc0cecd354',
    'server/runtime/home.css': 'a75bf670ee0b0fd5a6a8c98bed1b7b7ea33e17cedc80fd24a78f45196f9d98f0',
    'server/runtime/styles.json': '0edfaff3ee628c5d216c831fb16f5bdd3e58c80955eebf58f920bad4f8390b29',
}
def digest(data): return hashlib.sha256(data).hexdigest()

def names():
    result = ['server/' + x for x in BACKEND]
    result.extend('server/runtime/' + x for x in ('document.mjs', 'home.css', 'styles.json'))
    for directory in ('dist', 'server/runtime/chunks', 'server/runtime/assets'):
        for file in (ROOT / directory).rglob('*'):
            relative = file.relative_to(ROOT).as_posix()
            if file.is_symlink(): raise ValueError('Symlink: ' + relative)
            if file.is_file() and not any(x.startswith('.') for x in file.relative_to(ROOT / directory).parts) and 'node_modules' not in file.parts and relative != 'server/runtime/deployment.json': result.append(relative)
    if 'dist/index.html' not in result: raise ValueError('Build dist first')
    if not any(n.startswith('server/runtime/chunks/') for n in result): raise ValueError('SSR chunks missing')
    for name in [x for x in result if x == 'server/runtime/document.mjs' or x.startswith('server/runtime/chunks/') and x.endswith('.mjs')]:
        text = (ROOT / name).read_text(encoding='utf8')
        for rel in re.findall(r'''["'](\.{1,2}/[^"']+?\.(?:mjs|json))["']''', text):
            if not (ROOT / name).parent.joinpath(rel).is_file(): raise ValueError('Missing SSR dependency: ' + name + ' ' + rel)
    styles = json.loads((ROOT / 'server/runtime/styles.json').read_text(encoding='utf8'))
    for group in styles.values():
        for url in group.get('css', []) + group.get('js', []):
            if not (ROOT / 'dist' / url.lstrip('/')).is_file(): raise ValueError('Missing client asset: ' + url)
    return sorted(result)

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--list-files', action='store_true'); parser.add_argument('--baseline', type=pathlib.Path); args = parser.parse_args()
    paths = names()
    if args.list_files: print(json.dumps(paths, indent=2)); return
    if not args.baseline: raise ValueError('A freshly captured baseline is required')
    baseline = json.loads(args.baseline.read_text(encoding='utf8'))
    if set(baseline) != set(paths): raise ValueError('Baseline scope differs')
    entries = {name: (ROOT / name).read_bytes() for name in paths}
    for name in MIGRATIONS:
        key = 'server/database/migrations/' + name
        entries[key] = entries[key].replace(b'\r\n', b'\n')
    for name, expected in REVIEWED.items():
        if baseline['server/' + name] not in (expected, digest(entries['server/' + name])):
            raise ValueError('Unreviewed backend drift: ' + name)
    for name, expected in REVIEWED_RUNTIME.items():
        if baseline[name] not in (expected, digest(entries[name])):
            raise ValueError('Unreviewed runtime drift: ' + name)
    for name in paths:
        if name.startswith(('server/runtime/chunks/', 'server/runtime/assets/')) and baseline[name] not in (None, digest(entries[name])):
            raise ValueError('Existing runtime asset differs: ' + name)
    for name in MIGRATIONS: entries['migrations/' + name] = (ROOT / 'server/database/migrations' / name).read_bytes().replace(b'\r\n', b'\n')
    for name in TOOLS: entries[name] = (ROOT / 'scripts' / name).read_bytes().replace(b'\r\n', b'\n')
    entries['BASELINE.json'] = (json.dumps(baseline, indent=2) + '\n').encode()
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    manifest = {'revision': revision, 'files': {name: digest(entries[name]) for name in paths}, 'migrations': {name: digest(entries['migrations/' + name]) for name in MIGRATIONS}, 'tools': {name: digest(entries[name]) for name in TOOLS}}
    entries['MANIFEST.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    entries['SHA256SUMS'] = ''.join(digest(value) + '  ' + key + '\n' for key, value in sorted(entries.items())).encode()
    output = ROOT / '.cache' / ('mooncci-daily-' + revision[:12] + '.tar.gz'); output.parent.mkdir(exist_ok=True)
    with tarfile.open(output, 'w:gz') as tar:
        for name, data in sorted(entries.items()):
            info = tarfile.TarInfo(name); info.size = len(data); info.mode = 0o644; tar.addfile(info, io.BytesIO(data))
    with tarfile.open(output, 'r:gz') as tar:
        if {item.name: tar.extractfile(item).read() for item in tar.getmembers()} != entries: raise ValueError('Archive verification failed')
    pathlib.Path(str(output) + '.sha256').write_bytes((digest(output.read_bytes()) + '  ' + output.name + '\n').encode())
    print(output)
if __name__ == '__main__': main()
