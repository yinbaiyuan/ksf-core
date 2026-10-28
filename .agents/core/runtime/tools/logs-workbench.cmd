@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0workbench-windows.ps1" -Action logs %*
if errorlevel 1 pause
