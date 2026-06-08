@echo off
setlocal
cd /d "%~dp0"
set "APP_ENV=local"
set "VENV_PY=%~dp0.venv\Scripts\python.exe"

echo [dev] 1/3 Verificando .venv...
if not exist "%VENV_PY%" (
    echo [dev]     .venv ausente, criando...
    py -3 -m venv .venv 2>nul || python -m venv .venv || (echo ERRO: nao consegui criar .venv & pause & exit /b 1)
)

echo [dev] 2/3 Verificando dependencias backend...
"%VENV_PY%" -c "import uvicorn" 2>nul || (
    echo [dev]     instalando requirements.txt...
    "%VENV_PY%" -m pip install -r requirements.txt || (echo ERRO no pip install & pause & exit /b 1)
)

echo [dev] 3/3 Verificando dependencias frontend...
if not exist "agecob-lens\node_modules" (
    echo [dev]     rodando npm install...
    pushd agecob-lens
    call npm install || (echo ERRO no npm install & popd & pause & exit /b 1)
    popd
)

echo.
echo [dev] Subindo BACKEND (reload) -^> http://127.0.0.1:8000
start "AgDash Backend (dev)" cmd /k ""%VENV_PY%" -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload"

echo [dev] Subindo FRONTEND (Vite) -^> http://localhost:5173
start "AgDash Frontend (dev)" cmd /k "cd agecob-lens && npm run dev"

echo.
echo ============================================================
echo  DEV NO AR
echo    Abra:  http://localhost:5173      ^<== use ESTE em dev
echo    LAN:   veja a linha "Network:" no terminal do Vite
echo    API:   /api  -^>  127.0.0.1:8000   (proxy do Vite)
echo.
echo  NAO use :8000 em dev (e o backend cru, sem HMR).
echo  Para parar tudo:  stop_all.bat
echo ============================================================
echo.
