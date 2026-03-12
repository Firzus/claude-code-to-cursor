# install-task.ps1 — Register scheduled tasks for ccproxy + cloudflared at login
# Run as Administrator: powershell -ExecutionPolicy Bypass -File scripts\install-task.ps1

$baseDir = "C:\Users\User\Documents\repository\ccproxy"
$scriptsDir = "$baseDir\scripts"

$trigger = New-ScheduledTaskTrigger -AtLogon
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

# ccproxy task — wrapper handles port-kill, restart loop, and log redirection
$ccproxyAction = New-ScheduledTaskAction `
    -Execute "cmd.exe" `
    -Argument "/c `"$scriptsDir\run-ccproxy.bat`"" `
    -WorkingDirectory $baseDir
Register-ScheduledTask `
    -TaskName "ccproxy" `
    -Action $ccproxyAction `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Start ccproxy at login (with restart loop)" `
    -Force
Write-Host "[OK] Scheduled task 'ccproxy' registered."

# cloudflared task — wrapper handles restart loop and log redirection
$cfAction = New-ScheduledTaskAction `
    -Execute "cmd.exe" `
    -Argument "/c `"$scriptsDir\run-cloudflared.bat`"" `
    -WorkingDirectory $baseDir
Register-ScheduledTask `
    -TaskName "cloudflared-tunnel" `
    -Action $cfAction `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Start Cloudflare tunnel at login (with restart loop)" `
    -Force
Write-Host "[OK] Scheduled task 'cloudflared-tunnel' registered."

Write-Host ""
Write-Host "Both tasks will start at next login."
Write-Host "To start now:  schtasks /Run /TN ccproxy && schtasks /Run /TN cloudflared-tunnel"
