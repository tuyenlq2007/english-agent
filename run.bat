@echo off
setlocal

cd /d "%~dp0"
set "PORT=5173"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or is not available in PATH.
  echo Install the LTS version from https://nodejs.org/en/download
  echo Then close this window and run run.bat again.
  pause
  exit /b 1
)

start "" "http://127.0.0.1:%PORT%"
node server.js
