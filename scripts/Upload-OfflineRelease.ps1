param([string]$Server = 'root@182.92.179.81')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$release = Get-Content -LiteralPath (Join-Path $projectRoot '.cache/offline-release.json') -Raw | ConvertFrom-Json
$packagePath = $release.package
$packageName = Split-Path $packagePath -Leaf
if ($packageName -notmatch '^mooncci-(frontend|admin-lists|social-login)-[0-9a-f]{12}\.tar\.gz$') { throw 'Invalid release filename' }
$checksumPath = "$packagePath.sha256"
if ((Get-FileHash -LiteralPath $packagePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $release.sha256) { throw 'Package checksum mismatch' }
$checksumText = [IO.File]::ReadAllText($checksumPath)
if ($checksumText.Contains("`r") -or $checksumText -ne "$($release.sha256)  $packageName`n") { throw 'Invalid checksum file or CRLF detected' }
& scp -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 $packagePath $checksumPath "${Server}:/www/backup/"
if ($LASTEXITCODE -ne 0) { throw 'Upload failed; do not deploy the partial file' }
$directoryName = $packageName -replace '\.tar\.gz$', ''
Write-Host 'Upload complete. Run these commands in the server SSH window:'
Write-Host @"
set +e
bash <<'BASH'
set -eu
cd /www/backup
sha256sum --strict -c $packageName.sha256
mkdir -p $directoryName
tar -xzf $packageName -C $directoryName
nohup bash /www/backup/$directoryName/deploy.sh > /www/backup/$directoryName.log 2>&1 < /dev/null &
echo "Background deployment started"
BASH
tail -n 40 /www/backup/$directoryName.log
"@
Write-Host 'After the deployment log reports exit code 0, run this read-only live check:'
Write-Host @"
/opt/mooncci-node-v24.20.0/bin/node /www/backup/$directoryName/verify-live.mjs https://mooncci.site
"@
