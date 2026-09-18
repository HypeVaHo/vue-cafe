# ============================================================
#  tools/wait-backend.ps1 — ждёт готовности локального бэкенда.
#  Возвращает (пишет в консоль) «сервер отвечает: <json>».
#  Код выхода: 0 — сервер готов, 1 — не дождались.
# ============================================================

$ErrorActionPreference = 'Continue'
$deadline = (Get-Date).AddSeconds(60)
$ready = $false

while ((Get-Date) -lt $deadline) {
    try {
        $r = Invoke-WebRequest -Uri 'http://localhost:3000/api/health' -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) {
            Write-Output ("сервер отвечает: " + $r.Content)
            $ready = $true
            break
        }
    } catch { }
    Start-Sleep 2
}

if (-not $ready) {
    Write-Output '[ВНИМАНИЕ] сервер не ответил за 60 с — смотрите logs\backend.err.log'
    Write-Output 'обычно это значит, что не запущен SQL Server или неверны данные в server\.env'
    exit 1
}
exit 0