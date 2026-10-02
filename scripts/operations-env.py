"""Change only the operations feature flag, preserving all other environment lines."""
import os,re,sys,tempfile
from pathlib import Path
target=Path(sys.argv[1])
value=sys.argv[2]
if value not in ('true','false'):raise SystemExit('Invalid flag')
data=target.read_bytes()
text=data.decode('utf-8')
pattern=r'(?m)^[ \t]*(?:export[ \t]+)?ACCOUNT_OPERATIONS_ENABLED[ \t]*=.*(?:\r?\n|$)'
updated=re.sub(pattern,'',text)
if updated and not updated.endswith('\n'):updated+='\n'
updated+='ACCOUNT_OPERATIONS_ENABLED='+value+'\n'
mode=target.stat()
fd,name=tempfile.mkstemp(prefix='.operations-env-',dir=str(target.parent))
try:
 with os.fdopen(fd,'wb') as stream:stream.write(updated.encode('utf-8'))
 os.chmod(name,mode.st_mode)
 if hasattr(os,'chown'):os.chown(name,mode.st_uid,mode.st_gid)
 os.replace(name,target)
finally:
 if os.path.exists(name):os.unlink(name)
