from pathlib import Path
import hashlib, tarfile, io, json
ROOT=Path(__file__).resolve().parent.parent
SOURCES=[
'server/src/index.js','server/src/jobs/electricityScheduler.js',
'server/src/lib/electricityContext.js','server/src/lib/electricityCredentials.js','server/src/lib/electricityUpstreamQueue.js',
'server/src/lib/electricity.js','server/src/lib/electricityRssToken.js','server/src/lib/electricitySchedule.js','server/src/lib/electricityMailer.js','server/src/lib/electricityReport.js',
'server/src/repositories/electricityRoomRepository.js','server/src/repositories/electricityRepository.js','server/src/repositories/electricityReportRepository.js','server/src/repositories/electricityDailyUsageRepository.js',
'server/src/services/electricityMonitor.js','server/src/services/electricityHistorySync.js',
'server/src/middleware/electricityRoom.js','server/src/routes/adminElectricityRooms.js','server/src/routes/adminElectricity.js','server/src/routes/electricity.js','server/src/routes/electricityRss.js',
'server/scripts/ensure-electricity-key.js','server/scripts/backup-electricity-rooms.js','server/scripts/migrate-electricity-room.js','server/scripts/sync-electricity-history.js',
'server/database/migrations/202609090001_electricity_rooms.sql',
'src/app/components/AdminElectricityRooms.tsx','src/app/components/ElectricityRssSubscription.tsx','src/app/pages/AdminElectricityPage.tsx','src/app/pages/ElectricityPage.tsx','src/app/pages/LoginPage.tsx','src/styles/electricity.css']
entries={name:(ROOT/name).read_bytes() for name in SOURCES}
assert (ROOT/'dist/index.html').is_file()
for file in sorted((ROOT/'dist').rglob('*')):
 if file.is_file():entries[file.relative_to(ROOT).as_posix()]=file.read_bytes()
entries['deploy-electricity-rooms.sh']=(ROOT/'scripts/deploy-electricity-rooms.sh').read_bytes().replace(b'\r\n',b'\n')
entries['ELECTRICITY-ROOMS.md']=(ROOT/'ELECTRICITY-ROOMS.md').read_bytes()
entries['SOURCE-FILES.txt']=('\n'.join(SOURCES)+'\n').encode()
entries['SHA256SUMS']=''.join(f'{hashlib.sha256(data).hexdigest()}  {name}\n' for name,data in sorted(entries.items())).encode()
output=ROOT/'.cache/mooncci-electricity-rooms-20260909-v1.tar.gz'
with tarfile.open(output,'w:gz') as archive:
 for name,data in entries.items():
  info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o755 if name.endswith('.sh') else 0o644
  archive.addfile(info,io.BytesIO(data))
with tarfile.open(output) as archive:
 for name,data in entries.items():assert archive.extractfile(name).read()==data
print(json.dumps({'package':str(output),'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'bytes':output.stat().st_size}))
