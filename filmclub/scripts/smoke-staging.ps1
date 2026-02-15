param(
  [Parameter(Mandatory = $true)]
  [string]$ApiBaseUrl,
  [string]$WebBaseUrl
)

$ErrorActionPreference = "Stop"

# Ensure modern TLS is used on Windows PowerShell (5.1) for HTTPS endpoints.
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

function New-RandomName([string]$prefix) {
  return "$prefix-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())-$([System.Guid]::NewGuid().ToString('N').Substring(0, 6))"
}

function Invoke-FilmclubRequest(
  [string]$Method,
  [string]$Url,
  [object]$Body = $null,
  [hashtable]$Headers = @{}
) {
  $params = @{
    Method = $Method
    Uri = $Url
    Headers = $Headers
  }
  if ($null -ne $Body) {
    $params["ContentType"] = "application/json"
    $params["Body"] = ($Body | ConvertTo-Json -Depth 10)
  }
  return Invoke-RestMethod @params
}

Write-Host "1) API health check..."
$health = Invoke-FilmclubRequest -Method "GET" -Url "$ApiBaseUrl/health"
if ($health.status -ne "ok") {
  throw "API health status is not ok."
}

if ($WebBaseUrl) {
  Write-Host "2) Web availability check..."
  $webResponse = Invoke-WebRequest -Uri $WebBaseUrl -Method GET
  if ($webResponse.StatusCode -lt 200 -or $webResponse.StatusCode -ge 300) {
    throw "Web app returned non-success status: $($webResponse.StatusCode)"
  }
}

Write-Host "3) Register first user..."
$aliceName = New-RandomName "smoke-alice"
$alice = Invoke-FilmclubRequest -Method "POST" -Url "$ApiBaseUrl/v1/auth/register" -Body @{
  displayName = $aliceName
}
$aliceToken = $alice.token
$aliceHeaders = @{ Authorization = "Bearer $aliceToken" }

Write-Host "4) Register second user..."
$bobName = New-RandomName "smoke-bob"
$bob = Invoke-FilmclubRequest -Method "POST" -Url "$ApiBaseUrl/v1/auth/register" -Body @{
  displayName = $bobName
}
$bobToken = $bob.token
$bobHeaders = @{ Authorization = "Bearer $bobToken" }

Write-Host "5) Create club..."
$club = Invoke-FilmclubRequest -Method "POST" -Url "$ApiBaseUrl/v1/clubs" -Headers $aliceHeaders -Body @{
  name = "Smoke Club"
  approvalPolicy = @{
    mode = "majority"
  }
}
$clubId = $club.club.id
$joinCode = $club.club.joinCode

Write-Host "6) Join club..."
Invoke-FilmclubRequest -Method "POST" -Url "$ApiBaseUrl/v1/clubs/join" -Headers $bobHeaders -Body @{
  joinCode = $joinCode
} | Out-Null

Write-Host "7) Update approval policy..."
Invoke-FilmclubRequest -Method "PUT" -Url "$ApiBaseUrl/v1/clubs/$clubId/approval-policy" -Headers $aliceHeaders -Body @{
  approvalPolicy = @{
    mode = "fixed"
    requiredApprovals = 1
  }
} | Out-Null

Write-Host "8) Create movie proposal..."
$proposal = Invoke-FilmclubRequest -Method "POST" -Url "$ApiBaseUrl/v1/proposed-changes" -Headers $aliceHeaders -Body @{
  clubId = $clubId
  entity = "movie_watch"
  payload = @{
    title = "Smoke Test Movie"
    watchedOn = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd")
  }
}
$proposalId = $proposal.id

Write-Host "9) Approve proposal..."
Invoke-FilmclubRequest -Method "POST" -Url "$ApiBaseUrl/v1/proposed-changes/$proposalId/approve" -Headers $bobHeaders -Body @{} | Out-Null

Write-Host "10) Verify proposal status..."
$proposalDetails = Invoke-FilmclubRequest -Method "GET" -Url "$ApiBaseUrl/v1/proposed-changes/$proposalId" -Headers $aliceHeaders
if ($proposalDetails.proposal.status -ne "approved") {
  throw "Proposal did not reach approved status."
}

Write-Host "11) Verify history filter/pagination..."
$history = Invoke-FilmclubRequest -Method "GET" -Url "$ApiBaseUrl/v1/clubs/$clubId/history?status=approved&entity=movie_watch&limit=5&offset=0" -Headers $aliceHeaders
if ($history.total -lt 1) {
  throw "History total is empty."
}
if ($history.items.Count -lt 1) {
  throw "History items are empty."
}

Write-Host "Smoke checks passed."
