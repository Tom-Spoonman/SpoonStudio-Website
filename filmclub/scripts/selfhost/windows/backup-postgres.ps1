param(
  [string]$ContainerName = "filmclub-postgres",
  [string]$PgUser = "filmclub",
  [string]$PgDatabase = "filmclub",
  [string]$BackupRoot = "",
  [int]$RetentionDays = 14
)

$ErrorActionPreference = "Stop"

function Assert-LastExitCode([string]$Step) {
  if ($LASTEXITCODE -ne 0) {
    throw "$Step failed with exit code $LASTEXITCODE"
  }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "docker is required but was not found in PATH."
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
if ([string]::IsNullOrWhiteSpace($BackupRoot)) {
  $BackupRoot = Join-Path $repoRoot "backups\postgres"
}
$BackupRoot = [System.IO.Path]::GetFullPath($BackupRoot)

if (-not (Test-Path $BackupRoot)) {
  New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
}

$containerState = docker inspect -f "{{.State.Running}}" $ContainerName 2>$null
Assert-LastExitCode "docker inspect $ContainerName"
if ($containerState.Trim() -ne "true") {
  throw "Container '$ContainerName' is not running."
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$fileName = "$PgDatabase-$timestamp.dump"
$hostBackupPath = Join-Path $BackupRoot $fileName
$containerTmpPath = "/tmp/$fileName"

Write-Host "Creating backup in container..."
docker exec $ContainerName pg_dump -U $PgUser -d $PgDatabase -Fc -f $containerTmpPath | Out-Host
Assert-LastExitCode "pg_dump"

Write-Host "Copying backup to host..."
docker cp "${ContainerName}:$containerTmpPath" $hostBackupPath | Out-Host
Assert-LastExitCode "docker cp"

Write-Host "Cleaning temporary backup file in container..."
docker exec $ContainerName rm -f $containerTmpPath | Out-Host
Assert-LastExitCode "cleanup temp backup"

if ($RetentionDays -gt 0) {
  $cutoff = (Get-Date).AddDays(-1 * $RetentionDays)
  Get-ChildItem -Path $BackupRoot -File -Filter "*.dump" | Where-Object { $_.LastWriteTime -lt $cutoff } | ForEach-Object {
    Remove-Item -Path $_.FullName -Force
  }
}

Write-Host "Backup created: $hostBackupPath"
