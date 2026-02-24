$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument """C:\Users\User\Documents\repository\ccproxy\scripts\start-ccproxy.vbs"""
$trigger = New-ScheduledTaskTrigger -AtLogon

Register-ScheduledTask -TaskName "ccproxy" -Action $action -Trigger $trigger -Description "Start ccproxy and Cloudflare tunnel at login (invisible)" -Force

Write-Host "Scheduled task 'ccproxy' updated successfully."
