param([string]$TaskName = "Isyou Demo")

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Output "Scheduled task '$TaskName' removed."
} else {
  Write-Output "Scheduled task '$TaskName' was not installed."
}
