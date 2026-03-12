@echo off
:: run-ccproxy.bat — Wrapper for scheduled task: kill stale process, restart loop, log output

set BASE_DIR=C:\Users\User\Documents\repository\ccproxy
set BUN_EXE=C:\Users\User\.bun\bin\bun.exe
set LOG_FILE=%BASE_DIR%\ccproxy-startup.log

:: Kill any existing bun process on port 8082 to avoid EADDRINUSE
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8082" ^| findstr "LISTENING"') do (
    echo [%date% %time%] Killing stale process PID %%a >> "%LOG_FILE%"
    taskkill /PID %%a /F >nul 2>&1
)

:: Wait for port to be released
timeout /t 2 /nobreak >nul

:loop
echo [%date% %time%] Starting ccproxy... >> "%LOG_FILE%"
cd /d "%BASE_DIR%"
"%BUN_EXE%" run index.ts >> "%LOG_FILE%" 2>&1
echo [%date% %time%] ccproxy exited (%ERRORLEVEL%), restarting in 5s... >> "%LOG_FILE%"
timeout /t 5 /nobreak >nul
goto loop
