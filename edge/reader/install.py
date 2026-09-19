#!/usr/bin/env python3
"""First install only; fixed, isolated paths. Never edits BaoTa, databases or existing services."""
import hashlib,json,os,pathlib,re,secrets,shutil,socket,subprocess,sys,tempfile,time,urllib.request
ROOT=pathlib.Path('/opt/mooncci-reader')
ENV=pathlib.Path('/etc/mooncci-reader.env')
UNIT=pathlib.Path('/etc/systemd/system/mooncci-reader.service')
NODE=pathlib.Path('/www/server/nodejs/v22.23.1/bin/node')

def run(args,**kwargs):return subprocess.run(args,check=True,**kwargs)
def check_package(package):
    sums={}
    for line in (package/'SHA256SUMS').read_text().splitlines():
        sha,name=line.split('  ',1);rel=pathlib.PurePosixPath(name)
        if not re.fullmatch('[a-f0-9]{64}',sha) or rel.is_absolute() or '..' in rel.parts or '\\' in name or name in sums:raise ValueError('Invalid checksum manifest')
        file=package.joinpath(*rel.parts)
        if file.is_symlink() or not file.is_file() or not file.resolve().is_relative_to(package.resolve()):raise ValueError('Unsafe package member')
        if hashlib.sha256(file.read_bytes()).hexdigest()!=sha:raise ValueError('Package checksum mismatch: '+name)
        sums[name]=sha
    for file in package.rglob('*'):
        if file.is_symlink():raise ValueError('Symlink in package')
        if file.is_file() and file.relative_to(package).as_posix() not in {*sums,'SHA256SUMS'}:raise ValueError('Unlisted package file')
    revision=(package/'REVISION').read_text().strip()
    if not re.fullmatch('[a-f0-9]{40}',revision):raise ValueError('Invalid revision')
    return revision

def failed_install_matches(root,baseline):
    # Recovery is limited to the exact known failed first-install tree, never a working node.
    if root.is_symlink() or not root.is_dir() or (root/'INSTALL.json').exists():return False
    marker=root/'INSTALL_FAILED'
    if marker.is_symlink() or not marker.is_file() or marker.read_text()!='Inspect this isolated directory before retry.\n':return False
    release=root/'releases'/baseline['revision']
    current=root/'current'
    if not current.is_symlink() or current.resolve()!=release.resolve():return False
    expected={'INSTALL_FAILED','current'}
    for name,sha in baseline['files'].items():
        file=release/name
        if file.is_symlink() or not file.is_file() or hashlib.sha256(file.read_bytes()).hexdigest()!=sha:return False
        expected.add(file.relative_to(root).as_posix())
    for item in root.rglob('*'):
        if (item.is_symlink() or item.is_file()) and item.relative_to(root).as_posix() not in expected:return False
    return True

def main(package):
    if os.geteuid()!=0:raise ValueError('Root required')
    import fcntl,pwd
    with open('/run/mooncci-reader-install.lock','w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        revision=check_package(package)
        if ENV.exists() or ENV.is_symlink() or UNIT.exists() or UNIT.is_symlink():raise ValueError('Existing configuration detected; refusing overwrite')
        recover=False
        if ROOT.exists() or ROOT.is_symlink():
            baseline=json.loads((package/'edge/reader/failed-install-baseline.json').read_text())
            if not failed_install_matches(ROOT,baseline):raise ValueError('Unknown existing installation; refusing overwrite')
            recover=True
        loaded=subprocess.check_output(['systemctl','show','mooncci-reader.service','--property=LoadState','--value'],text=True).strip()
        if loaded!='not-found':raise ValueError('A reader unit already exists; refusing replacement')
        try:pwd.getpwnam('mooncci-reader')
        except KeyError:pass
        else:raise ValueError('Existing reader account; inspect before reuse')
        if not NODE.is_file():raise ValueError('Expected BaoTa Node runtime not found')
        version=subprocess.check_output([str(NODE),'--version'],text=True).strip()
        if version!='v22.23.1':raise ValueError('Unexpected runtime; inspect before install')
        with socket.socket() as sock:sock.bind(('127.0.0.1',3102))
        run([str(NODE),'--test',str(package/'test/read-router.test.cjs')],cwd=package)
        if recover:
            # Same filesystem rename preserves all failed files; no recursive deletion.
            saved=ROOT.with_name(ROOT.name+'-failed-'+str(time.time_ns()))
            if saved.exists():raise ValueError('Recovery backup collision')
            ROOT.rename(saved)
            print('Preserved verified failed installation: '+str(saved),flush=True)
        print('Preflight passed; installing isolated reader only.',flush=True)
        user_created=False;root_created=False;unit_created=False;env_created=False
        try:
            run(['useradd','--system','--user-group','--no-create-home','--shell','/usr/sbin/nologin','mooncci-reader']);user_created=True
            release=ROOT/'releases'/revision;release.mkdir(parents=True,mode=0o755);root_created=True
            for part in ['edge','dist']:
                shutil.copytree(package/part,release/part)
            for marker in ['REVISION','FRONTEND_REVISION']:shutil.copy2(package/marker,release/marker)
            for item in ROOT.rglob('*'):
                item.chmod(0o755 if item.is_dir() else 0o644)
            ROOT.chmod(0o755);(ROOT/'current').symlink_to(release,target_is_directory=True)
            key=secrets.token_hex(32)
            with ENV.open('x') as file:
                env_created=True
                os.chmod(ENV,0o600)
                file.write('PRIMARY_ORIGIN=https://origin-cn.mooncci.site\nREADER_KEY='+key+'\nREADER_DIST=/opt/mooncci-reader/current/dist\nREADER_PORT=3102\n')
            with UNIT.open('x') as file:
                unit_created=True;file.write((package/'edge/reader/mooncci-reader.service').read_text())
            UNIT.chmod(0o644)
            run(['systemctl','daemon-reload']);run(['systemctl','enable','--now','mooncci-reader.service'])
            for attempt in range(30):
                try:
                    request=urllib.request.Request('http://127.0.0.1:3102/_reader/health',headers={'X-Mooncci-Reader-Key':key})
                    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(request,timeout=2) as response:
                        if response.status==200 and response.read()==b'ok':break
                except Exception:pass
                time.sleep(1)
            else:raise RuntimeError('Reader local health check failed')
            (ROOT/'INSTALL.json').write_text(json.dumps({'revision':revision,'runtime':version,'listen':'127.0.0.1:3102','scope':'reader-only','publicRoutingEnabled':False},indent=2)+'\n')
            print('Reader local installation complete. Public routing remains OFF.')
            print('Origin DNS/TLS, new BaoTa virtual host, Worker secrets and preview tests are still required.')
            print('Existing cuegroveapp.com, mail, MySQL and PM2 were not changed.')
        except BaseException:
            # Remove only files/accounts created by this invocation; retain failed release for diagnosis.
            if unit_created:
                subprocess.run(['journalctl','-u','mooncci-reader.service','-n','40','--no-pager'],check=False)
                subprocess.run(['systemctl','disable','--now','mooncci-reader.service'],check=False)
                UNIT.unlink();subprocess.run(['systemctl','daemon-reload'],check=False)
            if env_created:ENV.unlink()
            if root_created:(ROOT/'INSTALL_FAILED').write_text('Inspect this isolated directory before retry.\n')
            if user_created:subprocess.run(['userdel','mooncci-reader'],check=False)
            raise

if __name__=='__main__':
    os.umask(0o077)
    try:main(pathlib.Path(__file__).resolve().parents[2])
    except Exception as error:
        print('Reader installation stopped: '+str(error),file=sys.stderr);sys.exit(1)
