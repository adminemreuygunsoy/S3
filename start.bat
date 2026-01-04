@echo off
setlocal

REM --- Configuration ---
set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

echo ==========================================
echo    Archive Viewer - Startup Script
echo ==========================================

REM 1. Check for Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM 2. Install dependencies if missing
if not exist "node_modules" (
    echo [INFO] node_modules not found. Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
) else (
    echo [INFO] Dependencies check passed.
)

REM 3. Optional: Run Indexer if database is missing
if not exist "index.db" (
    echo [INFO] index.db not found. Running initial index...
    echo [INFO] This might take a while depending on the number of files...
    call npm run index
)

REM 4. Start Electron Application
echo [INFO] Starting Electron Application...
call npm start

endlocal
