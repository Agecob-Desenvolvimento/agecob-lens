@echo off
setlocal

set "ROOT_DIR=C:\agecob"
set "FRONTEND_DIR=%ROOT_DIR%"
set "NSSM_EXE=C:\nssm\nssm.exe"
set "SERVICE_NAME=AgecobAPI"

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Solicitando permissao de administrador...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo Atualizando Agecob Dashboard (monorepo)...
echo.

if not exist "%ROOT_DIR%\main.py" (
  echo [ERRO] Diretorio do monorepo nao encontrado ou incompleto: %ROOT_DIR%
  goto :fail
)

if not exist "%FRONTEND_DIR%\package.json" (
  echo [ERRO] Frontend nao encontrado em: %FRONTEND_DIR%
  goto :fail
)

if not exist "%NSSM_EXE%" (
  echo [ERRO] NSSM nao encontrado em: %NSSM_EXE%
  goto :fail
)

cd /d "%ROOT_DIR%" || goto :fail

echo [1/4] Baixando atualizacoes do GitHub...
git pull origin main
if errorlevel 1 goto :fail

echo [2/4] Instalando dependencias Python...
python -m pip install -r requirements.txt --quiet
if errorlevel 1 goto :fail

echo [3/4] Buildando frontend...
cd /d "%FRONTEND_DIR%" || goto :fail
npm install --quiet
if errorlevel 1 goto :fail
npm run build
if errorlevel 1 goto :fail

echo [4/4] Reiniciando API...
"%NSSM_EXE%" restart "%SERVICE_NAME%"
if errorlevel 1 goto :fail

echo.
echo Pronto. Dashboard atualizado com sucesso.
pause
exit /b 0

:fail
echo.
echo Falha na atualizacao. Revise os logs acima.
pause
exit /b 1
