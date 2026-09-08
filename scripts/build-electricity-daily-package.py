"""Build the electricity RSS deployment bundle with explicit LF metadata on Windows."""
from pathlib import Path
import hashlib
import json
import tarfile
import io

ROOT = Path(__file__).resolve().parent.parent
NAME = 'mooncci-electricity-daily-20260907'
SOURCES = [
    'server/src/jobs/electricityScheduler.js', 'server/src/lib/electricitySchedule.js',
    'server/src/lib/electricity.js', 'server/src/lib/electricityDailyUsage.js',
    'server/src/lib/electricityMailer.js', 'server/src/lib/electricityReport.js',
    'server/src/repositories/electricityRepository.js', 'server/src/repositories/electricityDailyUsageRepository.js',
    'server/src/services/electricityMonitor.js', 'server/src/services/electricityHistorySync.js', 'server/scripts/sync-electricity-history.js', 'server/scripts/check-electricity-daily-source.js',
    'server/database/migrations/202609070001_create_electricity_daily_usage.sql',
    'server/database/schema.sql', 'server/test/electricityDailyUsage.test.js',
    'server/test/electricityRss.test.js', 'server/test/electricityRss.integration.test.js',
    'server/test/electricitySchedule.test.js', 'ELECTRICITY-DAILY-USAGE.md', 'DEPLOY.md',
] + [p.relative_to(ROOT).as_posix() for p in sorted((ROOT / 'src').rglob('*')) if p.is_file()]


def main():
    entries = {name: (ROOT / name).read_bytes() for name in SOURCES}
    assert (ROOT / 'dist/index.html').is_file(), 'Build the frontend first'
    for file in sorted((ROOT / 'dist').rglob('*')):
        if file.is_file():
            entries[file.relative_to(ROOT).as_posix()] = file.read_bytes()
    # Do not normalize source or SQL bytes: applied migration checksums must be stable.
    entries['deploy-electricity-daily.sh'] = (ROOT / 'scripts/deploy-electricity-daily.sh').read_bytes().replace(b'\r\n', b'\n')
    entries['SOURCE-FILES.txt'] = ('\n'.join(SOURCES) + '\n').encode('utf-8')
    entries['SHA256SUMS'] = ''.join(
        f'{hashlib.sha256(data).hexdigest()}  {name}\n'
        for name, data in sorted(entries.items())
    ).encode('utf-8')
    for name in ['deploy-electricity-daily.sh', 'SOURCE-FILES.txt', 'SHA256SUMS']:
        assert b'\r\n' not in entries[name]
    output = ROOT / '.cache' / f'{NAME}.tar.gz'
    output.parent.mkdir(exist_ok=True)
    with tarfile.open(output, 'w:gz') as archive:
        for name, data in sorted(entries.items()):
            assert not name.startswith('/') and '..' not in Path(name).parts
            assert '.env' not in name and 'node_modules' not in name
            info = tarfile.TarInfo(name)
            info.size = len(data)
            info.mode = 0o755 if name.endswith('.sh') else 0o644
            archive.addfile(info, io.BytesIO(data))
    with tarfile.open(output) as archive:
        for name, data in entries.items():
            assert archive.extractfile(name).read() == data
    result = {'package': str(output), 'bytes': output.stat().st_size,
              'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'files': len(entries)}
    (ROOT / '.cache/electricity-daily-package.json').write_bytes(json.dumps(result, indent=2).encode('utf-8'))
    print(json.dumps(result))

if __name__ == '__main__':
    main()
