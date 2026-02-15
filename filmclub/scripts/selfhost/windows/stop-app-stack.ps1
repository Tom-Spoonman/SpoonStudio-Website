$ErrorActionPreference = "Stop"

function Try-Command([scriptblock]$Action) {
  try {
    & $Action | Out-Host
  } catch {
    Write-Host $_.Exception.Message
  }
}

if (Get-Command pm2 -ErrorAction SilentlyContinue) {
  Write-Host "Stopping PM2 processes..."
  Try-Command { pm2 stop filmclub-api }
  Try-Command { pm2 stop filmclub-web }
  Try-Command { pm2 delete filmclub-api }
  Try-Command { pm2 delete filmclub-web }
  Try-Command { pm2 save }
}

if (Get-Command docker -ErrorAction SilentlyContinue) {
  $repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
  Push-Location $repoRoot
  try {
    Write-Host "Stopping Postgres container..."
    Try-Command { docker compose stop postgres }
  } finally {
    Pop-Location
  }
}

Write-Host "App stack stop sequence completed."
