# Jishora Frontend - PowerShell Start Script
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  JISHORA FRONTEND SERVER" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Navigate to Jishora directory
Set-Location -Path $PSScriptRoot

Write-Host "Starting frontend server on port 3000..." -ForegroundColor Yellow
Write-Host ""
Write-Host "Access your app at: http://localhost:3000/index.html" -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Gray
Write-Host ""

# Start http-server
& "npx" "http-server" "-p" "3000"
