param(
  [switch]$SkipBuild,
  [switch]$SkipPreflight
)

$ErrorActionPreference = "Stop"

$startScript = Join-Path $PSScriptRoot "start-app-stack.ps1"
$stopScript = Join-Path $PSScriptRoot "stop-app-stack.ps1"

if (-not (Test-Path $startScript)) {
  throw "start-app-stack.ps1 not found at $startScript"
}
if (-not (Test-Path $stopScript)) {
  throw "stop-app-stack.ps1 not found at $stopScript"
}

Write-Host "Restarting app stack (stop -> start)..."

& $stopScript

$startParams = @{}
if ($SkipBuild) {
  $startParams["SkipBuild"] = $true
}
if ($SkipPreflight) {
  $startParams["SkipPreflight"] = $true
}

& $startScript @startParams

Write-Host "Restart sequence completed."
