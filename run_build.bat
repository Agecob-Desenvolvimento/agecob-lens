@echo off
set APP_ENV=production

echo [build] Installing frontend dependencies...
cd agecob-lens
call npm install
if errorlevel 1 goto :err

echo [build] Building frontend (production)...
call npm run build
if errorlevel 1 goto :err
cd ..

echo [build] Starting backend on 0.0.0.0:8000 ...
start "Backend-build" cmd /k "set APP_ENV=production && python -m uvicorn main:app --host 0.0.0.0 --port 8000"

echo [build] Serving frontend preview on 0.0.0.0:80 ...
start "Frontend-build" cmd /k "cd agecob-lens && npm run preview -- --host 0.0.0.0 --port 80"

echo [build] Backend  http://192.168.0.20:8000
echo [build] Frontend http://192.168.0.20/
goto :eof

:err
echo.
echo [build] FAILED - veja erro acima
echo.
pause
exit /b 1
