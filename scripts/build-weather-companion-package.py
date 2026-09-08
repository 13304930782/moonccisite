"""Build a pinned, checksum-verified weather companion bundle; exclude credentials."""
from pathlib import Path
import hashlib
import io
import json
import tarfile

ROOT = Path(__file__).resolve().parent.parent
NAME = 'mooncci-weather-companion-20260908-v11'
SOURCES = [
    'src/app/components/admin/AdminShell.tsx', 'src/styles/editorial.css', 'src/app/components/AuthShell.tsx', 'src/app/components/AuthShell.css',
    'server/src/lib/weatherBudget.js', 'server/src/repositories/weatherProtectionRepository.js', 'server/src/middleware/weatherClientLimit.js',
    'server/src/lib/weatherSource.js', 'server/src/lib/weatherRegional.js',
    'src/app/lib/companionInteraction.ts',
    'server/src/routes/companionInteractions.js', 'server/src/repositories/companionInteractionRepository.js',
    'server/database/migrations/202609080001_create_companion_interactions.sql',
    'src/app/App.tsx', 'src/app/pages/AdminSiteSettingsPage.tsx',
    'src/app/components/WeatherCompanion.tsx', 'src/app/components/AdminWeatherCompanionSettings.tsx',
    'src/styles/weather-companion.css', 'src/app/components/WeatherCityPicker.tsx', 'src/app/lib/weatherLocation.ts',
    'src/app/pages/ElectricityPage.tsx', 'src/styles/electricity.css',
    'src/app/components/ChartViewport.tsx', 'src/app/lib/observeChartSize.ts',
    'src/vendor/grok-ball/grok-ball.js', 'src/vendor/grok-ball/grok-ball.ts',
    'src/vendor/grok-ball/LICENSE', 'src/vendor/grok-ball/UPSTREAM.md', 'public/licenses/grok-ball.txt',
    'server/src/lib/weatherAmap.js', 'server/src/lib/weatherGeocoder.js',
    'server/src/vendor/coordtransform/index.js', 'server/src/vendor/coordtransform/LICENSE', 'server/src/vendor/coordtransform/UPSTREAM.md',
    'server/src/lib/weatherReverseGeocode.js', 'server/src/lib/weatherLocation.js', 'server/src/lib/weatherMood.js', 'server/src/routes/weatherMood.js',
    'server/src/repositories/weatherMoodRepository.js', 'server/src/services/weatherMood.js',
]

def main():
    entries = {name: (ROOT / name).read_bytes() for name in SOURCES}
    assert (ROOT / 'dist/index.html').is_file(), 'Run npm run build first'
    assert list((ROOT / 'dist/assets').glob('WeatherCompanion-*.js')), 'Weather companion build missing'
    for file in sorted((ROOT / 'dist').rglob('*')):
        if file.is_file(): entries[file.relative_to(ROOT).as_posix()] = file.read_bytes()
    entries['deploy-weather-companion.sh'] = (ROOT / 'scripts/deploy-weather-companion.sh').read_bytes().replace(b'\r\n', b'\n')
    for name in ['configure-weather-amap.sh', 'configure-weather-amap.cjs', 'check-weather-source.cjs']:
        entries[name] = (ROOT / 'scripts' / name).read_bytes().replace(b'\r\n', b'\n')
    entries['WEATHER-COMPANION.md'] = (ROOT / 'WEATHER-COMPANION.md').read_bytes()
    entries['SOURCE-FILES.txt'] = ('\n'.join(SOURCES) + '\n').encode()
    entries['SHA256SUMS'] = ''.join(f'{hashlib.sha256(data).hexdigest()}  {name}\n' for name, data in sorted(entries.items())).encode()
    output = ROOT / '.cache' / f'{NAME}.tar.gz'
    with tarfile.open(output, 'w:gz') as archive:
        for name, data in sorted(entries.items()):
            assert not name.startswith('/') and '..' not in Path(name).parts
            assert '.env' not in name and 'node_modules' not in name
            info = tarfile.TarInfo(name); info.size = len(data)
            info.mode = 0o755 if name.endswith('.sh') else 0o644
            archive.addfile(info, io.BytesIO(data))
    with tarfile.open(output) as archive:
        for name, data in entries.items(): assert archive.extractfile(name).read() == data
    result = dict(package=str(output), bytes=output.stat().st_size, sha256=hashlib.sha256(output.read_bytes()).hexdigest(), files=len(entries))
    (ROOT / '.cache/weather-companion-package.json').write_bytes(json.dumps(result, indent=2).encode())
    print(json.dumps(result))

if __name__ == '__main__': main()
