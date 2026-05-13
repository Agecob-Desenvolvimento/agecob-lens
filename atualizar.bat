@echo off
echo Atualizando Agecob Dashboard...

cd /d C:\agecob

echo [1/4] Baixando atualizacoes do GitHub...
git pull

echo [2/4] Instalando dependencias Python...
pip install -r requirements.txt --quiet

echo [3/4] Buildando frontend...
cd agecob-lens
npm install --quiet
npm run build
cd ..

echo [4/4] Reiniciando servicos NSSM...
rem Backend em 8001 com 4 workers (ajuste se a maquina tiver poucos cores).
C:\nssm\win64\nssm.exe set AgecobAPI AppParameters "-m uvicorn main:app --host 0.0.0.0 --port 8001 --workers 4"
C:\nssm\win64\nssm.exe restart AgecobAPI
C:\nssm\win64\nssm.exe restart AgecobFront

echo Pronto. Dashboard atualizado.
pause
