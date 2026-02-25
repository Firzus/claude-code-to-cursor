@echo off
echo Starting ccproxy + Cloudflare tunnel...

:: Truncate startup log if over 5MB
set "LOGFILE=C:\Users\User\Documents\repository\ccproxy\ccproxy-startup.log"
if exist "%LOGFILE%" (
    for %%A in ("%LOGFILE%") do (
        if %%~zA GTR 5242880 (
            echo [%date% %time%] Truncating startup log (was %%~zA bytes) > "%LOGFILE%"
        )
    )
)

:: Start the proxy with auto-restart loop (full path to bun)
start "ccproxy" /MIN cmd /c "cd /d C:\Users\User\Documents\repository\ccproxy && scripts\restart-loop.bat"

:: Wait for proxy to be ready
timeout /t 3 /nobreak >nul

:: Start the Cloudflare tunnel
start "cloudflared" /MIN cmd /c "cloudflared tunnel --config C:\Users\User\.cloudflared\config.yml run"

echo.
echo ccproxy is running on http://localhost:8082
echo Tunnel is running on https://ccproxy.lprieu.dev
echo.
echo Both processes are running in minimized windows.
echo Close those windows to stop.
