# install-task.ps1 — Register scheduled tasks for ccproxy + cloudflared at login
# Run as Administrator: powershell -ExecutionPolicy Bypass -File scripts\install-task.ps1

$baseDir = "C:\Users\User\Documents\repository\ccproxy"
$bunExe = "C:\Users\User\.bun\bin\bun.exe"
$cloudflaredExe = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
$cloudflaredConfig = "C:\Users\User\.cloudflared\config.yml"

$trigger = New-ScheduledTaskTrigger -AtLogon
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

# ccproxy task — runs bun directly (no restart loop, service should not crash)
$ccproxyAction = New-ScheduledTaskAction `
    -Execute $bunExe `
    -Argument "run index.ts" `
    -WorkingDirectory $baseDir
Register-ScheduledTask `
    -TaskName "ccproxy" `
    -Action $ccproxyAction `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Start ccproxy at login" `
    -Force
Write-Host "[OK] Scheduled task 'ccproxy' registered."

# cloudflared task — runs cloudflared tunnel directly
$cfAction = New-ScheduledTaskAction `
    -Execute $cloudflaredExe `
    -Argument "tunnel --config $cloudflaredConfig run" `
    -WorkingDirectory $baseDir
Register-ScheduledTask `
    -TaskName "cloudflared-tunnel" `
    -Action $cfAction `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Start Cloudflare tunnel at login" `
    -Force
Write-Host "[OK] Scheduled task 'cloudflared-tunnel' registered."

Write-Host ""
Write-Host "Both tasks will start at next login."
Write-Host "To start now:  schtasks /Run /TN ccproxy && schtasks /Run /TN cloudflared-tunnel"
