# ============================================================
#  СтудFood — сторож сервера v2 (бэкенд + туннель Serveo)
#  Serveo периодически не отдаёт зарезервированные имена, поэтому
#  сторож поднимает туннель со случайным URL, сам обновляет
#  public/app-config.js и пушит в GitHub (Pages обновится сам).
# ============================================================

$project = 'C:\Users\Admin\Desktop\SPO\vue-cafe'
$logFile = Join-Path $project 'server-guard.log'
$checkSec = 30

function Log($msg) {
    $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Add-Content -Path $logFile -Value $line -Encoding UTF8
}

function Start-Backend {
    Log 'Запуск бэкенда (node server/index.js)...'
    Start-Process -FilePath 'node' -ArgumentList 'server/index.js' `
        -WorkingDirectory $project -WindowStyle Hidden
}

function Get-CurrentApiUrl {
    $cfg = Join-Path $project 'public\app-config.js'
    $raw = Get-Content $cfg -Raw -Encoding UTF8
    if ($raw -match "apiUrl:\s*'([^']+)'") {
        return ($Matches[1] -replace '/api$', '')
    }
    return $null
}

function Push-Config {
    Set-Location $project
    git add public/app-config.js 2>$null
    git commit -m "Update API tunnel URL [auto]" *> $null
    git push *> $null
    Log 'Push выполнен. Pages обновится через ~2-3 минуты.'
}

function Update-AppConfig($url) {
    $old = Get-CurrentApiUrl
    if ($old -eq $url) { return }
    $cfg = Join-Path $project 'public\app-config.js'
    $nl = [Environment]::NewLine
    $content = "// Konfig: auto by server-guard.ps1${nl}window.APP_CONFIG = {${nl}  apiUrl: 'https://$url/api'${nl}};${nl}"
    [System.IO.File]::WriteAllText($cfg, $content, (New-Object System.Text.UTF8Encoding $false))
    Log "app-config.js: $old -> $url"
    Push-Config
}

function Start-Tunnel {
    $url = Start-TunnelServeo
    if ($url) { return $url }
    Log 'Serveo недоступен — фолбэк на LocalTunnel...'
    return Start-TunnelLt
}

function Start-TunnelServeo {
    $out = Join-Path $env:TEMP 'serveo_o.txt'
    $err = Join-Path $env:TEMP 'serveo_e.txt'
    Remove-Item $out, $err -Force -ErrorAction SilentlyContinue

    $p = Start-Process ssh -ArgumentList @(
            '-o','StrictHostKeyChecking=no',
            '-o','ServerAliveInterval=30',
            '-o','ServerAliveCountMax=3',
            '-o','ExitOnForwardFailure=yes',
            '-N','-R','0:80:localhost:3000','serveo.net'
        ) -WindowStyle Hidden -RedirectStandardOutput $out `
        -RedirectStandardError $err -PassThru

    $url = $null
    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep 1
        if ($p.HasExited) { break }
        $txt = Get-Content $out -Raw -ErrorAction SilentlyContinue
        if ($txt -match 'https://([a-z0-9-]+\.serveousercontent\.com)') {
            $url = $Matches[1]; break
        }
    }
    if (-not $url) {
        Get-Process -Name ssh -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        $e = (Get-Content $err -Raw -ErrorAction SilentlyContinue)
        Log ('Serveo не поднялся: ' + ($e -replace "`r?`n", ' '))
        return $null
    }
    Log "Туннель поднят (Serveo): $url"
    Set-Content -Path (Join-Path $project 'guard-tunnel.pid') -Value $p.Id
    Update-AppConfig $url
    return $url
}

function Start-TunnelLt {
    $out = Join-Path $env:TEMP 'lt_o.txt'
    $err = Join-Path $env:TEMP 'lt_e.txt'
    Remove-Item $out, $err -Force -ErrorAction SilentlyContinue

    $p = Start-Process node -ArgumentList @(
            (Join-Path $env:APPDATA 'npm\node_modules\localtunnel\bin\lt.js'),
            '--port','3000'
        ) -WindowStyle Hidden -RedirectStandardOutput $out `
        -RedirectStandardError $err -PassThru

    $url = $null
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep 1
        if ($p.HasExited) { break }
        $txt = Get-Content $out -Raw -ErrorAction SilentlyContinue
        if ($txt -match 'https://([a-z0-9-]+\.loca\.lt)') {
            $url = $Matches[1]; break
        }
    }
    if (-not $url) {
        $e = (Get-Content $err -Raw -ErrorAction SilentlyContinue)
        Log ('LocalTunnel не поднялся: ' + ($e -replace "`r?`n", ' '))
        return $null
    }
    Log "Туннель поднят (LocalTunnel): $url"
    Set-Content -Path (Join-Path $project 'guard-tunnel.pid') -Value $p.Id
    Update-AppConfig $url
    return $url
}


function Test-Url($base) {
    if (-not $base) { return $false }
    try {
        $r = Invoke-WebRequest -Uri "$base/api/health" -UseBasicParsing -TimeoutSec 10
        return ($r.StatusCode -eq 200)
    } catch { return $false }
}

function Get-NodePidsOnPort([int]$port) {
    (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) |
        Select-Object -ExpandProperty OwningProcess -Unique
}

Set-Location $project
Log '=== Сторож сервера v2 запущен ==='

while ($true) {
    try {
        if (-not (Get-NodePidsOnPort 3000)) { Start-Backend }

        $tunnelPid = $null
        if (Test-Path (Join-Path $project 'guard-tunnel.pid')) {
            $tunnelPid = Get-Content (Join-Path $project 'guard-tunnel.pid') -ErrorAction SilentlyContinue
        }
        $sshAlive = $false
        if ($tunnelPid) {
            $sshAlive = [bool](Get-Process -Id $tunnelPid -ErrorAction SilentlyContinue)
        }
        $apiUrl = Get-CurrentApiUrl
        if (-not $script:failCount) { $script:failCount = 0 }

        if ($sshAlive -and (Test-Url $apiUrl)) {
            $script:failCount = 0
            # всё работает — ничего не делаем
        }
        elseif ($sshAlive) {
            $script:failCount++
            if ($script:failCount -lt 2) {
                Log 'URL не отвечает (попытка 1) — проверю ещё раз в следующем цикле'
            }
            else {
                Log 'URL не отвечает 2 раза подряд — пересоздание туннеля...'
                $script:failCount = 0
                if ($tunnelPid) { Stop-Process -Id $tunnelPid -Force -ErrorAction SilentlyContinue }
                Get-Process -Name ssh -ErrorAction SilentlyContinue | Stop-Process -Force
                Start-Sleep 3
                Start-Tunnel | Out-Null
            }
        }
        else {
            Log 'Туннель отсутствует — запуск...'
            Start-Tunnel | Out-Null
        }
    } catch {
        Log ("Ошибка цикла: " + $_.Exception.Message)
    }
    Start-Sleep -Seconds $checkSec
}
