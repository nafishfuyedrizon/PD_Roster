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

Write-Host "Discord-enabled Windows stack starting..." -ForegroundColor Cyan
Write-Host "DB -> $($env:DATABASE_URL)" -ForegroundColor DarkCyan
Write-Host "API -> http://localhost:$($env:API_PORT)/api/healthz" -ForegroundColor DarkCyan
Write-Host "Panel -> http://localhost:$($env:PANEL_PORT)$($env:BASE_PATH)" -ForegroundColor DarkCyan
Write-Host "Bot -> enabled" -ForegroundColor Green

& "$PSScriptRoot\start-all.ps1"
