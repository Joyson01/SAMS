@echo off
REM ==============================================================================
REM JOJIPA-SAMS — Smart Attendance Management System
REM Windows Full-Stack Launcher
REM ==============================================================================

echo ============================================================
echo                       JOJIPA-SAMS                          
echo           Smart Attendance Management System               
echo ============================================================
echo.

if not exist .env (
    if exist .env.example (
        echo [INFO] Copying .env.example to .env...
        copy .env.example .env
    )
)

if not exist .venv (
    echo [INFO] Creating Python virtual environment...
    python -m venv .venv
    call .venv\Scripts\activate
    pip install -r requirements.txt
) else (
    call .venv\Scripts\activate
)

echo [1/3] Initializing Database...
python -c "import asyncio; from backend.app.database.session import init_db_schema; asyncio.run(init_db_schema())"

echo [2/3] Starting Backend Server...
start "JOJIPA-SAMS Backend" cmd /k "python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload"

echo [3/3] Starting Frontend Dev Server...
cd frontend
start "JOJIPA-SAMS Frontend" cmd /k "pnpm run dev --host 0.0.0.0 --port 5173"
cd ..

echo.
echo ============================================================
echo 🎉 JOJIPA-SAMS Launched!
echo   Web App  : https://localhost:5173
echo   Backend  : http://localhost:8000
echo   API Docs : http://localhost:8000/docs
echo ============================================================
pause
