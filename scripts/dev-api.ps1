$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

Write-Host "Subindo API FastAPI..." -ForegroundColor Cyan
python main.py
