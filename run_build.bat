@echo off
setlocal
cd /d "%~dp0"
set "APP_ENV=production"
set "VENV_PY=%~dp0.venv\Scripts\python.exe"

echo [build] 1/4 Verificando .venv...
if not exist "%VENV_PY%" (
    echo [build]     .venv ausente, criando...
    py -3 -m venv .venv 2>nul || python -m venv .venv || (echo ERRO ao criar .venv & pause & exit /b 1)
)

echo [build] 2/4 Verificando dependencias backend...
"%VENV_PY%" -c "import uvicorn" 2>nul || (
    echo [build]     instalando requirements.txt...
    "%VENV_PY%" -m pip install -r requirements.txt || (echo ERRO no pip install & pause & exit /b 1)
)

echo [build] 3/4 Buildando frontend (producao)...
pushd agecob-lens
call npm install --no-audit --no-fund || (echo ERRO no npm install & popd & pause & exit /b 1)
call npm run build || (echo ERRO no npm run build & popd & pause & exit /b 1)
popd

if not exist "agecob-lens\dist\index.html" (
    echo ERRO: agecob-lens\dist\index.html nao foi gerado
    pause
    exit /b 1
)

echo [build] 4/4 Subindo backend (serve API + dist) -^> http://0.0.0.0:8000
start "AgDash (build)" cmd /k ""%VENV_PY%" -m uvicorn main:app --host 0.0.0.0 --port 8000"

echo.
echo ============================================================
echo  BUILD NO AR  (porta unica)
echo    Abra:  http://localhost:8000
echo    LAN:   http://(IP-da-maquina):8000
echo.
echo  O backend serve a API E o frontend buildado (dist/).
echo  Nao ha Vite/HMR aqui - e o modo producao local.
echo  Para parar:  stop_all.bat
echo ============================================================
echo.
