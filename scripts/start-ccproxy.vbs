Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

Dim logFile
logFile = "C:\Users\User\Documents\repository\ccproxy\ccproxy-startup.log"

' Truncate startup log if over 5MB
If fso.FileExists(logFile) Then
    Dim f
    Set f = fso.GetFile(logFile)
    If f.Size > 5242880 Then
        Set ts = fso.CreateTextFile(logFile, True)
        ts.WriteLine "[" & Now & "] Startup log truncated (was " & f.Size & " bytes)"
        ts.Close
    End If
    Set f = Nothing
End If

' Start the proxy with auto-restart loop (invisible, with logging)
WshShell.Run "cmd /c ""cd /d C:\Users\User\Documents\repository\ccproxy && scripts\restart-loop.bat >> ccproxy-startup.log 2>&1""", 0, False

' Wait 3 seconds for proxy to be ready
WScript.Sleep 3000

' Start the Cloudflare tunnel (invisible)
WshShell.Run "cmd /c ""cloudflared tunnel --config C:\Users\User\.cloudflared\config.yml run""", 0, False
