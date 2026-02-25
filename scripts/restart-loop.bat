@echo off
:: Auto-restart loop for ccproxy
:: Restarts bun if it crashes, with a 3-second delay between restarts

:loop
echo [%date% %time%] Starting ccproxy...
C:\Users\User\.bun\bin\bun.exe run index.ts
echo [%date% %time%] ccproxy exited with code %errorlevel%, restarting in 3 seconds...
timeout /t 3 /nobreak >nul
goto loop
