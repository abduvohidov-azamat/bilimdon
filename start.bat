@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo Kutubxonalar o'rnatilmoqda...
  call npm install
)
start "" http://localhost:3000/host.html
node server.js
pause
