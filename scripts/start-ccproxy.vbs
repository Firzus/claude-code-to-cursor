Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

Dim baseDir, logFile
baseDir = "C:\Users\User\Documents\repository\ccproxy"
logFile = baseDir & "\ccproxy-startup.log"

' Truncate startup log if over 5MB
If fso.FileExists(logFile) Then
    If fso.GetFile(logFile).Size > 5242880 Then
        fso.CreateTextFile(logFile, True).WriteLine "[" & Now & "] Log truncated"
    End If
End If

' Start ccproxy with auto-restart (invisible)
WshShell.Run "cmd /c ""cd /d " & baseDir & " && scripts\restart-loop.bat ccproxy >> ccproxy-startup.log 2>&1""", 0, False

WScript.Sleep 3000

' Start cloudflared with auto-restart (invisible)
WshShell.Run "cmd /c ""cd /d " & baseDir & " && scripts\restart-loop.bat cloudflared >> ccproxy-startup.log 2>&1""", 0, False
