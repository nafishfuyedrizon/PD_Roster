$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib.ps1"
$RepoRoot = Get-RepoRoot
Set-Location $RepoRoot
Load-DotEnv (Join-Path $RepoRoot ".env.local")

if (-not $env:PANEL_PORT) { $env:PANEL_PORT = "5173" }
if (-not $env:API_PORT) { $env:API_PORT = "5000" }
if (-not $env:BASE_PATH) { $env:BASE_PATH = "/shift-roster/" }
if (-not $env:API_PROXY_TARGET) { $env:API_PROXY_TARGET = "http://localhost:$($env:API_PORT)" }
if (-not $env:NODE_ENV) { $env:NODE_ENV = "development" }
$env:PORT = $env:PANEL_PORT

Write-Host "Shift Roster -> http://localhost:$($env:PORT)$($env:BASE_PATH)" -ForegroundColor Cyan
Write-Host "API Proxy -> $($env:API_PROXY_TARGET)" -ForegroundColor Cyan
pnpm.cmd --filter @workspace/shift-roster run dev
