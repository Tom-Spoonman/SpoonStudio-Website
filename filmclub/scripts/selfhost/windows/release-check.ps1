param(
  [string]$ApiBaseUrl = "https://api.spoon.studio",
  [string]$WebBaseUrl = "https://filmclub.spoon.studio",
  [switch]$SkipSmoke
)

$ErrorActionPreference = "Stop"

$windowsScriptsDir = $PSScriptRoot
$rootScriptsDir = Resolve-Path (Join-Path $windowsScriptsDir "..\..")

Write-Host "1) Running preflight..."
& (Join-Path $windowsScriptsDir "preflight.ps1")

Write-Host "2) Running stack check..."
& (Join-Path $windowsScriptsDir "check-stack.ps1") `
  -PublicApiUrl "$ApiBaseUrl/health" `
  -PublicWebUrl $WebBaseUrl

if (-not $SkipSmoke) {
  Write-Host "3) Running smoke test..."
  & (Join-Path $rootScriptsDir "smoke-staging.ps1") `
    -ApiBaseUrl $ApiBaseUrl `
    -WebBaseUrl $WebBaseUrl
}

Write-Host "Release checks passed."
