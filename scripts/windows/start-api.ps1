$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib.ps1"
$RepoRoot = Get-RepoRoot
Set-Location $RepoRoot
Load-DotEnv (Join-Path $RepoRoot ".env.local")

if (-not $env:API_PORT) { $env:API_PORT = "5000" }
if (-not $env:NODE_ENV) { $env:NODE_ENV = "development" }
if (-not $env:RUN_DISCORD_BOT) { $env:RUN_DISCORD_BOT = "true" }
if (-not $env:NODE_OPTIONS) {
  $env:NODE_OPTIONS = "--use-system-ca"
} elseif ($env:NODE_OPTIONS -notmatch "(^|\s)--use-system-ca(\s|$)") {
  $env:NODE_OPTIONS = "$($env:NODE_OPTIONS) --use-system-ca"
}
$env:PORT = $env:API_PORT

Write-Host "API Server -> http://localhost:$($env:PORT)/api/healthz" -ForegroundColor Cyan
Write-Host "Discord Bot -> $($env:RUN_DISCORD_BOT)" -ForegroundColor Cyan
Write-Host "Node Options -> $($env:NODE_OPTIONS)" -ForegroundColor Cyan
pnpm.cmd --filter @workspace/api-server run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
pnpm.cmd --filter @workspace/api-server run start
