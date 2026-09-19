param([string]$Server = 'root@107.174.123.42')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$release = Get-Content -LiteralPath (Join-Path $projectRoot '.cache/reader-node-release.json') -Raw | ConvertFrom-Json
$packagePath = $release.package
$packageName = Split-Path $packagePath -Leaf
if ($packageName -notmatch '^mooncci-reader-preview-[0-9a-f]{12}\.tar\.gz$') { throw 'Invalid release filename' }
$checksumPath = "$packagePath.sha256"
if ((Get-FileHash -LiteralPath $packagePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $release.sha256) { throw 'Package checksum mismatch' }
$checksumText = [IO.File]::ReadAllText($checksumPath)
if ($checksumText.Contains("`r") -or $checksumText -ne "$($release.sha256)  $packageName`n") { throw 'Invalid checksum file or CRLF detected' }
& scp -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 $packagePath $checksumPath "${Server}:/root/"
if ($LASTEXITCODE -ne 0) { throw 'Upload failed; do not deploy the partial file' }
$directoryName = $packageName -replace '\.tar\.gz$', ''
Write-Host 'Upload complete. Run these commands in the server SSH window:'
Write-Host @"
bash <<'BASH'
set -eu
cd /root
sha256sum --strict -c $packageName.sha256
mkdir -p /www/backup/$directoryName
tar -xzf $packageName -C /www/backup/$directoryName
python3 -c 'import sys; assert sys.version_info >= (3, 9), "Python 3.9+ required"'
nohup python3 /www/backup/$directoryName/edge/reader/install.py > /www/backup/$directoryName.log 2>&1 < /dev/null &
echo "Background deployment started"
BASH
tail -n 40 /www/backup/$directoryName.log
"@

Write-Host 'Reader logs (run on the US server):'
Write-Host 'journalctl -u mooncci-reader.service -n 60 --no-pager'
Write-Host 'Disable reader only: systemctl disable --now mooncci-reader.service'
