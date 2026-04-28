$projectRoot = Split-Path -Parent $PSScriptRoot
$apiScript = Join-Path $PSScriptRoot "dev-api.ps1"
$frontScript = Join-Path $PSScriptRoot "dev-front.ps1"

Write-Host "Abrindo API e Frontend em novas janelas..." -ForegroundColor Cyan

Start-Process powershell -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-File", "`"$apiScript`"") -WorkingDirectory $projectRoot
Start-Process powershell -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-File", "`"$frontScript`"") -WorkingDirectory $projectRoot

Write-Host "API e Frontend iniciados." -ForegroundColor Green
