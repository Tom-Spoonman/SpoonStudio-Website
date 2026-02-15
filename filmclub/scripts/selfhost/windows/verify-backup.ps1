param(
  [string]$BackupRoot = "",
  [int]$MaxAgeHours = 30,
  [int]$MinSizeBytes = 10240
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
if ([string]::IsNullOrWhiteSpace($BackupRoot)) {
  $BackupRoot = Join-Path $repoRoot "backups\postgres"
}
$BackupRoot = [System.IO.Path]::GetFullPath($BackupRoot)

if (-not (Test-Path $BackupRoot)) {
  throw "Backup directory does not exist: $BackupRoot"
}

$latest = Get-ChildItem -Path $BackupRoot -File -Filter "*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $latest) {
  throw "No backup files found in $BackupRoot"
}

$ageHours = ((Get-Date) - $latest.LastWriteTime).TotalHours

Write-Host "Latest backup: $($latest.FullName)"
Write-Host "Last write time: $($latest.LastWriteTime)"
Write-Host "Age (hours): $([math]::Round($ageHours, 2))"
Write-Host "Size (bytes): $($latest.Length)"

if ($ageHours -gt $MaxAgeHours) {
  throw "Latest backup is older than $MaxAgeHours hours."
}
if ($latest.Length -lt $MinSizeBytes) {
  throw "Latest backup size is smaller than minimum threshold ($MinSizeBytes bytes)."
}

Write-Host "Backup verification passed."
