param(
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
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

  if (-not $SkipBuild) {
    Write-Host "Installing dependencies..."
    npm install | Out-Host
    Write-Host "Building workspaces..."
    npm run build | Out-Host
  }

  Write-Host "Starting API + Web with PM2..."
  pm2 start ecosystem.config.cjs --update-env | Out-Host
  pm2 save | Out-Host

  Write-Host ""
  Write-Host "App stack is up."
  Write-Host "PM2 status:"
  pm2 status | Out-Host
} finally {
  Pop-Location
}
