$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib.ps1"
$RepoRoot = Get-RepoRoot
Set-Location $RepoRoot
Load-DotEnv (Join-Path $RepoRoot ".env.local")

$apiScript = Join-Path $PSScriptRoot "start-api.ps1"
$panelScript = Join-Path $PSScriptRoot "start-panel.ps1"

Write-Host "Opening API and Panel windows..." -ForegroundColor Cyan
Start-PowerShellScriptWindow -ScriptPath $apiScript
Start-Sleep -Seconds 5
Start-PowerShellScriptWindow -ScriptPath $panelScript

if (-not $env:API_PORT) { $env:API_PORT = "5000" }
if (-not $env:PANEL_PORT) { $env:PANEL_PORT = "5173" }
if (-not $env:BASE_PATH) { $env:BASE_PATH = "/shift-roster/" }

Wait-Url -Url "http://localhost:$($env:API_PORT)/api/healthz" -TimeoutSeconds 180 -Name "API Server" | Out-Null
Wait-Url -Url "http://localhost:$($env:PANEL_PORT)$($env:BASE_PATH)" -TimeoutSeconds 180 -Name "Shift Roster" | Out-Null
Start-Process "http://localhost:$($env:PANEL_PORT)$($env:BASE_PATH)"
Write-Host "Done. Close the opened PowerShell windows to stop services." -ForegroundColor Green
