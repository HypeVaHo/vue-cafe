@echo off
chcp 65001 >nul
setlocal
title СтудFood — остановка бэкенда

REM ============================================================
REM  stop-backend.bat — полная остановка бэкенда, сторожа и туннеля.
REM ============================================================

set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
cd /d "%PROJECT_DIR%"

echo ============================================================
echo   СТУДFOOD — ОСТАНОВКА
echo ============================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%\tools\stop.ps1"

echo.
echo Готово. Если окна «studfood-backend» и «studfood-guard» ещё открыты,
echo их можно просто закрыть (процессы уже завершены).
echo.
pause