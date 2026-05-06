param(
  [switch]$SetupOnly
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib.ps1"

$RepoRoot = Get-RepoRoot
Set-Location $RepoRoot

$envFile = Join-Path $RepoRoot ".env.local"
$defaultEnv = @"
DATABASE_URL=postgresql://pd_roster_user:pd_roster_pass@localhost:5432/pd_roster
API_PORT=5000
PANEL_PORT=5173
BASE_PATH=/shift-roster/
API_PROXY_TARGET=http://localhost:5000
NODE_ENV=development
SESSION_SECRET=local-dev-secret-change-me
LOCAL_DEV_LOGIN=true
DEV_LOGIN_ID=463587754471718923
DEV_LOGIN_USERNAME=localadmin
DEV_LOGIN_DISPLAY_NAME=Local Admin

DISCORD_BOT_TOKEN=
DISCORD_TIMESTAMP_CHANNEL_ID=
DISCORD_CITATION_CHANNEL_ID=
DISCORD_FIR_CHANNEL_ID=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_GUILD_ID=1286283853186596904
DISCORD_OWNER_ID=1286283853186596904
"@

if (-not (Test-Path $envFile)) {
  Set-Content -Path $envFile -Value $defaultEnv -Encoding UTF8
  Write-Host ".env.local created." -ForegroundColor Green
}

Load-DotEnv $envFile

Require-Command node "Install Node.js first: https://nodejs.org/"

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  if (Get-Command corepack -ErrorAction SilentlyContinue) {
    corepack enable
    corepack prepare pnpm@latest --activate
  }
}
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  npm install -g pnpm
}
Require-Command pnpm "pnpm could not be installed. Install it manually, then run this again."

$psqlExe = Get-ChildItem 'C:\Program Files\PostgreSQL' -Filter 'psql.exe' -Recurse -ErrorAction SilentlyContinue |
  Sort-Object FullName -Descending |
  Select-Object -First 1 -ExpandProperty FullName

if ($psqlExe) {
  Write-Host "Dropping transient session table before schema push..." -ForegroundColor Cyan
  & $psqlExe -d $env:DATABASE_URL -v ON_ERROR_STOP=1 -c 'DROP TABLE IF EXISTS "session";'
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "Installing dependencies..." -ForegroundColor Cyan
pnpm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Pushing PostgreSQL schema..." -ForegroundColor Cyan
pnpm.cmd --filter @workspace/db run push
if ($LASTEXITCODE -ne 0) {
  Write-Host "Schema push failed. Check DATABASE_URL in .env.local." -ForegroundColor Red
  exit $LASTEXITCODE
}

if ($psqlExe) {
  Write-Host "Ensuring session table exists..." -ForegroundColor Cyan
  & $psqlExe -d $env:DATABASE_URL -v ON_ERROR_STOP=1 -c 'CREATE TABLE IF NOT EXISTS session (sid varchar NOT NULL PRIMARY KEY, sess json NOT NULL, expire timestamp(6) NOT NULL);'
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  & $psqlExe -d $env:DATABASE_URL -v ON_ERROR_STOP=1 -c 'CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON session (expire);'
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
  Write-Host "psql.exe not found, so session table was not auto-created. If login fails, create the session table manually." -ForegroundColor Yellow
}

Write-Host "Importing bundled database_dump.json..." -ForegroundColor Cyan
node .\scripts\import-dump.mjs .\database_dump.json
if ($LASTEXITCODE -ne 0) {
  Write-Host "Database import failed. Check PostgreSQL connection and run again." -ForegroundColor Red
  exit $LASTEXITCODE
}

if ($SetupOnly) {
  Write-Host "Setup complete. Now run RUN_WINDOWS.bat." -ForegroundColor Green
  exit 0
}

& "$PSScriptRoot\start-all.ps1"
