@echo off
setlocal
set NSSM=C:\nssm\nssm.exe

echo Atualizando Agecob Dashboard...

cd /d C:\agecob || (echo ERRO: C:\agecob nao existe & pause & exit /b 1)

echo [1/5] Baixando atualizacoes do GitHub...
git pull || (echo ERRO no git pull & pause & exit /b 1)

echo [2/5] Instalando dependencias Python...
pip install -r requirements.txt --quiet || (echo ERRO no pip install & pause & exit /b 1)

echo [3/5] Buildando frontend...
cd agecob-lens || (echo ERRO: agecob-lens nao existe & pause & exit /b 1)
call npm install --quiet || (echo ERRO no npm install & cd .. & pause & exit /b 1)
call npm run build || (echo ERRO no npm run build & cd .. & pause & exit /b 1)
cd ..

echo [4/5] Validando build...
if not exist agecob-lens\dist\index.html (
    echo ERRO: agecob-lens\dist\index.html nao foi gerado
    pause
    exit /b 1
)
echo Build OK. index.html atualizado em:
dir agecob-lens\dist\index.html | findstr index.html

echo [5/5] Reiniciando servico NSSM...
if not exist "%NSSM%" (
    echo ERRO: NSSM nao encontrado em %NSSM%
    pause
    exit /b 1
)
rem Backend FastAPI serve API + dist/ (StaticFiles). Porta unica 8000.
"%NSSM%" set AgecobAPI AppDirectory C:\agecob
"%NSSM%" set AgecobAPI AppParameters "-m uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4"
rem NSSM antigo nao tem AppKillProcessTree. AppStopMethodSkip=0 = tenta CTRL_C+WM_CLOSE+TerminateProcess em sequencia.
"%NSSM%" set AgecobAPI AppStopMethodSkip 0
"%NSSM%" set AgecobAPI AppStopMethodConsole 5000
"%NSSM%" set AgecobAPI AppStopMethodWindow 5000
"%NSSM%" set AgecobAPI AppStopMethodThreads 5000

rem Para se estiver rodando, mata orfaos na porta 8000 (workers que ficaram), depois start.
"%NSSM%" stop AgecobAPI >nul 2>&1
timeout /t 3 /nobreak >nul
for /f "tokens=5" %%P in ('netstat -ano ^| findstr LISTENING ^| findstr ":8000"') do (
    echo Matando processo orfao PID %%P na porta 8000...
    taskkill /F /PID %%P >nul 2>&1
)
timeout /t 1 /nobreak >nul
"%NSSM%" start AgecobAPI
timeout /t 3 /nobreak >nul

echo.
echo Status do servico:
"%NSSM%" status AgecobAPI
netstat -ano | findstr LISTENING | findstr ":8000"

echo.
echo Pronto. Dashboard atualizado.
pause
