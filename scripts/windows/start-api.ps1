$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib.ps1"
$RepoRoot = Get-RepoRoot
Set-Location $RepoRoot
Load-DotEnv (Join-Path $RepoRoot ".env.local")

if (-not $env:API_PORT) { $env:API_PORT = "5000" }
if (-not $env:NODE_ENV) { $env:NODE_ENV = "development" }
$env:PORT = $env:API_PORT

Write-Host "API Server -> http://localhost:$($env:PORT)/api/healthz" -ForegroundColor Cyan
pnpm.cmd --filter @workspace/api-server run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
pnpm.cmd --filter @workspace/api-server run start
