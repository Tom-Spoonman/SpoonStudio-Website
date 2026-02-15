param(
  [ValidateSet("install", "uninstall", "start", "stop", "restart", "status")]
  [string]$Action,
  [string]$ServiceName = "cloudflared"
)

$ErrorActionPreference = "Stop"

function Assert-LastExitCode([string]$Step) {
  if ($LASTEXITCODE -ne 0) {
    throw "$Step failed with exit code $LASTEXITCODE"
  }
}

function Get-CloudflaredService([string]$Name) {
  $service = Get-Service -Name $Name -ErrorAction SilentlyContinue
  if ($service) {
    return $service
  }
  $matches = Get-Service | Where-Object { $_.Name -like "*cloudflared*" -or $_.DisplayName -like "*cloudflared*" }
  return $matches | Select-Object -First 1
}

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  throw "cloudflared is required but was not found in PATH."
}

switch ($Action) {
  "install" {
    Write-Host "Installing cloudflared service..."
    cloudflared service install | Out-Host
    Assert-LastExitCode "cloudflared service install"
  }
  "uninstall" {
    Write-Host "Uninstalling cloudflared service..."
    cloudflared service uninstall | Out-Host
    Assert-LastExitCode "cloudflared service uninstall"
  }
  "start" {
    $service = Get-CloudflaredService $ServiceName
    if (-not $service) {
      throw "Cloudflared service not found. Install it first."
    }
    Start-Service -Name $service.Name
    Write-Host "Started service: $($service.Name)"
  }
  "stop" {
    $service = Get-CloudflaredService $ServiceName
    if (-not $service) {
      throw "Cloudflared service not found."
    }
    Stop-Service -Name $service.Name
    Write-Host "Stopped service: $($service.Name)"
  }
  "restart" {
    $service = Get-CloudflaredService $ServiceName
    if (-not $service) {
      throw "Cloudflared service not found."
    }
    Restart-Service -Name $service.Name
    Write-Host "Restarted service: $($service.Name)"
  }
  "status" {
    $service = Get-CloudflaredService $ServiceName
    if (-not $service) {
      throw "Cloudflared service not found."
    }
    Write-Host "Service name: $($service.Name)"
    Write-Host "Display name: $($service.DisplayName)"
    Write-Host "Status: $($service.Status)"
  }
}
