param(
  [Parameter(Mandatory = $true)]
  [string]$AppDirectory,

  [Parameter(Mandatory = $true)]
  [string]$NodePath
)

$ErrorActionPreference = "Stop"

$logsDirectory = Join-Path $AppDirectory "logs"
New-Item -ItemType Directory -Path $logsDirectory -Force | Out-Null

$outLog = Join-Path $logsDirectory "isyou.out.log"
$errLog = Join-Path $logsDirectory "isyou.err.log"

$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
"[$stamp] Starting Isyou from $AppDirectory with $NodePath" | Out-File -LiteralPath $outLog -Encoding utf8 -Append

Set-Location -LiteralPath $AppDirectory
& $NodePath "server.mjs" 1>> $outLog 2>> $errLog

$exitCode = if ($LASTEXITCODE -ne $null) { $LASTEXITCODE } else { 0 }
$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
"[$stamp] Node exited with code $exitCode" | Out-File -LiteralPath $errLog -Encoding utf8 -Append
exit $exitCode
