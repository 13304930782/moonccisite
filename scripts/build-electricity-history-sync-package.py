from pathlib import Path
import hashlib, tarfile, io, json
ROOT = Path(__file__).resolve().parent.parent
SOURCES = ['server/src/jobs/electricityScheduler.js', 'server/src/repositories/electricityDailyUsageRepository.js',
 'server/src/services/electricityHistorySync.js', 'server/scripts/sync-electricity-history.js',
 'server/src/services/electricityMonitor.js', 'server/src/routes/adminElectricity.js',
 'src/app/pages/AdminElectricityPage.tsx', 'src/styles/electricity.css',
 'server/src/lib/electricitySchedule.js', 'server/src/repositories/electricityRepository.js']
entries = {name: (ROOT / name).read_bytes() for name in SOURCES}
assert (ROOT / 'dist/index.html').is_file(), 'Build the frontend first'
for file in sorted((ROOT / 'dist').rglob('*')):
 if file.is_file(): entries[file.relative_to(ROOT).as_posix()] = file.read_bytes()
entries['deploy-electricity-history-sync.sh'] = (ROOT / 'scripts/deploy-electricity-history-sync.sh').read_bytes().replace(b'\r\n', b'\n')
entries['ELECTRICITY-HISTORY-SYNC.md'] = (ROOT / 'ELECTRICITY-HISTORY-SYNC.md').read_bytes()
entries['SOURCE-FILES.txt'] = ('\n'.join(SOURCES)+'\n').encode()
entries['SHA256SUMS'] = ''.join(f'{hashlib.sha256(data).hexdigest()}  {name}\n' for name,data in sorted(entries.items())).encode()
output = ROOT / '.cache/mooncci-electricity-history-sync-20260909-v5.tar.gz'
with tarfile.open(output, 'w:gz') as archive:
 for name,data in entries.items():
  info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o755 if name.endswith('.sh') else 0o644
  archive.addfile(info,io.BytesIO(data))
with tarfile.open(output) as archive:
 for name,data in entries.items(): assert archive.extractfile(name).read()==data
print(json.dumps({'package':str(output),'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'bytes':output.stat().st_size}))
