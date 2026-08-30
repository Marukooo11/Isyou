#Requires -RunAsAdministrator
param(
  [string]$InstallRoot = "C:\Isyou",
  [int]$Port = 3000,
  [string]$PublicIp = "150.158.48.226"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if ($Port -lt 1 -or $Port -gt 65535) {
  throw "Port must be between 1 and 65535."
}

$taskName = "Isyou Demo"
$tempRoot = Join-Path $env:TEMP ("isyou-deploy-" + [guid]::NewGuid().ToString("N"))
$archivePath = Join-Path $tempRoot "isyou.zip"
$extractRoot = Join-Path $tempRoot "source"
$backupRoot = $null

function Resolve-NodeTools {
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $node) {
    Write-Host "Node.js was not found. Installing the latest Node.js 22 LTS release..."
    $releases = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json"
    $release = $releases |
      Where-Object { $_.version -like "v22.*" -and $_.lts -and $_.files -contains "win-x64-msi" } |
      Select-Object -First 1
    if (-not $release) {
      throw "Could not find a Node.js 22 LTS Windows MSI release."
    }

    $msiPath = Join-Path $tempRoot "node.msi"
    $msiUrl = "https://nodejs.org/dist/$($release.version)/node-$($release.version)-x64.msi"
    Invoke-WebRequest -Uri $msiUrl -OutFile $msiPath -UseBasicParsing
    $installer = Start-Process msiexec.exe -ArgumentList @("/i", $msiPath, "/qn", "/norestart") -Wait -PassThru
    if ($installer.ExitCode -ne 0) {
      throw "Node.js installer failed with exit code $($installer.ExitCode)."
    }
    $env:Path = "C:\Program Files\nodejs;" + $env:Path
    $node = Get-Command node.exe -ErrorAction Stop
  }

  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $npm) {
    $npmPath = Join-Path (Split-Path $node.Source) "npm.cmd"
    if (-not (Test-Path -LiteralPath $npmPath)) {
      throw "npm.cmd was not found next to Node.js."
    }
    $npm = Get-Item -LiteralPath $npmPath
  }

  $npmExecutable = if ($npm.Source) { $npm.Source } else { $npm.FullName }
  return @{ Node = $node.Source; Npm = $npmExecutable }
}

try {
  New-Item -ItemType Directory -Path $tempRoot, $extractRoot -Force | Out-Null
  $tools = Resolve-NodeTools

  $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($existingTask) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  }

  if (Test-Path -LiteralPath $InstallRoot) {
    $backupRoot = "$InstallRoot-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Move-Item -LiteralPath $InstallRoot -Destination $backupRoot
    Write-Host "Previous deployment backed up to $backupRoot"
  }

  Write-Host "Downloading Marukooo11/Isyou main branch..."
  Invoke-WebRequest -Uri "https://github.com/Marukooo11/Isyou/archive/refs/heads/main.zip" -OutFile $archivePath -UseBasicParsing
  Expand-Archive -LiteralPath $archivePath -DestinationPath $extractRoot -Force
  $repositoryRoot = Join-Path $extractRoot "Isyou-main"
  $sourceRoot = if (Test-Path -LiteralPath (Join-Path $repositoryRoot "server.mjs")) {
    $repositoryRoot
  } else {
    Join-Path $repositoryRoot "isyou-complete"
  }
  if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot "server.mjs"))) {
    throw "The downloaded repository does not contain a runnable server.mjs."
  }
  Move-Item -LiteralPath $sourceRoot -Destination $InstallRoot

  if ($backupRoot -and (Test-Path -LiteralPath (Join-Path $backupRoot ".env.local"))) {
    Copy-Item -LiteralPath (Join-Path $backupRoot ".env.local") -Destination (Join-Path $InstallRoot ".env.local")
  }

  $envPath = Join-Path $InstallRoot ".env.local"
  $envLines = if (Test-Path -LiteralPath $envPath) { Get-Content -LiteralPath $envPath -Encoding utf8 } else { @() }
  $envLines = @($envLines | Where-Object { $_ -notmatch '^(HOST|PORT)=' })
  @("HOST=0.0.0.0", "PORT=$Port") + $envLines | Set-Content -LiteralPath $envPath -Encoding utf8

  Write-Host "Installing production dependencies..."
  Push-Location $InstallRoot
  try {
    & $tools.Npm ci --omit=dev
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE." }
  } finally {
    Pop-Location
  }

  $firewallName = "Isyou Demo TCP $Port"
  try {
    if (-not (Get-NetFirewallRule -DisplayName $firewallName -ErrorAction SilentlyContinue)) {
      New-NetFirewallRule -DisplayName $firewallName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -ErrorAction Stop | Out-Null
    }
    Write-Host "Windows Firewall TCP $Port rule: OK"
  } catch {
    Write-Warning "The Firewall PowerShell API is unavailable; trying netsh instead. $($_.Exception.Message)"
    & netsh.exe advfirewall firewall add rule name="$firewallName" dir=in action=allow protocol=TCP localport=$Port | Out-Host
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "Windows Firewall could not be changed automatically. Deployment will continue; open TCP $Port in Tencent Cloud and Windows Firewall manually if required."
    }
  }

  & (Join-Path $InstallRoot "deploy\windows\install-startup.ps1") -TaskName $taskName -AppDirectory $InstallRoot
  Start-Sleep -Seconds 3
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:${Port}/health" -TimeoutSec 15
  if ($health.status -ne "ok") {
    throw "The health check returned an unexpected response."
  }

  Write-Host ""
  Write-Host "ISYOU_DEPLOY_OK" -ForegroundColor Green
  Write-Host "Local health check: OK"
  Write-Host "Public URL after opening Tencent Cloud firewall TCP ${Port}: http://${PublicIp}:${Port}/"
  Write-Host "Startup task: $taskName"
} finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
