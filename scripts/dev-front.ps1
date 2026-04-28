$projectRoot = Split-Path -Parent $PSScriptRoot
$frontendRoot = Join-Path $projectRoot "agecob-lens"

Set-Location $frontendRoot

Write-Host "Subindo frontend Vite..." -ForegroundColor Cyan
npm run dev
