param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,
  [string]$ContainerName = "filmclub-postgres",
  [string]$PgUser = "filmclub",
  [string]$PgDatabase = "filmclub",
  [switch]$SkipApiStop,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

function Assert-LastExitCode([string]$Step) {
  if ($LASTEXITCODE -ne 0) {
    throw "$Step failed with exit code $LASTEXITCODE"
  }
}

if (-not $Force) {
  throw "Restore is destructive. Re-run with -Force to confirm database replacement."
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "docker is required but was not found in PATH."
}

$resolvedBackupFile = Resolve-Path $BackupFile -ErrorAction Stop

$containerState = docker inspect -f "{{.State.Running}}" $ContainerName 2>$null
Assert-LastExitCode "docker inspect $ContainerName"
if ($containerState.Trim() -ne "true") {
  throw "Container '$ContainerName' is not running."
}

$apiWasRunning = $false
if ((-not $SkipApiStop) -and (Get-Command pm2 -ErrorAction SilentlyContinue)) {
  $apiPid = (pm2 pid filmclub-api).Trim()
  if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($apiPid) -and $apiPid -ne "0") {
    $apiWasRunning = $true
    Write-Host "Stopping API process before restore..."
    pm2 stop filmclub-api | Out-Host
    Assert-LastExitCode "pm2 stop filmclub-api"
  }
}

$containerRestorePath = "/tmp/restore-$([Guid]::NewGuid().ToString('N')).dump"

try {
  Write-Host "Copying backup into container..."
  docker cp $resolvedBackupFile "${ContainerName}:$containerRestorePath" | Out-Host
  Assert-LastExitCode "docker cp restore dump"

  Write-Host "Recreating target database..."
  docker exec $ContainerName psql -U $PgUser -d postgres -c "DROP DATABASE IF EXISTS $PgDatabase;" | Out-Host
  Assert-LastExitCode "drop database"
  docker exec $ContainerName psql -U $PgUser -d postgres -c "CREATE DATABASE $PgDatabase;" | Out-Host
  Assert-LastExitCode "create database"

  Write-Host "Restoring backup..."
  docker exec $ContainerName pg_restore -U $PgUser -d $PgDatabase --clean --if-exists $containerRestorePath | Out-Host
  Assert-LastExitCode "pg_restore"
} finally {
  Write-Host "Cleaning temporary restore file..."
  docker exec $ContainerName rm -f $containerRestorePath | Out-Host
}

if ($apiWasRunning) {
  Write-Host "Restarting API..."
  pm2 restart filmclub-api --update-env | Out-Host
  Assert-LastExitCode "pm2 restart filmclub-api"
}

Write-Host "Restore completed from: $resolvedBackupFile"
