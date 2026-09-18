# ============================================================
#  tools/ensure-guard.ps1 — запускает сторож ровно в одном экземпляре.
#  Если сторож уже работает (guard.pid жив) — второй не создаётся.
# ============================================================

$ErrorActionPreference = 'Continue'
$project = 'C:\Users\Admin\Desktop\SPO\vue-cafe'
$guardScript = Join-Path $project 'server-guard.ps1'
$pidFile = Join-Path $project 'guard.pid'

if (-not (Test-Path $guardScript)) {
    Write-Host '  [ОШИБКА] server-guard.ps1 не найден'
    exit 1
}

$running = $false
$oldPid = $null
if (Test-Path $pidFile) {
    $raw = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($raw -match '^\d+$') {
        $oldPid = [int]$raw
        $running = [bool](Get-Process -Id $oldPid -ErrorAction SilentlyContinue)
    }
}

if ($running) {
    Write-Host "  Сторож уже работает (PID $oldPid) — второй экземпляр не нужен"
    exit 0
}

# Убираем возможные «зависшие» копии сторожа из прошлых сессий.
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*server-guard.ps1*' } |
    ForEach-Object {
        Write-Host ("  Останавливаю старый экземпляр сторожа (PID " + $_.ProcessId + ')')
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
Start-Sleep 1

$p = Start-Process -FilePath 'powershell' -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $guardScript
    ) -WorkingDirectory $project -WindowStyle Hidden -PassThru

if ($p) {
    Set-Content -Path $pidFile -Value $p.Id -Force
    Write-Host "  Сторож запущен (PID $($p.Id)). Лог: server-guard.log"
} else {
    Write-Host '  [ОШИБКА] не удалось запустить сторожа'
    exit 1
}