@echo off
title Risen Tower Defence - dev server
cd /d "%~dp0"
where node >/dev/null 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo Install the LTS version from https://nodejs.org, then run this file again.
  start "" https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing packages. This only happens the first time...
  call npm install
  if errorlevel 1 ( pause & exit /b 1 )
)
echo Starting the game at http://localhost:5173 - close this window to stop it.
call npm run dev -- --open
pause
