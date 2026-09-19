#!/usr/bin/env python3
"""Success heartbeat only while all explicitly configured volumes have headroom."""
import argparse,json,shutil,sys
from backup import secret_file,notify
p=argparse.ArgumentParser();p.add_argument('--config',required=True);args=p.parse_args()
try:
 c=json.loads(secret_file(args.config).read_text());paths=c.get('disk_paths',[])
 if not paths or not c.get('disk_heartbeat'):raise ValueError('Disk monitoring not configured')
 threshold=float(c.get('disk_free_fraction',0.15))
 if not 0<threshold<1:raise ValueError('Invalid threshold')
 for path in paths:
  usage=shutil.disk_usage(path)
  if usage.free/usage.total<threshold:raise ValueError('Disk below threshold')
 notify(c['disk_heartbeat']);print('Configured disks have sufficient free space.')
except Exception as error:
 print('Disk heartbeat withheld: '+type(error).__name__,file=sys.stderr);sys.exit(1)
