$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib.ps1"

$RepoRoot = Get-RepoRoot
Set-Location $RepoRoot
Load-DotEnv (Join-Path $RepoRoot ".env.local")

if (-not $env:DATABASE_URL) {
  Write-Host "DATABASE_URL missing in .env.local" -ForegroundColor Red
  exit 1
}

if (-not $env:DISCORD_BOT_TOKEN) {
  Write-Host "DISCORD_BOT_TOKEN missing in .env.local" -ForegroundColor Red
  exit 1
}

if (-not $env:DISCORD_TIMESTAMP_CHANNEL_ID) {
  Write-Host "DISCORD_TIMESTAMP_CHANNEL_ID missing in .env.local" -ForegroundColor Red
  exit 1
}

if (-not $env:DISCORD_FIR_CHANNEL_ID) {
  Write-Host "DISCORD_FIR_CHANNEL_ID missing in .env.local" -ForegroundColor Red
  exit 1
}

if (-not $env:RUN_DISCORD_BOT) { $env:RUN_DISCORD_BOT = "true" }
if (-not $env:API_PORT) { $env:API_PORT = "5000" }
if (-not $env:PANEL_PORT) { $env:PANEL_PORT = "5173" }
if (-not $env:BASE_PATH) { $env:BASE_PATH = "/shift-roster/" }
if (-not $env:API_PROXY_TARGET) { $env:API_PROXY_TARGET = "http://localhost:$($env:API_PORT)" }
if (-not $env:NODE_ENV) { $env:NODE_ENV = "development" }
if (-not $env:START_LOCAL_PANEL) { $env:START_LOCAL_PANEL = "false" }
if (-not $env:LIVE_FRONTEND_URL) { $env:LIVE_FRONTEND_URL = "https://pd-roster.pages.dev" }
if (-not $env:LIVE_API_URL) { $env:LIVE_API_URL = "https://pd-roster-api.onrender.com" }

Write-Host "Discord-enabled Windows stack starting..." -ForegroundColor Cyan
Write-Host "DB -> $($env:DATABASE_URL)" -ForegroundColor DarkCyan
Write-Host "Local Bot/API -> http://localhost:$($env:API_PORT)/api/healthz" -ForegroundColor DarkCyan
Write-Host "Render API -> $($env:LIVE_API_URL)" -ForegroundColor DarkCyan
Write-Host "Cloudflare Pages -> $($env:LIVE_FRONTEND_URL)" -ForegroundColor DarkCyan
Write-Host "Local Panel -> $($env:START_LOCAL_PANEL)" -ForegroundColor DarkCyan
Write-Host "Bot -> enabled" -ForegroundColor Green

& "$PSScriptRoot\start-all.ps1"
