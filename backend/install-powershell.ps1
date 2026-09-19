# Jishora Backend - PowerShell Installation Script
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  JISHORA BACKEND - INSTALLING" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Navigate to backend directory
Set-Location -Path $PSScriptRoot

Write-Host "Installing dependencies..." -ForegroundColor Yellow
Write-Host ""

# Install using npm from full path
& "npm" "install"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  SUCCESS! Dependencies Installed" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Update database password in .env file" -ForegroundColor White
    Write-Host "2. Run: .\start-powershell.ps1" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "  ERROR: Installation Failed" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Try running in Command Prompt instead:" -ForegroundColor Yellow
    Write-Host "  cd d:\Jishora\backend" -ForegroundColor White
    Write-Host "  npm install" -ForegroundColor White
    Write-Host ""
}

Read-Host "Press Enter to close"
