$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$candidates = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$browser = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $browser) { throw 'Edge or Chrome was not found.' }
$profile = Join-Path $projectRoot '.cache\us-gateway-browser'
$arguments = @(
  ('--user-data-dir="' + $profile + '"'),
  '--host-resolver-rules="MAP mooncci.site 107.174.123.42, EXCLUDE localhost"',
  '--no-proxy-server', '--disable-quic', '--no-first-run', '--new-window',
  'https://mooncci.site/'
)
Start-Process -FilePath $browser -ArgumentList $arguments
Write-Host 'US gateway preview browser opened. Only this profile is pinned; public DNS is unchanged.'
Write-Host 'Close all windows of this preview profile when finished. Never bypass certificate warnings.'
