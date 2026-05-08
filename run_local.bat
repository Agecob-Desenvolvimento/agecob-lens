@echo off
set APP_ENV=local

echo [local] Starting backend on 127.0.0.1:8000 ...
start "Backend" cmd /k "set APP_ENV=local && "C:\Users\Edson Vitor TI\AppData\Local\Python\pythoncore-3.14-64\python.exe" -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload"

echo [local] Starting frontend on :5173 ...
start "Frontend" cmd /k "cd agecob-lens && npm run dev:local"
