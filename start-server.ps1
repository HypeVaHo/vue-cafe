# Скрипт запуска бэкенда и туннеля для работы сайта из интернета
# Запускать из корня проекта

Write-Host "=== Запуск сервера vue-cafe ===" -ForegroundColor Cyan

# Проверка SQL Server
Write-Host "`n[1/3] Проверка SQL Server..." -ForegroundColor Yellow
$sqlRunning = Get-NetTCPConnection -LocalPort 1433 -State Listen -ErrorAction SilentlyContinue
if (-not $sqlRunning) {
    Write-Host "  [!] SQL Server не слушает порт 1433. Запустите SQL Server!" -ForegroundColor Red
    Write-Host "  Попробуйте (от администратора): Restart-Service MSSQL`$SQLEXPRESS" -ForegroundColor Gray
    exit 1
}
Write-Host "  [OK] SQL Server работает" -ForegroundColor Green

# Запуск бэкенда
Write-Host "`n[2/3] Запуск бэкенда..." -ForegroundColor Yellow
$backend = Start-Process node -ArgumentList 'server/index.js' -WindowStyle Hidden -PassThru -RedirectStandardOutput backend_out.txt -RedirectStandardError backend_err.txt
Start-Sleep 3

$apiUp = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if (-not $apiUp) {
    Write-Host "  [!] Бэкенд не запустился. Смотрите backend_err.txt" -ForegroundColor Red
    Get-Content backend_err.txt -ErrorAction SilentlyContinue
    exit 1
}
Write-Host "  [OK] Бэкенд запущен (PID=$($backend.Id))" -ForegroundColor Green

# Запуск туннеля
Write-Host "`n[3/3] Запуск Cloudflare Tunnel..." -ForegroundColor Yellow
Write-Host "  Ожидание адреса туннеля..." -ForegroundColor Gray

$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflared) {
    Write-Host "  [!] cloudflared не найден в PATH" -ForegroundColor Red
    Write-Host "  1. Скачайте: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" -ForegroundColor Gray
    Write-Host "  2. Положите cloudflared.exe в папку проекта или добавьте в PATH" -ForegroundColor Gray
    Write-Host "`n  Бэкенд работает локально: http://localhost:3000" -ForegroundColor Cyan
    exit 0
}

$tunnel = Start-Process cloudflared -ArgumentList 'tunnel', '--url', 'http://localhost:3000' -WindowStyle Hidden -PassThru -RedirectStandardOutput tunnel_out.txt -RedirectStandardError tunnel_err.txt
Start-Sleep 8

# Попытка извлечь URL из логов
$tunnelUrl = $null
if (Test-Path tunnel_out.txt) {
    $log = Get-Content tunnel_out.txt -Raw
    if ($log -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
        $tunnelUrl = $Matches[0]
    }
}

Write-Host "`n=== Сервер запущен ===" -ForegroundColor Cyan
Write-Host "Бэкенд:   http://localhost:3000" -ForegroundColor White
if ($tunnelUrl) {
    Write-Host "Туннель:  $tunnelUrl" -ForegroundColor White
    Write-Host "`nОбновите public/app-config.js:" -ForegroundColor Yellow
    Write-Host "  apiUrl: '$tunnelUrl/api'" -ForegroundColor Gray
}
Write-Host "`nНажмите Ctrl+C для остановки..." -ForegroundColor Gray

# Ожидание
try {
    while ($true) { Start-Sleep 5 }
} finally {
    Write-Host "`nОстановка..." -ForegroundColor Yellow
    Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
    Stop-Process -Id $tunnel.Id -Force -ErrorAction SilentlyContinue
    Write-Host "Остановлено." -ForegroundColor Green
}