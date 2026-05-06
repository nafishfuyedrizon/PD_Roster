$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib.ps1"
$RepoRoot = Get-RepoRoot
Set-Location $RepoRoot
Load-DotEnv (Join-Path $RepoRoot ".env.local")

$apiScript = Join-Path $PSScriptRoot "start-api.ps1"
$panelScript = Join-Path $PSScriptRoot "start-panel.ps1"

if (-not $env:START_LOCAL_PANEL) { $env:START_LOCAL_PANEL = "false" }
if (-not $env:LIVE_FRONTEND_URL) { $env:LIVE_FRONTEND_URL = "https://pd-roster.pages.dev" }
if (-not $env:LIVE_API_URL) { $env:LIVE_API_URL = "https://pd-roster-api.onrender.com" }

Write-Host "Opening API window..." -ForegroundColor Cyan
Start-PowerShellScriptWindow -ScriptPath $apiScript

if ($env:START_LOCAL_PANEL -eq "true") {
  Start-Sleep -Seconds 5
  Write-Host "Opening local panel window..." -ForegroundColor Cyan
  Start-PowerShellScriptWindow -ScriptPath $panelScript
}

if (-not $env:API_PORT) { $env:API_PORT = "5000" }
if (-not $env:PANEL_PORT) { $env:PANEL_PORT = "5173" }
if (-not $env:BASE_PATH) { $env:BASE_PATH = "/shift-roster/" }

Wait-Url -Url "http://localhost:$($env:API_PORT)/api/healthz" -TimeoutSeconds 180 -Name "API Server" | Out-Null

if ($env:START_LOCAL_PANEL -eq "true") {
  Wait-Url -Url "http://localhost:$($env:PANEL_PORT)$($env:BASE_PATH)" -TimeoutSeconds 180 -Name "Shift Roster" | Out-Null
  Start-Process "http://localhost:$($env:PANEL_PORT)$($env:BASE_PATH)"
  Write-Host "Done. Local API, bot, and panel are running." -ForegroundColor Green
} else {
  Write-Host "Render API -> $($env:LIVE_API_URL)" -ForegroundColor DarkCyan
  Write-Host "Cloudflare Pages -> $($env:LIVE_FRONTEND_URL)" -ForegroundColor DarkCyan
  Start-Process $env:LIVE_FRONTEND_URL
  Write-Host "Done. Local bot/API are running, and the deployed website has been opened." -ForegroundColor Green
}
