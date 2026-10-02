"""Build and validate the offline package on Windows. Never connects to the server."""
import ast, hashlib, importlib.util, io, json, os, shutil, sqlite3, subprocess, sys, tarfile, tempfile, types
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
SRC=Path(__file__).resolve().parent
CACHE=ROOT/'.cache/roundcube'
ARCHIVE=CACHE/'roundcubemail-1.7.4-complete.tar.gz'
sys.modules.setdefault('pwd', types.ModuleType('pwd'))
spec=importlib.util.spec_from_file_location('roundcube_install',SRC/'install.py')
mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
assert hashlib.sha256(ARCHIVE.read_bytes()).hexdigest()==mod.SHA
ast.parse((SRC/'install.py').read_text())
fixture=Path(tempfile.mkdtemp(prefix='verify-',dir=CACHE))
app=fixture/'app'
mod.extract(ARCHIVE,app)
assert (app/'vendor/autoload.php').is_file()
db=sqlite3.connect(fixture/'test.sqlite')
db.executescript((app/'SQL/sqlite.initial.sql').read_text())
assert db.execute('pragma integrity_check').fetchone()[0]=='ok'
assert db.execute("select value from system where name='roundcube-version'").fetchone()[0]=='2025092300'
db.close()
for member_name,member_type in [('roundcubemail-1.7.4/../../bad',tarfile.REGTYPE),('roundcubemail-1.7.4/link',tarfile.SYMTYPE)]:
 bad=fixture/'bad.tar'
 with tarfile.open(bad,'w') as t:
  m=tarfile.TarInfo(member_name); m.type=member_type; m.linkname='/etc/passwd'; t.addfile(m)
 try: mod.extract(bad,fixture/'unsafe')
 except RuntimeError: pass
 else: raise AssertionError('unsafe archive accepted')
assert not (fixture/'unsafe').exists()
nginx=ROOT/'.cache/nginx-test/nginx-1.28.0'
openssl=Path('C:/Program Files/Git/usr/bin/openssl.exe')
subprocess.run([str(openssl),'req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(fixture/'key.pem'),'-out',str(fixture/'cert.pem'),'-days','1','-subj','/CN=localhost'],check=True,capture_output=True)
config=mod.nginx_config()
# Platform-only substitutions. Production locations, directives and routing unchanged.
config=config.replace(str(mod.CERT)+'/fullchain.pem',(fixture/'cert.pem').as_posix())
config=config.replace(str(mod.CERT)+'/privkey.pem',(fixture/'key.pem').as_posix())
config=config.replace(str(mod.APP)+'/public_html',(app/'public_html').as_posix())
config=config.replace(str(mod.BASE),fixture.as_posix())
config=config.replace('/www/server/nginx/conf/fastcgi_params',(nginx/'conf/fastcgi_params').as_posix())
config=config.replace('/www/wwwlogs/'+mod.HOST+'.error.log',(fixture/'error.log').as_posix())
config=config.replace('unix:/tmp/php-cgi-82.sock','127.0.0.1:9000')
import re
config=re.sub(r'(\b(?:ssl_certificate|ssl_certificate_key|root|include|error_log) )([^;]+);',lambda m:m[1]+'"'+m[2]+'";',config)
config=config.replace('listen 80;', 'listen 18080;').replace('listen 443 ssl;', 'listen 18443 ssl;')
(fixture/'nginx.conf').write_bytes(('error_log "'+(fixture/'main.log').as_posix()+'";\npid "'+(fixture/'nginx.pid').as_posix()+'";\nevents {}\nhttp {\n'+config+'\n}\n').encode())
result=subprocess.run([str(nginx/'nginx.exe'),'-p',nginx.as_posix()+'/', '-c',(fixture/'nginx.conf').as_posix(),'-t'],capture_output=True,text=True)
assert result.returncode==0,result.stdout+result.stderr
print(result.stderr.strip())
name='roundcube-webmail-1.7.4-offline'
stage=fixture/name;stage.mkdir()
for f in ['install.py','run.sh','README.md']:
 data=(SRC/f).read_bytes()
 assert b'\r' not in data, f+' must use LF'
 (stage/f).write_bytes(data)
shutil.copyfile(ARCHIVE,stage/ARCHIVE.name)
manifest={'application':'Roundcube','version':mod.VERSION,'target':mod.HOST,'server':'107.174.123.42','upstream_sha256':mod.SHA,'scope':['new webmail application and SQLite','target webmail vhost only','Nginx config test and reload'],'local_checks':['upstream checksum','safe extraction and traversal/link rejection','SQLite schema/integrity','Nginx configuration syntax with Windows path/socket substitutions','LF scripts and package hashes'],'pending':['server PHP/FPM and mail TLS checks','webmail HTTPS smoke checks','real mailbox login and send/reply acceptance']}
(stage/'manifest.json').write_bytes((json.dumps(manifest,indent=2)+'\n').encode())
sums=''.join(hashlib.sha256(f.read_bytes()).hexdigest()+'  '+f.name+'\n' for f in sorted(stage.iterdir()))
(stage/'SHA256SUMS').write_bytes(sums.encode())
out=CACHE/(name+'.tar.gz')
with tarfile.open(out,'w:gz') as t:
 for f in sorted(stage.iterdir()):
  info=t.gettarinfo(str(f),name+'/'+f.name)
  info.uid=info.gid=0;info.uname=info.gname='root'
  info.mode=0o755 if f.suffix=='.sh' else 0o644
  with f.open('rb') as stream:t.addfile(info,stream)
with tarfile.open(out) as t:
 for line in sums.splitlines():
  digest,filename=line.split('  ',1)
  data=t.extractfile(name+'/'+filename).read()
  assert hashlib.sha256(data).hexdigest()==digest
 assert b'\r' not in t.extractfile(name+'/SHA256SUMS').read()
digest=hashlib.sha256(out.read_bytes()).hexdigest()
sidecar=out.with_name(out.name+'.sha256')
sidecar.write_bytes((digest+'  '+out.name+'\n').encode())
assert sidecar.read_bytes().endswith(b'\n') and b'\r' not in sidecar.read_bytes()
print('PASS: extraction, archive rejection, SQLite, Nginx, LF, all package hashes')
print('PACKAGE:',out)
print('SHA256:',digest)
