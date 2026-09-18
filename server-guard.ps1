# ============================================================
#  StudFood - server guard v7 (self-healing backend + tunnel)
# ------------------------------------------------------------
#  What it does on every tick (default: every 30 s):
#    1. Ensures the backend listens on :3000 and /api/health is OK.
#    2. Ensures the public tunnel is alive. If it is dead it is
#       re-created. The previously assigned LocalTunnel subdomain
#       is requested again, so the public URL usually stays the
#       same (no needless GitHub Pages rebuilds).
#    3. Writes the tunnel URL into public/app-config.js ("in code").
#    4. Checks that the GitHub Pages site is up and really uses the
#       current API URL. If not, it commits + pushes (so Pages
#       rebuilds) and keeps checking until everything works.
#    5. Runs `npm run build` before pushing, so a broken build can
#       never take the published site down.
#
#  Usage:
#    powershell -NoProfile -ExecutionPolicy Bypass -File .\server-guard.ps1
#    powershell ... -File .\server-guard.ps1 -Once        # single tick
#    powershell ... -File .\server-guard.ps1 -Interval 15 # custom tick
#
#  Logs: server-guard.log, logs\*.log
# ============================================================

param(
    [switch]$Once,
    [int]$Interval = 30
)

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

# ------------------------- configuration --------------------
$script:project   = 'C:\Users\Admin\Desktop\SPO\vue-cafe'
$script:port      = 3000
$script:ghUser    = 'HypeVaHo'
$script:ghRepo    = 'vue-cafe'
$script:siteUrl   = 'https://hypevaho.github.io/vue-cafe'
$script:logFile   = Join-Path $script:project 'server-guard.log'
$script:stateFile = Join-Path $script:project 'guard-tunnel.json'
$script:logsDir   = Join-Path $script:project 'logs'
$script:cfgFile   = Join-Path $script:project 'public\app-config.js'
$script:ltBin     = Join-Path $env:APPDATA 'npm\node_modules\localtunnel\bin\lt.js'
$script:checkSec  = if ($Interval -gt 5) { $Interval } else { 30 }

# Preferred subdomain (nice name). If it is already taken by
# someone else, LocalTunnel hands out a random one and we adopt it.
$script:preferSub = 'studfood-cafe'

$script:tunnelFails = 0
$script:siteFails   = 0
$script:tunnelType  = 'lt'
$script:tunnelUrl   = $null
$script:tunnelPid   = $null

if (-not (Test-Path $script:logsDir)) {
    New-Item -ItemType Directory -Path $script:logsDir -Force | Out-Null
}

function Log($msg) {
    $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Write-Host $line
    try { Add-Content -Path $script:logFile -Value $line -Encoding UTF8 } catch { }
}

function Get-NodePidsOnPort([int]$p) {
    (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) |
        Select-Object -ExpandProperty OwningProcess -Unique
}

# LocalTunnel shows an interstitial page ("Tunnel website ahead!")
# unless this header is sent; ngrok has its own equivalent.
function Get-TunnelHeaders {
    @{ 'bypass-tunnel-reminder' = 'true'; 'ngrok-skip-browser-warning' = 'true' }
}

# True when <base>/api/health returns HTTP 200 with {"status":"ok"}.
function Test-Api([string]$base) {
    if ([string]::IsNullOrWhiteSpace($base)) { return $false }
    try {
        $r = Invoke-WebRequest -Uri "$base/api/health" -UseBasicParsing `
            -TimeoutSec 12 -Headers (Get-TunnelHeaders)
        if ($r.StatusCode -ne 200) { return $false }
        return ($r.Content -match '"status"\s*:\s*"ok"')
    } catch { return $false }
}
# ------------------------- backend --------------------------
function Start-Backend {
    Log 'Backend: starting node server/index.js'
    $out = Join-Path $script:logsDir 'backend.out.log'
    $err = Join-Path $script:logsDir 'backend.err.log'
    try {
        Start-Process -FilePath 'node' -ArgumentList 'server/index.js' `
            -WorkingDirectory $script:project -WindowStyle Hidden `
            -RedirectStandardOutput $out -RedirectStandardError $err | Out-Null
    } catch {
        Log ('Backend start failed: ' + $_.Exception.Message)
    }
}

function Ensure-Backend {
    $local = "http://localhost:$script:port"

    if (Test-Api $local) { return $true }

    $pids = Get-NodePidsOnPort $script:port
    if ($pids) {
        Log ("Port $script:port is taken by PID " + ($pids -join ', ') + ' but health is silent - restarting')
        foreach ($procId in $pids) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue }
        Start-Sleep 2
    }

    Start-Backend
    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep 2
        if (Test-Api $local) {
            Log 'Backend is up (database connected)'
            return $true
        }
    }

    Log 'WARNING: backend does not answer on /api/health (check SQL Server and server\.env)'
    $err = Join-Path $script:logsDir 'backend.err.log'
    if (Test-Path $err) {
        Get-Content $err -Tail 8 -ErrorAction SilentlyContinue |
            ForEach-Object { Log ('  backend> ' + $_) }
    }
    return $false
}

# ---------------------- state / app-config ------------------
function Get-State {
    $state = @{ pid = 0; url = $null; type = 'lt' }
    if (Test-Path $script:stateFile) {
        try {
            $raw = Get-Content $script:stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($raw.pid)  { $state.pid  = [int]$raw.pid }
            if ($raw.url)  { $state.url  = [string]$raw.url }
            if ($raw.type) { $state.type = [string]$raw.type }
        } catch { }
    }
    return $state
}

function Set-State([int]$tunPid, [string]$url, [string]$type) {
    $state = [ordered]@{ pid = $tunPid; url = $url; type = $type }
    try {
        ($state | ConvertTo-Json -Compress) |
            Set-Content -Path $script:stateFile -Encoding UTF8 -Force
    } catch { }
    # Keep the legacy .pid file in sync (tools\stop.ps1 uses it).
    try {
        Set-Content -Path (Join-Path $script:project 'guard-tunnel.pid') -Value $tunPid -Force
    } catch { }
    $script:tunnelPid = $tunPid
    $script:tunnelUrl = $url
    $script:tunnelType = $type
}

function Get-CurrentApiUrl {
    if (-not (Test-Path $script:cfgFile)) { return $null }
    $raw = Get-Content $script:cfgFile -Raw -Encoding UTF8
    if ($raw -match "apiUrl:\s*'([^']+)'") { return ($Matches[1] -replace '/api$', '') }
    return $null
}

# Writes app-config.js (UTF-8, no BOM). apiUrl - live tunnel,
# logoUrl - logo is always taken straight from GitHub.
function Set-AppConfig([string]$url) {
    $nl = [Environment]::NewLine
    $logo = "https://$($script:ghUser.ToLower()).github.io/$script:ghRepo/logo.png"
    $body = @(
        '// Konfig: auto by server-guard.ps1',
        '// apiUrl  - live api address (LocalTunnel).',
        '// logoUrl - logo is always loaded straight from GitHub, so it',
        '//           does not depend on the local server or the tunnel.',
        'window.APP_CONFIG = {',
        "  apiUrl: '$url/api',",
        "  logoUrl: '$logo'",
        '};',
        ''
    ) -join $nl
    [System.IO.File]::WriteAllText($script:cfgFile, $body, (New-Object System.Text.UTF8Encoding $false))
    Log "app-config.js -> $url (logo: $logo)"
}
# --------------------------- tunnels -------------------------
# Extracts the subdomain from a loca.lt URL, e.g.
# "https://quiet-ape-25.loca.lt" -> "quiet-ape-25".
function Get-LtSubdomain([string]$url) {
    if ($url -and $url -match 'https://([a-z0-9-]+)\.loca\.lt') { return $Matches[1] }
    return $null
}

# Starts LocalTunnel. $subdomain may be empty (random name).
# Returns the assigned public URL or $null.
function Start-Lt([string]$subdomain) {
    if (-not (Test-Path $script:ltBin)) {
        Log "localtunnel not found: $script:ltBin  (run: npm i -g localtunnel)"
        return $null
    }

    $out = Join-Path $script:logsDir 'tunnel-lt.out.log'
    $err = Join-Path $script:logsDir 'tunnel-lt.err.log'
    Remove-Item $out, $err -Force -ErrorAction SilentlyContinue

    $ltArgs = @("`"$script:ltBin`"", '--port', "$script:port")
    if ($subdomain) { $ltArgs += @('--subdomain', $subdomain) }
    if ($subdomain) { Log "LocalTunnel: requesting subdomain '$subdomain'" }
    else            { Log 'LocalTunnel: requesting a random subdomain' }

    $p = Start-Process -FilePath 'node' -ArgumentList $ltArgs `
        -WorkingDirectory $script:project -WindowStyle Hidden `
        -RedirectStandardOutput $out -RedirectStandardError $err -PassThru

    $url = $null
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep 1
        if ($p.HasExited) { break }
        $txt = Get-Content $out -Raw -ErrorAction SilentlyContinue
        if ($txt -match 'https://[a-z0-9-]+\.loca\.lt') { $url = $Matches[0]; break }
    }

    if (-not $url) {
        $e = (Get-Content $err -Raw -ErrorAction SilentlyContinue)
        Log ('LocalTunnel failed: ' + (($e -replace "\s+", ' ').Trim()))
        if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
        return $null
    }

    if ($subdomain -and (Get-LtSubdomain $url) -ne $subdomain) {
        Log "Subdomain '$subdomain' is taken by someone else - got '$url' instead"
    }

    Set-State $p.Id $url 'lt'
    Log "Tunnel up (LocalTunnel): $url"
    return $url
}

# Fallback: Cloudflare TryCloudflare (URL changes on every start).
function Start-Cf {
    $out = Join-Path $script:logsDir 'tunnel-cf.out.log'
    $err = Join-Path $script:logsDir 'tunnel-cf.err.log'
    Remove-Item $out, $err -Force -ErrorAction SilentlyContinue

    $cf = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
    if (-not $cf) { $cf = Join-Path $script:project 'cloudflared.exe' }
    if (-not (Test-Path $cf)) { Log 'cloudflared.exe not found - fallback tunnel unavailable'; return $null }

    Log 'Tunnel: starting Cloudflare (fallback)'
    $p = Start-Process -FilePath $cf -ArgumentList @(
            'tunnel', '--url', "http://localhost:$script:port",
            '--protocol', 'http2', '--no-autoupdate'
        ) -WorkingDirectory $script:project -WindowStyle Hidden `
        -RedirectStandardOutput $out -RedirectStandardError $err -PassThru

    $url = $null
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep 1
        if ($p.HasExited) { break }
        $txt = Get-Content $err -Raw -ErrorAction SilentlyContinue
        if ($txt -match 'https://[a-z0-9-]+\.trycloudflare\.com') { $url = $Matches[0]; break }
    }

    if (-not $url) {
        $e = (Get-Content $err -Raw -ErrorAction SilentlyContinue)
        Log ('Cloudflare failed: ' + (($e -replace "\s+", ' ').Trim()))
        if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
        return $null
    }

    Set-State $p.Id $url 'cf'
    Log "Tunnel up (Cloudflare): $url"
    return $url
}

# Kills the current tunnel client (by remembered PID and by cmdline).
function Stop-Tunnel {
    $state = Get-State
    if ($state.pid) { Stop-Process -Id $state.pid -Force -ErrorAction SilentlyContinue }
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*localtunnel*' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Get-Process cloudflared -ErrorAction SilentlyContinue |
        Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep 2
}
# Keeps the tunnel alive and keeps app-config.js in sync with it.
# Returns the working public URL (or $null when there is none).
function Ensure-Tunnel {
    $state = Get-State
    $script:tunnelPid = $state.pid
    $script:tunnelType = $state.type

    $alive = $false
    if ($state.pid) {
        $alive = [bool](Get-Process -Id $state.pid -ErrorAction SilentlyContinue)
    }

    # The URL we are currently publishing (from app-config.js) -
    # after a manual run it may differ from the state file.
    $current = Get-CurrentApiUrl
    if (-not $current) { $current = $state.url }

    if ($alive) {
        if (Test-Api $current) {
            $script:tunnelFails = 0
            if ((Get-CurrentApiUrl) -ne $current) { Set-AppConfig $current }
            return $current
        }

        # One failed probe is not a death sentence: LocalTunnel's free
        # edge sometimes drops a single request. Allow a few retries.
        $script:tunnelFails++
        if ($script:tunnelFails -lt 3) {
            Log "Tunnel did not answer (attempt $script:tunnelFails of 3) - waiting for it to recover"
            return $current
        }
        Log 'Tunnel is dead (3 failed probes in a row) - re-creating'
    } else {
        Log 'Tunnel process is gone - re-creating'
    }

    $script:tunnelFails = 0
    $wantSub = $null

    # Try to reclaim the previously assigned subdomain, so the public
    # URL stays the same and GitHub Pages does not have to rebuild.
    $prevSub = Get-LtSubdomain $current
    if ($prevSub) { $wantSub = $prevSub }

    Stop-Tunnel

    $url = $null
    $candidates = @()
    if ($wantSub) { $candidates += $wantSub }
    if ($script:preferSub -and $script:preferSub -ne $wantSub) { $candidates += $script:preferSub }

    foreach ($sub in $candidates) {
        $url = Start-Lt $sub
        if ($url) { break }
    }
    if (-not $url) { $url = Start-Lt '' }

    if (-not $url) {
        Log 'LocalTunnel unavailable - falling back to Cloudflare'
        $url = Start-Cf
    }

    if (-not $url) {
        Log 'FAILED to start any tunnel - will retry on the next tick'
        return $null
    }

    Set-AppConfig $url

    # Wait until the public URL really serves the API.
    for ($i = 0; $i -lt 10; $i++) {
        if (Test-Api $url) {
            Log "Tunnel verified from outside: $url/api/health -> ok"
            return $url
        }
        Start-Sleep 3
    }

    Log "Tunnel $url is up but not answering from outside yet - will re-check"
    return $url
}
# ------------------- build / git / GitHub Pages ---------------
# Runs `npm run build`. A broken build must never be pushed, or the
# published site would go down.
function Invoke-BuildCheck {
    $log = Join-Path $script:logsDir 'build.log'
    $p = Start-Process -FilePath 'cmd.exe' `
        -ArgumentList '/c', "npm run build > `"$log`" 2>&1" `
        -WorkingDirectory $script:project -WindowStyle Hidden -PassThru -Wait
    if ($p.ExitCode -eq 0) { return $true }
    Log "BUILD FAILED (exit $($p.ExitCode)) - push cancelled. Last lines of logs\build.log:"
    Get-Content $log -Tail 15 -ErrorAction SilentlyContinue | ForEach-Object { Log ('  build> ' + $_) }
    return $false
}

# Commits and pushes the files the guard is responsible for.
function Push-Changes {
    Set-Location $script:project
    $candidates = @(
        'public\app-config.js', 'server\site-settings.json', 'public\logo.png',
        'public\favicon.png', 'public\favicon.svg', 'index.html',
        'src\components\AppLayout.vue', 'start-backend.bat', 'server-guard.ps1', 'tools\status.ps1'
    )
    $existing = @($candidates | Where-Object { Test-Path (Join-Path $script:project $_) })
    git add -- $existing 2>$null | Out-Null

    git diff --cached --quiet 2>$null
    if ($LASTEXITCODE -eq 0) {
        Log 'Nothing new to publish to GitHub'
        return $false
    }

    if (-not (Invoke-BuildCheck)) {
        git reset -q 2>$null | Out-Null
        return $false
    }

    git commit -m "Auto: tunnel URL + settings sync [guard]" *> $null
    if ($LASTEXITCODE -ne 0) { Log 'git commit failed'; return $false }

    git push *> $null
    if ($LASTEXITCODE -ne 0) { Log 'git push failed (check GitHub credentials)'; return $false }

    Log 'Pushed to GitHub - Pages will rebuild in 1-3 minutes'
    return $true
}

function Test-SiteAlive {
    try {
        $r = Invoke-WebRequest -Uri "$script:siteUrl/" -UseBasicParsing -TimeoutSec 15
        return ($r.StatusCode -eq 200)
    } catch { return $false }
}

# Is the published app-config.js the same as the local one?
function Test-SiteConfigFresh {
    $local = Get-CurrentApiUrl
    if (-not $local) { return $false }
    $hostPart = ($local -replace '^https?://', '')
    try {
        $probe = "$script:siteUrl/app-config.js?ts=$([DateTime]::Now.Ticks)"
        $r = Invoke-WebRequest -Uri $probe -UseBasicParsing -TimeoutSec 15 `
            -Headers @{ 'Cache-Control' = 'no-cache' }
        if ($r.StatusCode -ne 200) { return $false }
        return ($r.Content -match [regex]::Escape($hostPart))
    } catch { return $false }
}

# The whole chain works: backend, tunnel, published site, fresh config.
function Test-Everything {
    return (Test-Api "http://localhost:$script:port") -and
           (Test-Api (Get-CurrentApiUrl)) -and
           (Test-SiteAlive) -and
           (Test-SiteConfigFresh)
}

# --------------------------- main loop ------------------------
Set-Location $script:project
# Remember our own PID so tools\stop.ps1 and tools\status.ps1 can find us.
Set-Content -Path (Join-Path $script:project 'guard.pid') -Value $PID -Force
Log '=========================================================='
Log 'Guard v7 started'
Log "Project : $script:project"
Log "Site    : $script:siteUrl"
Log "Tick    : $script:checkSec s$(if ($Once) { ' (single run)' })"
Log '=========================================================='

$tick = 0
while ($true) {
    $tick++
    try {
        $backendOk = Ensure-Backend

        if (-not $backendOk) {
            Log 'Backend unavailable - retrying on the next tick'
        }
        else {
            $tunnelUrl = Ensure-Tunnel

            if (-not $tunnelUrl) {
                Log 'No tunnel - retrying on the next tick'
            }
            else {
                $siteAlive  = Test-SiteAlive
                $configFresh = Test-SiteConfigFresh
                $apiOk      = Test-Api $tunnelUrl

                if ($apiOk -and $siteAlive -and $configFresh) {
                    if ($script:siteFails -ne 0) { Log 'All good: backend + tunnel + GitHub Pages' }
                    $script:siteFails = 0
                }
                elseif (-not $siteAlive) {
                    Log 'GitHub Pages site is not reachable - will re-check'
                }
                else {
                    $script:siteFails++
                    Log "Site does not use the current API URL yet (attempt $script:siteFails)"
                    if ($script:siteFails -ge 2) {
                        if (Push-Changes) {
                            Log 'Waiting for the GitHub Pages rebuild (up to 3 minutes)...'
                            Start-Sleep 60
                        }
                        $script:siteFails = 0
                    }
                }
            }
        }
    } catch {
        Log ('Tick error: ' + $_.Exception.Message)
    }

    if ($Once) { Log 'Single run finished'; break }
    Start-Sleep -Seconds $script:checkSec
}