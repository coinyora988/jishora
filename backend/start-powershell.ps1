# Jishora Backend - PowerShell Start Script
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  JISHORA BACKEND SERVER" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Navigate to backend directory
Set-Location -Path $PSScriptRoot

Write-Host "Starting server on port 5000..." -ForegroundColor Yellow
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Gray
Write-Host ""

# Start the server using node from full path
& "node" "src/server.js"
