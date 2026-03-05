@echo off
:: Auto-restart loop. Usage: restart-loop.bat <ccproxy|cloudflared>
setlocal

set NAME=%~1

if "%NAME%"=="ccproxy" goto loop_ccproxy
if "%NAME%"=="cloudflared" goto loop_cloudflared
echo Usage: restart-loop.bat ^<ccproxy^|cloudflared^>
exit /b 1

:loop_ccproxy
echo [%date% %time%] Starting ccproxy...
C:\Users\User\.bun\bin\bun.exe run index.ts
echo [%date% %time%] ccproxy exited (%errorlevel%), restarting in 5s...
timeout /t 5 /nobreak >nul
goto loop_ccproxy

:loop_cloudflared
echo [%date% %time%] Starting cloudflared...
"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --config C:\Users\User\.cloudflared\config.yml run
echo [%date% %time%] cloudflared exited (%errorlevel%), restarting in 5s...
timeout /t 5 /nobreak >nul
goto loop_cloudflared
