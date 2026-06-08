param(
  [string]$BunExe = "C:\Users\sanar\.bun\bin\bun.exe"
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host "=== Trusten local Windows build ===" -ForegroundColor Cyan

$bundleDir = "dist\prod\server\.tmp\bundle"
$binDir    = "dist\prod\server\.tmp\binaries"
$outExe    = "$binDir\browseros_server.exe"
$deploySrc = "C:\Users\sanar\AppData\Local\Chromium\User Data\.browseros\versions\0.0.82\resources\bin"
$deployApp = "C:\Users\sanar\AppData\Local\Chromium\Application\0.0.82\resources\bin"

New-Item -ItemType Directory -Force -Path $bundleDir | Out-Null
New-Item -ItemType Directory -Force -Path $binDir    | Out-Null

Write-Host "Step 1/3 - Bundling server..." -ForegroundColor Yellow
& $BunExe build apps/server/src/index.ts `
  "--outdir=$bundleDir" `
  "--target=bun" `
  "--minify" `
  "--define=process.env.BROWSEROS_CONFIG_URL=`"https://llm.browseros.com/api/browseros-server/config`"" `
  "--define=process.env.NODE_ENV=`"bundled`"" `
  "--define=process.env.LOG_LEVEL=`"info`"" `
  "--define=__BROWSEROS_VERSION__=`"0.0.82`"" `
  "--external=node-pty"

if ($LASTEXITCODE -ne 0) { throw "Bundle failed" }
Write-Host "Bundle OK" -ForegroundColor Green

Write-Host "Step 2/3 - Compiling native exe..." -ForegroundColor Yellow
& $BunExe build --compile "$bundleDir\index.js" `
  "--outfile=$outExe" `
  "--external=node-pty"

if ($LASTEXITCODE -ne 0) { throw "Compile failed" }
$sizeBytes = (Get-Item $outExe).Length
$sizeMB = [math]::Round($sizeBytes / 1048576, 1)
Write-Host "Compiled: $outExe ($sizeMB MB)" -ForegroundColor Green

Write-Host "Step 3/3 - Deploying to BrowserOS..." -ForegroundColor Yellow
foreach ($dest in @($deploySrc, $deployApp)) {
  if (Test-Path $dest) {
    $target = "$dest\browseros_server.exe"
    $backup = "$dest\browseros_server.exe.bak"
    if (Test-Path $target) {
      Write-Host "Backing up $target"
      Move-Item -Force $target $backup
    }
    Copy-Item -Force $outExe $target
    Write-Host "Deployed -> $target" -ForegroundColor Green
  } else {
    Write-Host "Skipping (not found): $dest" -ForegroundColor DarkYellow
  }
}

Write-Host "Build + deploy complete! Restart BrowserOS to apply." -ForegroundColor Cyan
