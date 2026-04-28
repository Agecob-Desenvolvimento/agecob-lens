param(
    [int[]]$Ports = @(5173, 8080, 8000)
)

Write-Host "Parando processos de desenvolvimento..." -ForegroundColor Cyan

$pidsToStop = @()
foreach ($port in $Ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connections) {
        $pidsToStop += $connections | Select-Object -ExpandProperty OwningProcess
    }
}

$pidsToStop = $pidsToStop | Sort-Object -Unique

if (-not $pidsToStop -or $pidsToStop.Count -eq 0) {
    Write-Host "Nenhum processo encontrado nas portas: $($Ports -join ', ')." -ForegroundColor Yellow
    exit 0
}

foreach ($procId in $pidsToStop) {
    try {
        Stop-Process -Id $procId -Force -ErrorAction Stop
        Write-Host "Processo finalizado: PID $procId" -ForegroundColor Green
    } catch {
        Write-Host "Falha ao finalizar PID ${procId}: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "Concluido." -ForegroundColor Cyan
