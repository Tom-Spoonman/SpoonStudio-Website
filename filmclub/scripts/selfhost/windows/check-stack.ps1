param(
  [string]$LocalApiUrl = "http://127.0.0.1:4000/health",
  [string]$LocalWebUrl = "http://127.0.0.1:3000",
  [string]$PublicApiUrl = "https://api.spoon.studio/health",
  [string]$PublicWebUrl = "https://filmclub.spoon.studio"
)

$ErrorActionPreference = "Stop"

try {
  $tls12 = [Net.SecurityProtocolType]::Tls12
  $tls13 = [Enum]::GetNames([Net.SecurityProtocolType]) -contains "Tls13"
  if ($tls13) {
    [Net.ServicePointManager]::SecurityProtocol = $tls12 -bor [Net.SecurityProtocolType]::Tls13
  } else {
    [Net.ServicePointManager]::SecurityProtocol = $tls12
  }
} catch {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
}

function Add-Result([System.Collections.Generic.List[object]]$Results, [string]$Check, [bool]$Passed, [string]$Message) {
  $Results.Add([pscustomobject]@{
      Check   = $Check
      Passed  = $Passed
      Message = $Message
    })
}

function Test-Http([string]$Name, [string]$Url, [System.Collections.Generic.List[object]]$Results) {
  try {
    $response = Invoke-WebRequest -Uri $Url -Method GET -TimeoutSec 10
    $ok = $response.StatusCode -ge 200 -and $response.StatusCode -lt 400
    Add-Result $Results $Name $ok "HTTP $($response.StatusCode)"
  } catch {
    Add-Result $Results $Name $false $_.Exception.Message
  }
}

function Get-Pm2ProcessStatus([string]$Name) {
  $describe = pm2 describe $Name 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $describe) {
    return "missing"
  }
  $statusLine = $describe | Where-Object { $_ -match "status\s+│" } | Select-Object -First 1
  if (-not $statusLine) {
    return "unknown"
  }
  $parts = $statusLine -split "│"
  if ($parts.Count -lt 3) {
    return "unknown"
  }
  return $parts[2].Trim()
}

$results = [System.Collections.Generic.List[object]]::new()

if (Get-Command pm2 -ErrorAction SilentlyContinue) {
  $apiStatus = Get-Pm2ProcessStatus "filmclub-api"
  $webStatus = Get-Pm2ProcessStatus "filmclub-web"
  Add-Result $results "PM2 process filmclub-api online" ($apiStatus -eq "online") $apiStatus
  Add-Result $results "PM2 process filmclub-web online" ($webStatus -eq "online") $webStatus
} else {
  Add-Result $results "PM2 command availability" $false "pm2 not found in PATH"
}

if (Get-Command docker -ErrorAction SilentlyContinue) {
  try {
    $state = (docker inspect -f "{{.State.Running}}" filmclub-postgres 2>$null).Trim()
    $message = if ([string]::IsNullOrWhiteSpace($state)) { "missing" } else { $state }
    Add-Result $results "Postgres container running" ($state -eq "true") $message
  } catch {
    Add-Result $results "Postgres container running" $false $_.Exception.Message
  }
} else {
  Add-Result $results "Docker command availability" $false "docker not found in PATH"
}

Test-Http -Name "Local API health" -Url $LocalApiUrl -Results $results
Test-Http -Name "Local web availability" -Url $LocalWebUrl -Results $results
Test-Http -Name "Public API health" -Url $PublicApiUrl -Results $results
Test-Http -Name "Public web availability" -Url $PublicWebUrl -Results $results

try {
  $cloudflaredRunning = @(Get-Process cloudflared -ErrorAction SilentlyContinue).Count -gt 0
  $message = if ($cloudflaredRunning) { "running" } else { "not running" }
  Add-Result $results "cloudflared process running" $cloudflaredRunning $message
} catch {
  Add-Result $results "cloudflared process running" $false $_.Exception.Message
}

Write-Host "Stack check summary:"
$results | ForEach-Object {
  $status = if ($_.Passed) { "[PASS]" } else { "[FAIL]" }
  Write-Host "$status $($_.Check) - $($_.Message)"
}

$failed = @($results | Where-Object { -not $_.Passed })
if ($failed.Count -gt 0) {
  throw "Stack check failed with $($failed.Count) failing checks."
}

Write-Host "All checks passed."
