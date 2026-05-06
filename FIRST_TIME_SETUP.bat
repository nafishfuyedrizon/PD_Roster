@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\auto-setup-run.ps1" -SetupOnly
pause
