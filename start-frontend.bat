@echo off
cd /d %~dp0
echo Starting frontend server on port 3000...
npx http-server -p 3000
pause
