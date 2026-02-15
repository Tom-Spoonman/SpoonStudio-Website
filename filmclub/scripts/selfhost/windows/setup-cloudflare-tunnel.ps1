param(
  [string]$TunnelName = "filmclub",
  [string]$WebHostname = "filmclub.spoon.studio",
  [string]$ApiHostname = "api.spoon.studio"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  throw "cloudflared is not installed or not in PATH."
}

Write-Host "1) Cloudflare login..."
cloudflared tunnel login | Out-Host

Write-Host "2) Create tunnel..."
cloudflared tunnel create $TunnelName | Out-Host

Write-Host "3) Route DNS hostnames..."
cloudflared tunnel route dns $TunnelName $WebHostname | Out-Host
cloudflared tunnel route dns $TunnelName $ApiHostname | Out-Host

Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Copy filmclub/env/cloudflared.config.example.yml to $HOME/.cloudflared/config.yml"
Write-Host "2. Replace <TUNNEL_UUID> and <USER> placeholders."
Write-Host "3. Start tunnel: cloudflared tunnel run $TunnelName"
Write-Host "4. Optional service install: cloudflared service install"

