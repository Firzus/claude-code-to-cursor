@echo off
echo Starting ccproxy + Cloudflare tunnel...

:: Start the proxy (full path to bun)
start "ccproxy" /MIN cmd /c "cd /d C:\Users\User\Documents\repository\ccproxy && C:\Users\User\.bun\bin\bun.exe run index.ts"

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
