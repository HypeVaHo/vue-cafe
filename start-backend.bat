@echo off
chcp 65001 >nul
title StudFood - backend + tunnel + auto-recovery
setlocal enabledelayedexpansion

:: ============================================================
::  start-backend.bat - one-click launch of the whole backend
:: ------------------------------------------------------------
::  1. Checks Node.js / dependencies / SQL (server\.env)
::  2. Starts backend (node server/index.js) and waits for health
::  3. Starts server-guard.ps1 - it creates the tunnel, rewrites
::     public/app-config.js and pushes to GitHub until the site
::     on GitHub Pages works with the live API
::  4. Prints status and keeps watching (Ctrl+C to stop)
::
::  Manual one-shot check:  tools\status.ps1
::  Guard log:              server-guard.log
:: ============================================================

set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
cd /d "%PROJECT_DIR%"

set "LOGDIR=%PROJECT_DIR%\logs"
set "GUARD_LOG=%LOGDIR%\guard-run.log"
set "GUARD_PID=%PROJECT_DIR%\guard.pid"

echo ============================================================
echo   StudFood - full backend start
echo   %DATE% %TIME%
echo   Project: %PROJECT_DIR%
echo ============================================================
echo.

if not exist "%LOGDIR%" mkdir "%LOGDIR%" >nul 2>&1

:: ---------- [1/6] Node.js ----------
echo [1/6] Node.js check...
where node >nul 2>&1
if errorlevel 1 (
    echo   [ERROR] Node.js not found in PATH.
    echo   Install Node.js LTS: https://nodejs.org/
    pause
    exit /b 1
)
for /f "delims=" %%v in ('node -v') do set "NODE_VER=%%v"
echo   Node.js !NODE_VER! - OK
echo.
:: ---------- [2/6] Dependencies ----------
echo [2/6] Dependencies check...
if not exist "%PROJECT_DIR%\node_modules\express\package.json" (
    echo   node_modules is missing - running "npm install" ^(may take a few minutes^)...
    call npm install
    if errorlevel 1 (
        echo   [ERROR] npm install failed. Check your internet connection.
        pause
        exit /b 1
    )
)
if not exist "%PROJECT_DIR%\node_modules\mssql\package.json" (
    echo   [WARN] mssql package not installed - database routes will fail.
)
echo   Dependencies - OK
echo.

:: ---------- [3/6] Backend ----------
echo [3/6] Backend on port 3000...
set "PORT_BUSY="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:"LISTENING" ^| findstr /c:":3000 "') do set "PORT_BUSY=%%p"
if defined PORT_BUSY (
    echo   Port 3000 already in use ^(PID !PORT_BUSY!^) - reusing it.
) else (
    echo   Starting: node server/index.js
    start "StudFood-backend" /B node server\index.js
)
echo   Waiting for /api/health...
set "HEALTH=0"
for /l %%i in (1,1,15) do (
    if "!HEALTH!"=="0" (
        for /f "usebackq delims=" %%r in (`powershell -NoProfile -Command ^
            "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 4 -Uri 'http://localhost:3000/api/health'; if ($r.Content -match '\"status\":\"ok\"') { 'OK' } else { 'NO' } } catch { 'NO' }"`) do (
            if "%%r"=="OK" set "HEALTH=1"
        )
        if "!HEALTH!"=="0" timeout /t 2 /nobreak >nul
    )
)
if "!HEALTH!"=="1" (
    echo   Backend is up - OK
) else (
    echo   [WARN] Backend did not answer /api/health.
    echo          Check SQL Server settings in server\.env and logs\backend.err.log
    echo          The guard will keep retrying automatically.
)
echo.

:: ---------- [4/6] Guard (tunnel + app-config + GitHub) ----------
echo [4/6] Starting guard ^(server-guard.ps1^)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%\tools\ensure-guard.ps1"
echo.

:: ---------- [5/6] Wait until tunnel + site really work ----------
echo [5/6] Waiting for a working tunnel and deployed site...
set "MAX_TRIES=24"
set "READY=0"
if not exist "%PROJECT_DIR%\tools\status.ps1" (
    echo   [WARN] tools\status.ps1 not found - skipping deep checks.
    set "READY=1"
)
for /l %%i in (1,1,%MAX_TRIES%) do (
    if "!READY!"=="0" (
        call :read_status
        echo   [%%i/%MAX_TRIES%] backend=!SN_BACKEND! tunnel=!SN_TUNNEL! site=!SN_SITE! config=!SN_CFG! api=!SN_API!
        if "!SN_BACKEND!"=="OK" if "!SN_TUNNEL!"=="OK" if "!SN_SITE!"=="OK" if "!SN_CFG!"=="OK" set "READY=1"
        if "!READY!"=="0" timeout /t 15 /nobreak >nul
    )
)
echo.
if "!READY!"=="1" (
    echo   EVERYTHING WORKS:
    echo     API  : !SN_API!/api
    echo     Site : https://hypevaho.github.io/vue-cafe/
) else (
    echo   [WARN] Not everything is up yet.
    echo          The guard keeps fixing it in background - see server-guard.log
)
echo.

:: ---------- [6/6] Watch loop ----------
echo [6/6] Monitoring every 30s. Press Ctrl+C to stop.
echo.
:loop
timeout /t 30 /nobreak >nul
call :read_status
echo [%TIME%] backend=!SN_BACKEND! tunnel=!SN_TUNNEL! site=!SN_SITE! config=!SN_CFG! guard=!SN_GUARD! api=!SN_API!
if "!SN_BACKEND!"=="FAIL" (
    echo   backend is down - restarting...
    start "StudFood-backend" /B node server\index.js
    timeout /t 3 /nobreak >nul
)
if "!SN_GUARD!"=="DEAD" (
    echo   guard is down - restarting...
    powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%\tools\ensure-guard.ps1"
    timeout /t 3 /nobreak >nul
)
goto :loop

:: ------------------------------------------------------------
::  helper: read status.ps1 output into SN_* variables
:: ------------------------------------------------------------
:read_status
set "SN_BACKEND="
set "SN_TUNNEL="
set "SN_SITE="
set "SN_CFG="
set "SN_GUARD="
set "SN_API="
for /f "usebackq tokens=1,* delims==" %%k in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%\tools\status.ps1"`) do (
    if "%%k"=="BACKEND" set "SN_BACKEND=%%l"
    if "%%k"=="TUNNEL" set "SN_TUNNEL=%%l"
    if "%%k"=="SITE" set "SN_SITE=%%l"
    if "%%k"=="SITECONFIG" set "SN_CFG=%%l"
    if "%%k"=="GUARD" set "SN_GUARD=%%l"
    if "%%k"=="API" set "SN_API=%%l"
)
exit /b 0
