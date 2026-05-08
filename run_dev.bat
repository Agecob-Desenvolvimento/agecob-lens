@echo off
set APP_ENV=dev

echo [dev] Starting backend on 0.0.0.0:8000 ...
start "Backend-dev" cmd /k "set APP_ENV=dev && "C:\Users\Edson Vitor TI\AppData\Local\Python\pythoncore-3.14-64\python.exe" -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

echo [dev] Starting frontend on :5173 ...
start "Frontend-dev" cmd /k "cd agecob-lens && npm run dev:staging"
