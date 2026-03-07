Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

Dim baseDir, logFile
baseDir = "C:\Users\User\Documents\repository\ccproxy"
logFile = baseDir & "\ccproxy-startup.log"

' Start cloudflared with auto-restart (invisible)
WshShell.Run "cmd /c ""cd /d " & baseDir & " && scripts\restart-loop.bat cloudflared >> ccproxy-startup.log 2>&1""", 0, False
