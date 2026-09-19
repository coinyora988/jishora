# Jishora Platform Startup Script
Write-Host "🚀 Starting Jishora Platform..." -ForegroundColor Cyan

# Kill any existing Node processes to avoid port conflicts
Write-Host "Stopping any existing servers..." -ForegroundColor Yellow
Stop-Process -Name node -Force -ErrorAction SilentlyContinue

# Wait a moment for ports to be released
Start-Sleep -Seconds 2

# Start Backend Server
Write-Host "Starting Backend Server on port 5000..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; node src\server.js"

# Wait for backend to initialize
Start-Sleep -Seconds 3

# Start Frontend Server
Write-Host "Starting Frontend Server on port 3000..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass; npx http-server -p 3000"

Start-Sleep -Seconds 2

Write-Host ""
Write-Host "✅ Jishora Platform Started!" -ForegroundColor Green
Write-Host ""
Write-Host "📱 Frontend: http://localhost:3000" -ForegroundColor Cyan
Write-Host "🔧 Backend API: http://localhost:5000" -ForegroundColor Cyan
Write-Host "👤 Admin Panel: http://localhost:3000/admin/login.html" -ForegroundColor Cyan
Write-Host "⚙️  Setup Admin: http://localhost:3000/create-admin.html" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press any key to exit (servers will keep running)..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
