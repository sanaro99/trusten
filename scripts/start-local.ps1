[CmdletBinding()]
param(
  [int]$BackendPort = 9200,
  [int]$FrontendPort = 5173,
  [int]$DatabasePort = 5433,
  [switch]$SkipDatabase
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$logsDirectory = Join-Path $repoRoot '.trusten-local'
$databaseContainer = 'trusten-local-postgres'
$databaseUrl = "postgresql://trusten:trusten@localhost:$DatabasePort/trusten"

function Stop-Listeners {
  param([int[]]$Ports)

  foreach ($port in $Ports) {
    $listeners = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique

    foreach ($processId in $listeners) {
      $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
      if ($null -ne $process) {
        Write-Host "Stopping $($process.ProcessName) (PID $processId) on port $port..." -ForegroundColor Yellow
        Stop-Process -Id $processId -Force
      }
    }
  }
}

function Wait-ForHttpOk {
  param([string]$Url, [string]$Service)

  if (-not ('System.Net.Http.HttpClient' -as [type])) {
    Add-Type -AssemblyName System.Net.Http
  }
  $handler = [System.Net.Http.HttpClientHandler]::new()
  $handler.UseProxy = $false
  $client = [System.Net.Http.HttpClient]::new($handler)
  $client.Timeout = [TimeSpan]::FromSeconds(2)
  $lastFailure = 'No response received.'

  try {
    for ($attempt = 1; $attempt -le 30; $attempt++) {
      try {
        $response = $client.GetAsync($Url).GetAwaiter().GetResult()
        if ($response.IsSuccessStatusCode) { return }
        $lastFailure = "HTTP $([int]$response.StatusCode) $($response.ReasonPhrase)"
      } catch {
        $lastFailure = $_.Exception.Message
      }
      Start-Sleep -Seconds 1
    }
  } finally {
    $client.Dispose()
    $handler.Dispose()
  }

  throw "$Service did not become ready at $Url. Last probe failure: $lastFailure. See $logsDirectory."
}

Set-Location $repoRoot

$bun = Get-Command bun -ErrorAction SilentlyContinue
if ($null -eq $bun) {
  throw 'Bun 1.4 or later is required. Install it from https://bun.sh/ and run this script again.'
}

if (-not (Test-Path (Join-Path $repoRoot 'node_modules'))) {
  Write-Host 'Installing locked dependencies...' -ForegroundColor Cyan
  & $bun.Source install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { throw 'bun install failed.' }
}

New-Item -ItemType Directory -Force -Path $logsDirectory | Out-Null

# These are the local API and Vite ports owned by this launcher. Any stale
# listener on either port would otherwise make Bun/Vite choose a different port.
Stop-Listeners -Ports @($BackendPort, $FrontendPort)

if (-not $SkipDatabase) {
  $docker = Get-Command docker -ErrorAction SilentlyContinue
  if ($null -eq $docker) {
    throw 'Docker Desktop is required for the local PostgreSQL database. Start it, or rerun with -SkipDatabase and provide DATABASE_URL yourself.'
  }

  $containerState = $null
  $containerExists = $false
  try {
    $containerState = & $docker.Source container inspect --format '{{.State.Running}}' $databaseContainer 2>$null
    $containerExists = $LASTEXITCODE -eq 0
  } catch {
    # A non-existent named container is expected on the first local run.
    $containerState = $null
  }
  if ($containerExists) {
    if ($containerState -ne 'true') {
      Write-Host 'Starting the existing local PostgreSQL container...' -ForegroundColor Cyan
      & $docker.Source start $databaseContainer | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'Could not start local PostgreSQL. Make sure Docker Desktop is running.' }
    }
  } else {
    $databaseListener = Get-NetTCPConnection -State Listen -LocalPort $DatabasePort -ErrorAction SilentlyContinue
    if ($null -ne $databaseListener) {
      throw "Port $DatabasePort is already in use by another service. Choose a free port with -DatabasePort, or use -SkipDatabase with its DATABASE_URL."
    }
    Write-Host 'Creating the local PostgreSQL container...' -ForegroundColor Cyan
    & $docker.Source run --detach --name $databaseContainer --publish "${DatabasePort}:5432" --env POSTGRES_DB=trusten --env POSTGRES_USER=trusten --env POSTGRES_PASSWORD=trusten postgres:18-alpine | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not create local PostgreSQL. Check that Docker Desktop is running and its image download can reach Docker Hub, then run the script again.' }
  }
}

if ($SkipDatabase) {
  if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
    throw 'DATABASE_URL must be set when using -SkipDatabase.'
  }
} else {
  # Do not inherit a shell-level production or non-Bun connection string.
  # This launcher owns the conventional local Trusten database endpoint.
  $env:DATABASE_URL = $databaseUrl
}
$env:TRUSTEN_PORT = $BackendPort
$env:TRUSTEN_API_ORIGIN = "http://localhost:$BackendPort"
$env:NODE_ENV = 'development'

$serverLog = Join-Path $logsDirectory 'server.log'
$serverErrorLog = Join-Path $logsDirectory 'server-error.log'
$webLog = Join-Path $logsDirectory 'web.log'
$webErrorLog = Join-Path $logsDirectory 'web-error.log'
Remove-Item -Force $serverLog, $serverErrorLog, $webLog, $webErrorLog -ErrorAction SilentlyContinue

Write-Host 'Starting Trusten API...' -ForegroundColor Cyan
$server = Start-Process -FilePath $bun.Source -ArgumentList @('run', 'dev') -WorkingDirectory $repoRoot -PassThru -RedirectStandardOutput $serverLog -RedirectStandardError $serverErrorLog

try {
  Wait-ForHttpOk -Url "http://127.0.0.1:$BackendPort/health" -Service 'Trusten API'

  Write-Host 'Starting SvelteKit dashboard...' -ForegroundColor Cyan
  $web = Start-Process -FilePath $bun.Source -ArgumentList @('run', 'dev:web', '--', '--host', '127.0.0.1', '--port', $FrontendPort, '--strictPort') -WorkingDirectory $repoRoot -PassThru -RedirectStandardOutput $webLog -RedirectStandardError $webErrorLog
  Wait-ForHttpOk -Url "http://127.0.0.1:$FrontendPort/" -Service 'SvelteKit dashboard'
} catch {
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force }
  if ($web -and -not $web.HasExited) { Stop-Process -Id $web.Id -Force }
  throw
}

Write-Host ''
Write-Host 'Trusten is running.' -ForegroundColor Green
Write-Host "  Dashboard: http://127.0.0.1:$FrontendPort/"
Write-Host "  API:       http://127.0.0.1:$BackendPort/health"
Write-Host "  Logs:      $logsDirectory"
Write-Host 'Run this script again to replace the two application processes.'
