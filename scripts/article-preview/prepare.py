"""Prepare checked build outputs for direct-source deployment; no upload needed."""
from pathlib import Path
import argparse,hashlib,json,re,subprocess,tempfile

ROOT=Path(__file__).resolve().parents[2]
HELPERS=Path(__file__).resolve().parent
PREREQUISITES=['src/lib/articleCoverCrop.js','src/lib/articleConflict.js','src/lib/articlePublishing.js','src/lib/articleRevisions.js','src/routes/articleDrafts.js','src/routes/bookmarks.js','src/routes/posts.js','src/routes/series.js','src/routes/upload.js','src/index.js','src/lib/publicDocument.js']
sha=lambda data:hashlib.sha256(data).hexdigest()

def prepare(root,target,helpers=HELPERS,revision=None):
    if target not in ('main','reader'):raise ValueError('Target must be main or reader')
    revision=revision or subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,universal_newlines=True).strip()
    if not re.fullmatch('[a-f0-9]{40}',revision):raise ValueError('Invalid source revision')
    entries={name:(helpers/name).read_bytes() for name in ['deploy.py','deploy.sh','rollback.sh','accept.cjs']}
    folders=[(root/'dist','dist')]
    if target=='main':folders += [(root/'server/runtime','server/runtime'),(root/'.cache/preview-ssr-deps/node_modules','server/runtime/node_modules')]
    for folder,prefix in folders:
        if not folder.is_dir() or folder.is_symlink():raise ValueError('Missing or unsafe build/dependency directory: '+str(folder))
        for file in sorted(folder.rglob('*')):
            rel=file.relative_to(folder)
            if any(part.startswith('.') for part in rel.parts):continue
            if file.is_symlink():raise ValueError('Symlink in output: '+str(file))
            if file.is_file():
                if file.suffix=='.node':raise ValueError('Native dependency outside release scope')
                entries[prefix+'/'+rel.as_posix()]=file.read_bytes()
    if 'dist/index.html' not in entries:raise ValueError('Frontend entry missing')
    if target=='main':
        for name in ['server/runtime/document.mjs','server/runtime/styles.json','server/runtime/home.css','server/runtime/node_modules/jsdom/package.json']:
            if name not in entries:raise ValueError('SSR output or dependency missing: '+name)
        for group in json.loads(entries['server/runtime/styles.json']).values():
            for url in group.get('css',[])+group.get('js',[]):
                if 'dist'+url not in entries:raise ValueError('Missing referenced resource: '+url)
    manifest={'release':'article-preview-pr93','revision':revision,'target':target,'backend_files':[],'migrations':[],'configuration_changes':False,'restarts':['mooncci-api'] if target=='main' else [],'prerequisites':{name:sha((root/'server'/name).read_bytes()) for name in PREREQUISITES} if target=='main' else {}}
    entries['MANIFEST.json']=(json.dumps(manifest,indent=2)+'\n').encode()
    entries['SHA256SUMS']=''.join(sha(data)+'  '+name+'\n' for name,data in sorted(entries.items())).encode()
    for name in ['deploy.py','deploy.sh','rollback.sh','accept.cjs','MANIFEST.json','SHA256SUMS']:
        if b'\r' in entries[name]:raise ValueError('Non-LF deployment script or metadata: '+name)
    cache=root/'.cache';cache.mkdir(exist_ok=True)
    stage=Path(tempfile.mkdtemp(prefix='preview-source-'+target+'.',dir=cache))
    for name,data in entries.items():
        file=stage/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(data)
    return stage

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--target',choices=['main','reader'],required=True);args=parser.parse_args()
    if subprocess.check_output(['git','status','--porcelain'],cwd=ROOT,universal_newlines=True).strip():raise SystemExit('Commit source changes before building a deployment')
    print(prepare(ROOT,args.target))
