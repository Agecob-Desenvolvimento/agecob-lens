@echo off
echo [stop] Matando processos nas portas 80, 5173, 8000, 8001, 8080...
powershell -NoProfile -ExecutionPolicy Bypass -Command "& '%~dp0scripts\dev-stop.ps1' -Ports 80,5173,8000,8001,8080"
echo.
echo [stop] Portas em uso apos cleanup:
netstat -ano | findstr LISTENING | findstr ":80 :5173 :8000 :8001 :8080"
echo.
pause
