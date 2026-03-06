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
set EXIT_CODE=%errorlevel%
echo [%date% %time%] ccproxy exited (%EXIT_CODE%), restarting in 5s...
:: ping -n 6 waits ~5 seconds (works without interactive console)
ping -n 6 127.0.0.1 >nul
goto loop_ccproxy

:loop_cloudflared
echo [%date% %time%] Starting cloudflared...
"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --config C:\Users\User\.cloudflared\config.yml run
set EXIT_CODE=%errorlevel%
echo [%date% %time%] cloudflared exited (%EXIT_CODE%), restarting in 5s...
ping -n 6 127.0.0.1 >nul
goto loop_cloudflared
