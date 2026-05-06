@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\reset-database-from-dump.ps1"
pause
