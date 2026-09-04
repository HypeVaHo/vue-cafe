# ============================================================================
#  start-all.ps1 — запуск всего проекта одной командой
#  Запускает: SQL Server check -> Express backend (3000) -> Vite frontend (5173)
#  Останавливает оба процесса при закрытии (Ctrl+C / exit)
# ============================================================================

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ''
Write-Host '============================================' -ForegroundColor Cyan
Write-Host '  СТУДFOOD — старт проекта' -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan

# --- 1. Настройки ---
$BackendPort = 3000
$FrontendPort = 80    # VK ID разрешает localhost только на 80 (http) или 443 (https)
$BackendCmd = 'node'
$BackendArgs = @('server/index.js')
$FrontendCmd = 'node'
$FrontendArgs = @('node_modules/vite/bin/vite.js')

# --- 2. Проверка SQL Server ---
Write-Host ''
Write-Host '>> Проверка SQL Server (порт 1433) ...' -ForegroundColor Yellow
$sqlListen = Get-NetTCPConnection -LocalPort 1433 -State Listen -ErrorAction SilentlyContinue
if (-not $sqlListen) {
  Write-Host '  [!] SQL Server не слушает порт 1433!' -ForegroundColor Red
  Write-Host '      Убедитесь, что служба MSSQL$SQLEXPRESS запущена.' -ForegroundColor Yellow
  $svc = Get-Service 'MSSQL$SQLEXPRESS' -ErrorAction SilentlyContinue
  if ($svc -and $svc.Status -ne 'Running') {
    Write-Host ('      Статус службы: ' + $svc.Status)
    Write-Host '      Попробуйте (от администратора): Restart-Service MSSQL$SQLEXPRESS' -ForegroundColor Yellow
  }
} else {
  Write-Host '  + SQL Server слушает порт 1433' -ForegroundColor Green
}

# --- 3. Проверка .env ---
$envFile = Join-Path $Root 'server\.env'
if (-not (Test-Path $envFile)) {
  Write-Host '  [!] Отсутствует server\.env. Скопируйте server\.env.example.' -ForegroundColor Red
  Stop.
}

# --- 4. Проверка node_modules (фронтенд) ---
if (-not (Test-Path (Join-Path $Root 'node_modules\vite'))) {
  Write-Host '  [!] node_modules не найден. Запустите: cmd /c "npm install"' -ForegroundColor Red
  exit 1
}

# --- 5. Проверка занятости портов ---
foreach ($port in @($BackendPort, $FrontendPort)) {
  $busy = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($busy) {
    Write-Host ("  [!] Порт {0} уже используется процессом {1}. Закройте старый процесс." -f $port, ($busy[0].OwningProcess)) -ForegroundColor Red
    exit 1
  }
}

# --- 6. Запуск бэкенда ---
Write-Host ''
Write-Host ">> Запуск Backend  на http://localhost:$BackendPort ..." -ForegroundColor Green
$backend = Start-Process -FilePath $BackendCmd -ArgumentList $BackendArgs -WorkingDirectory $Root -PassThru -NoNewWindow
Start-Sleep -Seconds 4

# --- 7. Запуск фронтенда ---
Write-Host ">> Запуск Frontend на http://localhost:$FrontendPort ..." -ForegroundColor Green
$front = Start-Process -FilePath $FrontendCmd -ArgumentList $FrontendArgs -WorkingDirectory $Root -PassThru -NoNewWindow

Write-Host ''
Write-Host '============================================' -ForegroundColor Cyan
Write-Host '  Оба процесса запущены:' -ForegroundColor Green
Write-Host ('    Backend :  http://localhost:{0}/api/health' -f $BackendPort) -ForegroundColor White
Write-Host ('    Frontend:  http://localhost:{0}' -f $FrontendPort) -ForegroundColor White
Write-Host '  Нажмите Ctrl+C для остановки всех процессов.' -ForegroundColor Yellow
Write-Host '============================================' -ForegroundColor Cyan

# --- Таймер контроля ---
try {
  $deadline = (Get-Date).AddHours(12)
  while ($true) {
    # Проверяем, что дети живы
    $bAlive = $backend -and -not $backend.HasExited
    $fAlive = $front  -and -not $front.HasExited
    if (-not $bAlive -or -not $fAlive) {
      Write-Host ($(if (-not $bAlive -and -not $fAlive) {'[!] Бэкенд и фронтенд остановлены.'} elseif (-not $bAlive) {'[!] Бэкенд остановлен.'} else {'[!] Фронтенд остановлен.'})) -ForegroundColor Yellow
      break
    }
    if ((Get-Date) -gt $deadline) { break }
    Start-Sleep -Seconds 5
  }
} finally {
  Write-Host ''
  Write-Host '>> Остановка ...' -ForegroundColor Yellow
  if ($backend -and -not $backend.HasExited) { Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue }
  if ($front  -and -not $front.HasExited)  { Stop-Process -Id $front.Id -Force -ErrorAction SilentlyContinue }
  Write-Host '>> Готово.' -ForegroundColor Green
}