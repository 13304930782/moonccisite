from pathlib import Path
import hashlib,json,tarfile,io
root=Path(__file__).resolve().parent
out=root.parents[1]/"outputs"/"login-relay";out.mkdir(parents=True,exist_ok=True)
names=["server.mjs","github-worker.mjs","google-cache.mjs","install.py","export-key.cjs","probe-cn.py","README.md","DEPLOY.zh-CN.md"]
data={name:(root/name).read_bytes() for name in names}
for name,body in data.items():
    assert b"\r" not in body,name
manifest=json.dumps({n:hashlib.sha256(b).hexdigest() for n,b in data.items()},indent=2).encode()+b"\n"
data["manifest.json"]=manifest
archive=out/"mooncci-login-relay.tar.gz"
with tarfile.open(archive,"w:gz") as tar:
    for name,body in data.items():
        info=tarfile.TarInfo("mooncci-login-relay/"+name)
        info.size=len(body);info.mode=0o644;info.mtime=0
        tar.addfile(info,io.BytesIO(body))
with tarfile.open(archive) as tar:
    assert len(tar.getmembers())==len(data)
    for name,body in data.items():assert tar.extractfile("mooncci-login-relay/"+name).read()==body
checksum=hashlib.sha256(archive.read_bytes()).hexdigest()
archive.with_suffix(".gz.sha256").write_bytes((checksum+"  "+archive.name+"\n").encode())
print("PASS: archive content, LF and SHA256 verified:",archive)
