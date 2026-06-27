@echo off
cd /d "%~dp0"
title WhatsApp Daily Digest

if not exist "node_modules" (
  call INSTALL_AND_START.bat
  exit /b
)

start "" /b node.exe --import tsx src\server.ts
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:3210"
echo WhatsApp Daily Digest is running.
echo Keep this window open. Press any key to stop it.
pause >nul
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3210" ^| findstr "LISTENING"') do taskkill /PID %%P /F >nul 2>nul
