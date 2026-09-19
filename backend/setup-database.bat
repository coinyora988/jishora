@echo off
echo ========================================
echo   JISHORA DATABASE SETUP
echo ========================================
echo.
echo This will help you set up the database and create an admin user.
echo.
echo Please have your MySQL root password ready.
echo.
pause

echo.
echo Step 1: Connecting to MySQL...
echo.
echo Please enter your MySQL root password when prompted.
echo.

mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS jishora_db; USE jishora_db; SOURCE d:/Jishora/backend/database_schema.sql;"

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Could not connect to MySQL or create database.
    echo.
    echo Please make sure:
    echo 1. MySQL is running
    echo 2. You entered the correct password
    echo 3. MySQL is installed
    echo.
    pause
    exit /b 1
)

echo.
echo Step 2: Creating admin user...
echo.

mysql -u root -p jishora_db -e "INSERT INTO users (username, email, password, role, is_vip, vip_level, status, created_at) VALUES ('admin', 'admin@jishora.com', '$2a$10$YourHashedPasswordHere92YourHashedPasswordHere92YourHashedPassword', 'admin', 1, 3, 'active', NOW()); INSERT INTO wallets (user_id, main_balance, frozen_balance, total_earned, total_withdrawn, created_at) VALUES (LAST_INSERT_ID(), 0, 0, 0, 0, NOW());"

echo.
echo ========================================
echo   SETUP COMPLETE!
echo ========================================
echo.
echo Admin Login Credentials:
echo   Email:    admin@jishora.com
echo   Password: admin123
echo.
echo Admin Panel: http://localhost:3000/admin/login.html
echo.
echo ========================================
pause
