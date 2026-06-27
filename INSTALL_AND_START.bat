@echo off
setlocal
cd /d "%~dp0"
title WhatsApp Daily Digest Setup

echo.
echo ==========================================
echo   WhatsApp Daily Digest - Easy Setup
echo ==========================================
echo.

where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  where winget.exe >nul 2>nul
  if errorlevel 1 (
    echo Please install Node.js LTS from https://nodejs.org and run this file again.
    pause
    exit /b 1
  )
  echo Installing Node.js LTS...
  winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  if errorlevel 1 (
    echo Node.js installation failed. Install it from https://nodejs.org and retry.
    pause
    exit /b 1
  )
  set "PATH=%ProgramFiles%\nodejs;%PATH%"
)

echo Installing application dependencies...
call npm.cmd install
if errorlevel 1 goto :failed

echo Installing the private Chromium browser...
call npx.cmd playwright install chromium
if errorlevel 1 goto :failed

if not exist ".env" copy /y ".env.example" ".env" >nul
if not exist "config.json" copy /y "config.example.json" "config.json" >nul
if not exist "logs" mkdir "logs"

echo Starting the dashboard...
start "" /b node.exe --import tsx src\server.ts
timeout /t 4 /nobreak >nul
start "" "http://127.0.0.1:3210"

echo.
echo Setup complete. The dashboard should now be open.
echo Keep this window open while using the application.
echo Press any key to stop the dashboard.
pause >nul
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3210" ^| findstr "LISTENING"') do taskkill /PID %%P /F >nul 2>nul
exit /b 0

:failed
echo.
echo Setup failed. Check your internet connection, then run this file again.
pause
exit /b 1
