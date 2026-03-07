$baseDir = "C:\Users\User\Documents\repository\ccproxy\scripts"
$trigger = New-ScheduledTaskTrigger -AtLogon
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)

# ccproxy task
$ccproxyAction = New-ScheduledTaskAction -Execute "wscript.exe" -Argument """$baseDir\start-ccproxy.vbs"""
Register-ScheduledTask -TaskName "ccproxy" -Action $ccproxyAction -Trigger $trigger -Settings $settings -Description "Start ccproxy at login (invisible)" -Force
Write-Host "Scheduled task 'ccproxy' updated successfully."

# cloudflared task
$cfAction = New-ScheduledTaskAction -Execute "wscript.exe" -Argument """$baseDir\start-cloudflared.vbs"""
Register-ScheduledTask -TaskName "cloudflared-tunnel" -Action $cfAction -Trigger $trigger -Settings $settings -Description "Start Cloudflare tunnel at login (invisible)" -Force
Write-Host "Scheduled task 'cloudflared-tunnel' updated successfully."
