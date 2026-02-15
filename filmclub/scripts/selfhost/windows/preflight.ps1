param(
  [int]$MinNodeMajor = 20,
  [switch]$SkipCloudflaredCheck
)

$ErrorActionPreference = "Stop"

function Add-Result([System.Collections.Generic.List[object]]$Results, [string]$Check, [bool]$Passed, [string]$Message) {
  $Results.Add([pscustomobject]@{
      Check   = $Check
      Passed  = $Passed
      Message = $Message
    })
}

function Get-EnvMap([string[]]$Paths) {
  $map = @{}
  foreach ($path in $Paths) {
    if (-not (Test-Path $path)) {
      continue
    }
    foreach ($line in (Get-Content $path)) {
      $trimmed = $line.Trim()
      if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("#")) {
        continue
      }
      $idx = $trimmed.IndexOf("=")
      if ($idx -lt 1) {
        continue
      }
      $key = $trimmed.Substring(0, $idx).Trim()
      $value = $trimmed.Substring($idx + 1).Trim()
      $map[$key] = $value
    }
  }
  return $map
}

function Test-PortAvailable([int]$Port) {
  try {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return -not $conn
  } catch {
    $netstat = netstat -ano | Select-String ":$Port\s"
    return -not $netstat
  }
}

$results = [System.Collections.Generic.List[object]]::new()
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")

$requiredCommands = @("node", "npm", "docker", "pm2")
if (-not $SkipCloudflaredCheck) {
  $requiredCommands += "cloudflared"
}
foreach ($commandName in $requiredCommands) {
  $cmd = Get-Command $commandName -ErrorAction SilentlyContinue
  Add-Result $results "Command '$commandName' in PATH" ($null -ne $cmd) (if ($cmd) { "ok" } else { "missing" })
}

$nodeVersionRaw = ""
try {
  $nodeVersionRaw = (& node --version).Trim()
  $nodeMajor = [int](($nodeVersionRaw -replace "^v", "").Split(".")[0])
  Add-Result $results "Node version >= $MinNodeMajor" ($nodeMajor -ge $MinNodeMajor) "detected $nodeVersionRaw"
} catch {
  Add-Result $results "Node version >= $MinNodeMajor" $false "could not evaluate node version"
}

try {
  docker info | Out-Null
  Add-Result $results "Docker daemon reachable" $true "ok"
} catch {
  Add-Result $results "Docker daemon reachable" $false "docker info failed"
}

$apiEnv = Join-Path $repoRoot "apps\api\.env.production"
$webEnv = Join-Path $repoRoot "apps\web\.env.production"
Add-Result $results "File exists apps/api/.env.production" (Test-Path $apiEnv) (if (Test-Path $apiEnv) { "ok" } else { "missing" })
Add-Result $results "File exists apps/web/.env.production" (Test-Path $webEnv) (if (Test-Path $webEnv) { "ok" } else { "missing" })

$mergedEnv = Get-EnvMap @(
  (Join-Path $repoRoot ".env"),
  (Join-Path $repoRoot "apps\api\.env"),
  (Join-Path $repoRoot ".env.production"),
  $apiEnv,
  $webEnv
)

$requiredEnvVars = @(
  "DATABASE_URL",
  "CORS_ORIGIN",
  "API_PORT",
  "SESSION_TTL_DAYS",
  "NEXT_PUBLIC_API_BASE_URL"
)
foreach ($key in $requiredEnvVars) {
  $present = $mergedEnv.ContainsKey($key) -and -not [string]::IsNullOrWhiteSpace($mergedEnv[$key])
  Add-Result $results "Env var '$key' configured" $present (if ($present) { "ok" } else { "missing" })
}

foreach ($port in @(3000, 4000, 55432)) {
  $available = Test-PortAvailable $port
  $message = if ($available) { "free" } else { "already in use (may be expected if stack is already running)" }
  Add-Result $results "Port $port availability check" $true $message
}

Write-Host "Preflight check results:"
$results | ForEach-Object {
  $status = if ($_.Passed) { "[PASS]" } else { "[FAIL]" }
  Write-Host "$status $($_.Check) - $($_.Message)"
}

$failed = @($results | Where-Object { -not $_.Passed })
if ($failed.Count -gt 0) {
  throw "Preflight failed with $($failed.Count) failing checks."
}

Write-Host "Preflight passed."
