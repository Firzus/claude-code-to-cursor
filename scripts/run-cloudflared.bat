@echo off
:: run-cloudflared.bat — Wrapper for scheduled task: restart loop, log output

set BASE_DIR=C:\Users\User\Documents\repository\ccproxy
set CF_EXE=C:\Program Files (x86)\cloudflared\cloudflared.exe
set CF_CONFIG=C:\Users\User\.cloudflared\config.yml
set LOG_FILE=%BASE_DIR%\cloudflared-startup.log

:loop
echo [%date% %time%] Starting cloudflared... >> "%LOG_FILE%"
"%CF_EXE%" tunnel --config "%CF_CONFIG%" run >> "%LOG_FILE%" 2>&1
echo [%date% %time%] cloudflared exited (%ERRORLEVEL%), restarting in 5s... >> "%LOG_FILE%"
timeout /t 5 /nobreak >nul
goto loop
