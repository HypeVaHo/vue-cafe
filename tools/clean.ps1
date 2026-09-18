# ============================================================
#  tools/clean.ps1 — «генеральная уборка» перед стартом бэкенда.
#  Гасит всё, что может держать порт 3000 или старый туннель:
#    * процессы, слушающие порт 3000 (старый бэкенд);
#    * сторож из guard.pid;
#    * клиенты localtunnel;
#    * cloudflared.
#  Бэкенд после уборки НЕ запускает — это делает start-backend.bat.
# ============================================================

$ErrorActionPreference = 'Continue'
$project = 'C:\Users\Admin\Desktop\SPO\vue-cafe'
$port = 3000

function Kill-Pid($id) {
    try {
        Stop-Process -Id $id -Force -ErrorAction Stop
        Write-Host "  остановлен PID $id"
    } catch { }
}

Write-Host '  * порт 3000...'
(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Kill-Pid $_ }

Write-Host '  * старый сторож...'
$guardPid = Join-Path $project 'guard.pid'
if (Test-Path $guardPid) {
    $raw = (Get-Content $guardPid -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($raw -match '^\d+$' -and [int]$raw -ne $PID) { Kill-Pid ([int]$raw) }
    Remove-Item $guardPid -Force -ErrorAction SilentlyContinue
}

Write-Host '  * клиенты localtunnel / cloudflared...'
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*localtunnel*' } |
    ForEach-Object { Kill-Pid $_.ProcessId }

Get-Process cloudflared -ErrorAction SilentlyContinue | ForEach-Object { Kill-Pid $_.Id }

$tunnelPid = Join-Path $project 'guard-tunnel.pid'
if (Test-Path $tunnelPid) { Remove-Item $tunnelPid -Force -ErrorAction SilentlyContinue }

Start-Sleep 2
Write-Host '  очистка завершена'