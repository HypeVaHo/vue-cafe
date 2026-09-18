# ============================================================
#  tools/status.ps1 — быстрая диагностика проекта «СтудFood».
#  Ничего не меняет: только сообщает состояние.
#  Выводит строки вида KEY=VALUE — их читает start-backend.bat.
#
#    BACKEND   = OK / FAIL    локальный бэкенд на :3000 отвечает
#    TUNNEL    = OK / FAIL    публичный туннель отдаёт /api/health
#    SITE      = OK / FAIL    сайт на GitHub Pages открывается
#    SITECONFIG= OK / FAIL    сайт использует актуальный адрес API
#    GUARD     = ALIVE/DEAD   сторож (server-guard.ps1) запущен
#    API       = <url>        адрес API из public/app-config.js
# ============================================================

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$project = 'C:\Users\Admin\Desktop\SPO\vue-cafe'
$port = 3000
$siteUrl = 'https://hypevaho.github.io/vue-cafe'
$cfgFile = Join-Path $project 'public\app-config.js'
$pidFile = Join-Path $project 'guard.pid'

function Get-ApiUrl {
    if (-not (Test-Path $cfgFile)) { return $null }
    $raw = Get-Content $cfgFile -Raw -Encoding UTF8
    if ($raw -match "apiUrl:\s*'([^']+)'") { return ($Matches[1] -replace '/api$', '') }
    return $null
}

$headers = @{ 'bypass-tunnel-reminder' = 'true'; 'ngrok-skip-browser-warning' = 'true' }

$apiUrl = Get-ApiUrl

# --- Бэкенд ---
$backend = 'FAIL'
try {
    $r = Invoke-WebRequest -Uri "http://localhost:$port/api/health" -UseBasicParsing -TimeoutSec 6
    if ($r.StatusCode -eq 200 -and $r.Content -match '"status"\s*:\s*"ok"') { $backend = 'OK' }
} catch { }

# --- Туннель ---
$tunnel = 'FAIL'
if ($apiUrl) {
    try {
        $r = Invoke-WebRequest -Uri "$apiUrl/api/health" -UseBasicParsing -TimeoutSec 10 -Headers $headers
        if ($r.StatusCode -eq 200 -and $r.Content -match '"status"\s*:\s*"ok"') { $tunnel = 'OK' }
    } catch { }
}

# --- Сайт ---
$site = 'FAIL'
try {
    $r = Invoke-WebRequest -Uri "$siteUrl/" -UseBasicParsing -TimeoutSec 10
    if ($r.StatusCode -eq 200) { $site = 'OK' }
} catch { }

# --- Сайт использует актуальный API ---
$siteConfig = 'FAIL'
if ($apiUrl) {
    try {
        $probe = "$siteUrl/app-config.js?ts=$([DateTime]::Now.Ticks)"
        $r = Invoke-WebRequest -Uri $probe -UseBasicParsing -TimeoutSec 10
        if ($r.StatusCode -eq 200 -and $r.Content -match [regex]::Escape(($apiUrl -replace '^https?://', ''))) {
            $siteConfig = 'OK'
        }
    } catch { }
}

# --- Сторож ---
$guard = 'DEAD'
if (Test-Path $pidFile) {
    $gp = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($gp -match '^\d+$' -and (Get-Process -Id ([int]$gp) -ErrorAction SilentlyContinue)) { $guard = 'ALIVE' }
}

Write-Output "BACKEND=$backend"
Write-Output "TUNNEL=$tunnel"
Write-Output "SITE=$site"
Write-Output "SITECONFIG=$siteConfig"
Write-Output "GUARD=$guard"
Write-Output "API=$apiUrl"