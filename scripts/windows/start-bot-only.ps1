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

if (-not $env:RUN_DISCORD_BOT) { $env:RUN_DISCORD_BOT = "true" }
if (-not $env:NODE_ENV) { $env:NODE_ENV = "production" }
if (-not $env:PD_REGISTRAR_BACKFILL_MONTHS) { $env:PD_REGISTRAR_BACKFILL_MONTHS = "3" }
if (-not $env:NODE_OPTIONS) {
  $env:NODE_OPTIONS = "--use-system-ca"
} elseif ($env:NODE_OPTIONS -notmatch "(^|\s)--use-system-ca(\s|$)") {
  $env:NODE_OPTIONS = "$($env:NODE_OPTIONS) --use-system-ca"
}

Write-Host "Discord bot-only service starting..." -ForegroundColor Cyan
Write-Host "Mode -> bot only (no local website, no local panel)" -ForegroundColor DarkCyan
Write-Host "DB -> $($env:DATABASE_URL)" -ForegroundColor DarkCyan
Write-Host "Render API -> https://pd-roster-api.onrender.com" -ForegroundColor DarkCyan
Write-Host "Cloudflare Pages -> https://pd-roster.pages.dev" -ForegroundColor DarkCyan
Write-Host "Backfill -> $($env:PD_REGISTRAR_BACKFILL_MONTHS) month(s)" -ForegroundColor DarkCyan
Write-Host "Node Options -> $($env:NODE_OPTIONS)" -ForegroundColor DarkCyan
Write-Host "Discord bot will sync directly into the shared PD database." -ForegroundColor Green

pnpm.cmd --filter @workspace/api-server run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

pnpm.cmd --filter @workspace/api-server run start:bot
exit $LASTEXITCODE
