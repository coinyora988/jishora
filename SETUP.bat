@echo off
echo ========================================
echo   JISHORA PLATFORM - SETUP SCRIPT
echo ========================================
echo.

echo Step 1: Installing Backend Dependencies...
cd /d %~dp0\backend
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install backend dependencies
    pause
    exit /b 1
)
echo Backend dependencies installed successfully!
echo.

echo Step 2: Checking Database...
echo Please make sure MySQL is running and you have created the database:
echo   1. Open MySQL: mysql -u root -p
echo   2. CREATE DATABASE jishora_db;
echo   3. USE jishora_db;
echo   4. SOURCE d:\Jishora\backend\database_schema.sql;
echo.
echo Press any key once database is ready...
pause

echo Step 3: Setup complete!
echo.
echo ========================================
echo   NEXT STEPS:
echo ========================================
echo.
echo 1. Update database password in: backend\.env
echo    (Open backend\.env and set DB_PASSWORD)
echo.
echo 2. Start Backend Server:
echo    Double-click: backend\start.bat
echo.
echo 3. Start Frontend Server:
echo    Double-click: start-frontend.bat
echo.
echo 4. Open in browser:
echo    http://localhost:3000/index.html
echo.
echo ========================================
pause
