Set WshShell = CreateObject("WScript.Shell")

' Start the proxy (invisible)
WshShell.Run "cmd /c ""cd /d C:\Users\User\Documents\repository\ccproxy && bun run index.ts""", 0, False

' Wait 3 seconds for proxy to be ready
WScript.Sleep 3000

' Start the Cloudflare tunnel (invisible)
WshShell.Run "cmd /c ""cloudflared tunnel --config C:\Users\User\.cloudflared\config.yml run""", 0, False
