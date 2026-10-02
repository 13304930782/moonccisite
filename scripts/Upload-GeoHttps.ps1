param([Parameter(Mandatory=$true)][ValidateSet('CN','US')][string]$Region)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$release = Get-Content -Raw -LiteralPath (Join-Path $projectRoot '.cache/geo-https-release.json') | ConvertFrom-Json
$package = $release.package
$name = Split-Path $package -Leaf
if ($name -notmatch '^mooncci-geo-https-[0-9a-f]{12}\.tar\.gz$') { throw 'Invalid package name' }
if ((Get-FileHash -LiteralPath $package -Algorithm SHA256).Hash.ToLowerInvariant() -ne $release.sha256) { throw 'Checksum mismatch' }
if ([IO.File]::ReadAllText("$package.sha256") -ne "$($release.sha256)  $name`n") { throw 'Invalid checksum sidecar' }
$target = if ($Region -eq 'CN') { 'root@182.92.179.81' } else { 'root@107.174.123.42' }
& scp -o ConnectTimeout=20 $package "$package.sha256" "${target}:/root/"
if ($LASTEXITCODE -ne 0) { throw 'Upload failed; do not deploy' }
Write-Host "Uploaded to $target. Paste the following block into THAT server SSH terminal:"
$instructions = @"
bash <<'BASH'
set -eu
cd /root
sha256sum --strict -c $name.sha256
mkdir -p /www/backup
work_dir=`$(mktemp -d /www/backup/mooncci-geo-package-XXXXXX)
tar -xzf $name -C "`$work_dir"
nohup python3 "`$work_dir/install.py" --region $Region > /www/backup/mooncci-geo-$Region.log 2>&1 < /dev/null &
echo 'Deployment started; inspect the log below.'
BASH
tail -n 40 /www/backup/mooncci-geo-$Region.log
"@
Write-Host $instructions
