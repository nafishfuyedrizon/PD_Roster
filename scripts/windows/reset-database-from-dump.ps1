$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib.ps1"
$RepoRoot = Get-RepoRoot
Set-Location $RepoRoot
Load-DotEnv (Join-Path $RepoRoot ".env.local")

Write-Host "Re-pushing schema..." -ForegroundColor Cyan
$psqlExe = Get-ChildItem 'C:\Program Files\PostgreSQL' -Filter 'psql.exe' -Recurse -ErrorAction SilentlyContinue |
  Sort-Object FullName -Descending |
  Select-Object -First 1 -ExpandProperty FullName
if ($psqlExe) {
  Write-Host "Dropping transient session table before schema push..." -ForegroundColor Cyan
  & $psqlExe -d $env:DATABASE_URL -v ON_ERROR_STOP=1 -c 'DROP TABLE IF EXISTS "session";'
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Host "Renaming legacy PD registrar tables to PD-prefixed names..." -ForegroundColor Cyan
  & $psqlExe -d $env:DATABASE_URL -v ON_ERROR_STOP=1 -c @'
DO $$
BEGIN
  IF to_regclass('public.pd_duty_hour_totals') IS NULL AND to_regclass('public.ems_duty_logs') IS NOT NULL THEN
    ALTER TABLE "ems_duty_logs" RENAME TO "pd_duty_hour_totals";
  ELSIF to_regclass('public.pd_duty_hour_totals') IS NOT NULL AND to_regclass('public.ems_duty_logs') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'ems_duty_logs' AND relkind = 'v') THEN
      DROP VIEW "ems_duty_logs";
    ELSE
      DROP TABLE "ems_duty_logs";
    END IF;
  END IF;

  IF to_regclass('public.pd_discord_duty_events') IS NULL AND to_regclass('public.discord_duty_events') IS NOT NULL THEN
    ALTER TABLE "discord_duty_events" RENAME TO "pd_discord_duty_events";
  ELSIF to_regclass('public.pd_discord_duty_events') IS NOT NULL AND to_regclass('public.discord_duty_events') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'discord_duty_events' AND relkind = 'v') THEN
      DROP VIEW "discord_duty_events";
    ELSE
      DROP TABLE "discord_duty_events";
    END IF;
  END IF;

  IF to_regclass('public.pd_shift_configs') IS NULL AND to_regclass('public.shift_configs') IS NOT NULL THEN
    ALTER TABLE "shift_configs" RENAME TO "pd_shift_configs";
  ELSIF to_regclass('public.pd_shift_configs') IS NOT NULL AND to_regclass('public.shift_configs') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'shift_configs' AND relkind = 'v') THEN
      DROP VIEW "shift_configs";
    ELSE
      DROP TABLE "shift_configs";
    END IF;
  END IF;

  IF to_regclass('public.pd_duty_adjustments') IS NULL AND to_regclass('public.duty_adjustments') IS NOT NULL THEN
    ALTER TABLE "duty_adjustments" RENAME TO "pd_duty_adjustments";
  ELSIF to_regclass('public.pd_duty_adjustments') IS NOT NULL AND to_regclass('public.duty_adjustments') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'duty_adjustments' AND relkind = 'v') THEN
      DROP VIEW "duty_adjustments";
    ELSE
      DROP TABLE "duty_adjustments";
    END IF;
  END IF;
END $$;
'@
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

pnpm.cmd --filter @workspace/db run push
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ($psqlExe) {
  Write-Host "Ensuring session table exists..." -ForegroundColor Cyan
  & $psqlExe -d $env:DATABASE_URL -v ON_ERROR_STOP=1 -c 'CREATE TABLE IF NOT EXISTS session (sid varchar NOT NULL PRIMARY KEY, sess json NOT NULL, expire timestamp(6) NOT NULL);'
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  & $psqlExe -d $env:DATABASE_URL -v ON_ERROR_STOP=1 -c 'CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON session (expire);'
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "Re-importing database_dump.json..." -ForegroundColor Cyan
node .\scripts\import-dump.mjs .\database_dump.json
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Database import complete." -ForegroundColor Green
