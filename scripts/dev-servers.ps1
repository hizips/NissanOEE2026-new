# Start or stop NissanOEE dev servers (Django backend + Vite frontend) on Windows.
#
# Usage:
#   .\scripts\dev-servers.ps1          # start (default)
#   .\scripts\dev-servers.ps1 start
#   .\scripts\dev-servers.ps1 stop
#   .\scripts\dev-servers.ps1 status
#   .\scripts\dev-servers.ps1 restart

param(
    [ValidateSet("start", "stop", "restart", "status")]
    [string]$Action = "start"
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$BackendDir = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"
$BackendPort = 8000
$FrontendPort = 5173
$PidFile = Join-Path $Root ".dev-servers.pids.json"

function Test-PortInUse {
    param([int]$Port)
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return $null -ne $conn
}

function Wait-ForPort {
    param([int]$Port, [string]$Label, [int]$Tries = 30)
    for ($i = 1; $i -le $Tries; $i++) {
        if (Test-PortInUse $Port) {
            Write-Host "  $Label ready on port $Port"
            return $true
        }
        Start-Sleep -Seconds 1
    }
    Write-Error "$Label did not start on port $Port within ${Tries}s"
    return $false
}

function Get-LanIPv4 {
    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -match '^192\.168\.2\.' } |
        Select-Object -First 1 -ExpandProperty IPAddress
}

function Read-PidFile {
    if (Test-Path $PidFile) {
        Get-Content $PidFile -Raw | ConvertFrom-Json
    } else {
        [PSCustomObject]@{ backend = $null; frontend = $null }
    }
}

function Write-PidFile {
    param($Data)
    $Data | ConvertTo-Json | Set-Content $PidFile -Encoding UTF8
}

function Stop-ProcessSafe {
    param([int]$ProcessId)
    if (-not $ProcessId) { return }
    $proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if ($proc) {
        Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
        Write-Host "  stopped process $ProcessId"
    }
}

function Ensure-BackendDeps {
    $python = Join-Path $BackendDir ".venv\Scripts\python.exe"
    if (-not (Test-Path $python)) {
        Write-Error "Backend virtualenv missing. Run:`n  cd backend`n  python -m venv .venv`n  .\.venv\Scripts\pip install -r requirements.txt"
    }
}

function Ensure-FrontendDeps {
    if (-not (Test-Path (Join-Path $FrontendDir "node_modules"))) {
        Write-Error "Frontend node_modules missing. Run:`n  npm install --prefix frontend"
    }
}

function Start-Backend {
    if (Test-PortInUse $BackendPort) {
        Write-Host "Backend already listening on port $BackendPort"
        return
    }
    Ensure-BackendDeps
    Write-Host "Starting backend (Django)..."
    $python = Join-Path $BackendDir ".venv\Scripts\python.exe"
    $proc = Start-Process -FilePath $python `
        -ArgumentList "manage.py", "runserver", "0.0.0.0:$BackendPort" `
        -WorkingDirectory $BackendDir `
        -PassThru -WindowStyle Hidden
    $pids = Read-PidFile
    $pids.backend = $proc.Id
    Write-PidFile $pids
    Wait-ForPort $BackendPort "Backend" | Out-Null
}

function Start-Frontend {
    if (Test-PortInUse $FrontendPort) {
        Write-Host "Frontend already listening on port $FrontendPort"
        return
    }
    Ensure-FrontendDeps
    Write-Host "Starting frontend (Vite)..."
    $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
    $proc = Start-Process -FilePath $npm `
        -ArgumentList "run", "dev", "--", "--host", "0.0.0.0", "--port", "$FrontendPort" `
        -WorkingDirectory $FrontendDir `
        -PassThru -WindowStyle Hidden
    $pids = Read-PidFile
    $pids.frontend = $proc.Id
    Write-PidFile $pids
    Wait-ForPort $FrontendPort "Frontend" | Out-Null
}

function Stop-Backend {
    $pids = Read-PidFile
    if ($pids.backend) { Stop-ProcessSafe $pids.backend }
    $pids.backend = $null
    Write-PidFile $pids
    if (Test-PortInUse $BackendPort) {
        Write-Host "Backend still on port $BackendPort (may need manual kill)"
    } else {
        Write-Host "Backend stopped"
    }
}

function Stop-Frontend {
    $pids = Read-PidFile
    if ($pids.frontend) { Stop-ProcessSafe $pids.frontend }
    $pids.frontend = $null
    Write-PidFile $pids
    if (Test-PortInUse $FrontendPort) {
        Write-Host "Frontend still on port $FrontendPort (may need manual kill)"
    } else {
        Write-Host "Frontend stopped"
    }
}

function Print-Status {
    $backendUp = Test-PortInUse $BackendPort
    $frontendUp = Test-PortInUse $FrontendPort
    Write-Host "NissanOEE dev servers"
    Write-Host "  Backend  ($BackendPort): $(if ($backendUp) { 'UP' } else { 'DOWN' })"
    Write-Host "  Frontend ($FrontendPort): $(if ($frontendUp) { 'UP' } else { 'DOWN' })"
    Write-Host ""
    Write-Host "URLs (this machine):"
    Write-Host "  API:   http://localhost:$BackendPort/api/"
    Write-Host "  App:   http://localhost:$FrontendPort/"
    Write-Host "  Admin: http://localhost:$BackendPort/admin/"
    $lan = Get-LanIPv4
    if ($lan) {
        Write-Host ""
        Write-Host "LAN (192.168.2.0/24):"
        Write-Host "  App:   http://${lan}:$FrontendPort/"
        Write-Host "  API:   http://${lan}:$BackendPort/api/"
        Write-Host "  Admin: http://${lan}:$BackendPort/admin/"
    }
}

switch ($Action) {
    "start" {
        Write-Host "==> Starting NissanOEE dev servers from $Root"
        Start-Backend
        Start-Frontend
        Write-Host ""
        Print-Status
    }
    "stop" {
        Write-Host "==> Stopping NissanOEE dev servers"
        Stop-Backend
        Stop-Frontend
        Write-Host "Done."
    }
    "restart" {
        Write-Host "==> Restarting NissanOEE dev servers"
        Stop-Backend
        Stop-Frontend
        Start-Sleep -Seconds 1
        Start-Backend
        Start-Frontend
        Write-Host ""
        Print-Status
    }
    "status" { Print-Status }
}
