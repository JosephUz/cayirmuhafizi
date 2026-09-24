@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js bulunamadi. Once Node.js kurun.
  pause
  exit /b 1
)
if not defined PORT set PORT=5174
start "" "http://localhost:%PORT%"
node server.mjs
pause
