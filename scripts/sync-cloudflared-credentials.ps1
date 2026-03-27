# Sync local Cloudflare Tunnel credentials from `cloudflared tunnel token` (same account as cert.pem).
# Run when tunnel UUID changed on another machine. Does not print secrets.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\sync-cloudflared-credentials.ps1 [-TunnelId <uuid>] [-TunnelName <name>]

param(
    [string]$TunnelId = "f1c7f88f-d05f-4b6e-b3cc-f087191c2b6b",
    [string]$TunnelName = "claude-max-proxy",
    [string]$CfExe = "C:\Program Files (x86)\cloudflared\cloudflared.exe",
    [string]$CloudflaredDir = "C:\Users\User\.cloudflared",
    [string]$Hostname = "ccproxy.lprieu.dev",
    [int]$OriginPort = 8082
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $CfExe)) {
    throw "cloudflared not found at $CfExe"
}

New-Item -ItemType Directory -Force -Path $CloudflaredDir | Out-Null

# cloudflared writes update warnings to stderr; ignore stderr so PowerShell does not treat them as errors
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "SilentlyContinue"
$token = & $CfExe tunnel token $TunnelId 2>$null
$ErrorActionPreference = $prevEap
if (-not $token) {
    throw "Failed to get tunnel token. Run 'cloudflared tunnel login' if needed."
}

$token = $token.Trim()
$innerJson = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($token))
$inner = $innerJson | ConvertFrom-Json

$credPath = Join-Path $CloudflaredDir "$TunnelId.json"
$credObj = [ordered]@{
    AccountTag   = $inner.a
    TunnelSecret = $inner.s
    TunnelID     = $inner.t
    TunnelName   = $TunnelName
}
$credJson = ($credObj | ConvertTo-Json -Compress) + "`n"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($credPath, $credJson, $utf8NoBom)
Write-Host "Wrote credentials file: $credPath"

$configPath = Join-Path $CloudflaredDir "config.yml"
$config = @"
tunnel: $TunnelId
credentials-file: $credPath

ingress:
  - hostname: $Hostname
    service: http://localhost:$OriginPort
  - service: http_status:404
"@
[System.IO.File]::WriteAllText($configPath, $config, $utf8NoBom)
Write-Host "Updated $configPath"
