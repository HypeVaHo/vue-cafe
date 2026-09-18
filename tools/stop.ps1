# ============================================================
#  tools/stop.ps1 — полная остановка бэкенда, сторожа и туннеля.
# ============================================================

$ErrorActionPreference = 'Continue'
$project = 'C:\Users\Admin\Desktop\SPO\vue-cafe'

Write-Host 'Останавливаю сторож...'
$guardPid = Join-Path $project 'guard.pid'
if (Test-Path $guardPid) {
    $raw = (Get-Content $guardPid -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($raw -match '^\d+$') { Stop-Process -Id ([int]$raw) -Force -ErrorAction SilentlyContinue }
    Remove-Item $guardPid -Force -ErrorAction SilentlyContinue
}

Write-Host 'Останавливаю туннель...'
$tunnelPid = Join-Path $project 'guard-tunnel.pid'
if (Test-Path $tunnelPid) {
    $raw = (Get-Content $tunnelPid -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($raw -match '^\d+$') { Stop-Process -Id ([int]$raw) -Force -ErrorAction SilentlyContinue }
    Remove-Item $tunnelPid -Force -ErrorAction SilentlyContinue
}

Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*localtunnel*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Get-Process cloudflared -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}

Write-Host 'Останавливаю бэкенд на порту 3000...'
(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }

Start-Sleep 2
Write-Host 'Всё остановлено.'