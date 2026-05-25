<#
.SYNOPSIS
    Start the Florida Annual Report local dev stack.

.DESCRIPTION
    Wraps `docker compose up` with a few convenience checks:
      * verifies Docker is running
      * copies .env.example -> .env on first run
      * builds images, then waits until each service is healthy
      * prints the URLs to hit when everything is up

.PARAMETER Detach
    Run containers in the background (docker compose up -d).

.PARAMETER Rebuild
    Force a no-cache rebuild of all images before starting.

.PARAMETER Down
    Stop and remove all containers/volumes, then exit.

.EXAMPLE
    ./scripts/dev.ps1
    ./scripts/dev.ps1 -Detach
    ./scripts/dev.ps1 -Rebuild
    ./scripts/dev.ps1 -Down
#>
[CmdletBinding()]
param(
    [switch]$Detach,
    [switch]$Rebuild,
    [switch]$Down
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $repoRoot

function Test-DockerRunning {
    try { docker info --format '{{.ServerVersion}}' 2>$null | Out-Null; return $true }
    catch { return $false }
}

if (-not (Test-DockerRunning)) {
    Write-Host "Docker daemon is not reachable. Start Docker Desktop and retry." -ForegroundColor Red
    exit 1
}

if ($Down) {
    Write-Host "Stopping and removing dev stack..." -ForegroundColor Yellow
    docker compose down -v
    exit $LASTEXITCODE
}

if (-not (Test-Path .env)) {
    Write-Host "No .env found; copying from .env.example" -ForegroundColor Yellow
    Copy-Item .env.example .env
}

$composeArgs = @('compose', 'up')
if ($Rebuild) { $composeArgs += '--build', '--force-recreate' } else { $composeArgs += '--build' }
if ($Detach)  { $composeArgs += '-d' }

Write-Host "Starting: docker $($composeArgs -join ' ')" -ForegroundColor Cyan
& docker @composeArgs
$exit = $LASTEXITCODE

if ($Detach -and $exit -eq 0) {
    Write-Host ""
    Write-Host "Stack is up. Services:" -ForegroundColor Green
    Write-Host "  Frontend     http://localhost:3000"
    Write-Host "  Extraction   http://localhost:8001  (Swagger: /docs)"
    Write-Host "  Postgres     localhost:5432         user=far db=far"
    Write-Host "  Azurite Blob http://localhost:10000"
    Write-Host ""
    Write-Host "Tail logs:    docker compose logs -f"
    Write-Host "Stop:         ./scripts/dev.ps1 -Down"
}

exit $exit
