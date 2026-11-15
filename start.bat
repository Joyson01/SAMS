@echo off
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Install Python 3.11-3.13 and Node.js 20+ with npm. Enable Python on PATH.
  exit /b 1
)
python scripts\devserver.py %*
exit /b %errorlevel%
