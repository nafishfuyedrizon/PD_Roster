function Get-RepoRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

function Load-DotEnv {
  param([string]$EnvPath)
  if (-not (Test-Path $EnvPath)) {
    Write-Host "Missing .env.local. Run FIRST_TIME_SETUP.bat first." -ForegroundColor Red
    exit 1
  }

  Get-Content $EnvPath | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { return }
    $key = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    [Environment]::SetEnvironmentVariable($key, $value, "Process")
  }
}

function Require-Command {
  param([string]$Name, [string]$Help)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Write-Host "Missing: $Name" -ForegroundColor Red
    if ($Help) { Write-Host $Help -ForegroundColor Yellow }
    exit 1
  }
}

function Start-PowerShellScriptWindow {
  param([Parameter(Mandatory = $true)][string]$ScriptPath)

  $resolved = (Resolve-Path $ScriptPath).Path
  Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $resolved
  )
}

function Wait-Url {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 90,
    [string]$Name = "service"
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  Write-Host "Waiting for ${Name}: $Url" -ForegroundColor Cyan
  while ((Get-Date) -lt $deadline) {
    $urls = @($Url)
    if ($Url -match "localhost") {
      $urls += ($Url -replace "localhost", "127.0.0.1")
    }
    foreach ($candidate in $urls | Select-Object -Unique) {
      try {
        $response = Invoke-WebRequest -Uri $candidate -UseBasicParsing -TimeoutSec 3
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
          Write-Host "$Name is ready." -ForegroundColor Green
          return $true
        }
      } catch {
      }
    }
    Start-Sleep -Seconds 2
  }

  Write-Host "$Name did not respond within $TimeoutSeconds seconds." -ForegroundColor Yellow
  return $false
}
