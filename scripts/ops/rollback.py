#!/usr/bin/env python3
"""Rollback a successful scoped deployment, refusing subsequent changes."""
import argparse,json,os,pathlib,shutil,sys
from deploy import safe,digest,pm2,health

def prepare(backup,roots):
 manifest=json.loads((backup/'MANIFEST.json').read_text());before=json.loads((backup/'BEFORE.json').read_text())
 prior={(r['kind'],r['path']):r for r in before};actions=[]
 for row in manifest['files']:
  key=(row['kind'],row['path']);old=prior[key];dst=safe(roots[row['kind']],row['path']);src=safe(backup/row['kind'],row['path'])
  if not dst.is_file() or digest(dst)!=row['sha256']:raise ValueError('Live changes detected; refusing rollback')
  if old['existed'] and (not src.is_file() or digest(src)!=old['sha256']):raise ValueError('Backup checksum mismatch')
  actions.append((dst,src,old['existed']))
 return manifest,actions

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('backup');args=parser.parse_args()
 try:
  if os.geteuid()!=0:raise ValueError('Root required')
  import fcntl
  backup=pathlib.Path(args.backup).resolve(strict=True)
  if backup.parent!=pathlib.Path('/www/backup') or not backup.name.startswith('mooncci-manifest-'):raise ValueError('Unexpected backup location')
  roots={'backend':pathlib.Path('/www/wwwroot/mooncci-source/server'),'frontend':pathlib.Path('/www/wwwroot/mooncci.site')}
  with pathlib.Path('/www/backup/mooncci-deploy.lock').open('w') as lock:
   fcntl.flock(lock,fcntl.LOCK_EX)
   manifest,actions=prepare(backup,roots)
   for dst,src,existed in actions:
    if existed:
     tmp=dst.with_name(dst.name+'.mooncci-rollback')
     if tmp.exists():raise ValueError('Stale rollback temp file')
     shutil.copy2(src,tmp);shutil.chown(tmp,user='mooncci',group='mooncci');os.replace(tmp,dst)
    else:dst.unlink()
   if any(r['kind']=='backend' for r in manifest['files']):pm2();health()
   state=roots['backend']/'runtime/deployment.json'
   if state.exists():
    info=json.loads(state.read_text());info['result']='rolled-back';state.write_text(json.dumps(info)+'\n')
   print('Scoped files restored; databases and old frontend assets retained.')
 except Exception as error:
  print('Rollback stopped: '+str(error),file=sys.stderr);sys.exit(1)
