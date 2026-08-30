param(
  [string]$TaskName = "Isyou Demo",
  [string]$AppDirectory = (Resolve-Path (Join-Path $PSScriptRoot "..\.."))
)

$ErrorActionPreference = "Stop"
$nodePath = (Get-Command node -ErrorAction Stop).Source
$serverPath = Join-Path $AppDirectory "server.mjs"
if (-not (Test-Path -LiteralPath $serverPath)) {
  throw "server.mjs not found in $AppDirectory"
}

$runnerPath = Join-Path $AppDirectory "deploy\windows\run-isyou.ps1"
if (-not (Test-Path -LiteralPath $runnerPath)) {
  throw "run-isyou.ps1 not found in $AppDirectory\deploy\windows"
}

$logsDirectory = Join-Path $AppDirectory "logs"
New-Item -ItemType Directory -Path $logsDirectory -Force | Out-Null

$runnerArgs = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", "`"$runnerPath`"",
  "-AppDirectory", "`"$AppDirectory`"",
  "-NodePath", "`"$nodePath`""
) -join " "

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $runnerArgs -WorkingDirectory $AppDirectory
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Output "Scheduled task '$TaskName' installed and started."
