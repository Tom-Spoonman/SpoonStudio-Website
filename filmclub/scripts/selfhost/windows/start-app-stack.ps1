param(
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

function Assert-LastExitCode([string]$Step) {
  if ($LASTEXITCODE -ne 0) {
    throw "$Step failed with exit code $LASTEXITCODE"
  }
}

function Assert-Pm2ProcessPresent([string]$Name) {
  $pm2Pid = (pm2 pid $Name).Trim()
  Assert-LastExitCode "pm2 pid $Name"
  if ([string]::IsNullOrWhiteSpace($pm2Pid) -or $pm2Pid -eq "0") {
    throw "PM2 process '$Name' was not registered."
  }
}

Require-Command "docker"
Require-Command "npm"
Require-Command "pm2"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
Push-Location $repoRoot

try {
  Write-Host "Starting Postgres container..."
  docker compose up -d postgres | Out-Host
  Assert-LastExitCode "docker compose up -d postgres"

  if (-not $SkipBuild) {
    Write-Host "Installing dependencies..."
    npm install | Out-Host
    Assert-LastExitCode "npm install"
    Write-Host "Building workspaces..."
    npm run build | Out-Host
    Assert-LastExitCode "npm run build"
  }

  Write-Host "Starting API + Web with PM2..."
  pm2 start ecosystem.config.cjs --update-env | Out-Host
  Assert-LastExitCode "pm2 start ecosystem.config.cjs"
  Assert-Pm2ProcessPresent "filmclub-api"
  Assert-Pm2ProcessPresent "filmclub-web"
  pm2 save | Out-Host
  Assert-LastExitCode "pm2 save"

  Write-Host ""
  Write-Host "App stack is up."
  Write-Host "PM2 status:"
  pm2 status | Out-Host
} finally {
  Pop-Location
}
