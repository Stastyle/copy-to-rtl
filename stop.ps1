$projectMarker = 'copy-to-rtl'

Write-Host "Stopping Copy to RTL processes..."

$stopped = 0

Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | ForEach-Object {
  $cmd = $_.CommandLine
  $exe = $_.ExecutablePath

  $isProjectProcess =
    ($cmd -and $cmd -like "*$projectMarker*") -or
    ($exe -and $exe -like "*$projectMarker*")

  if ($isProjectProcess -and ($_.Name -in @('electron.exe', 'node.exe'))) {
    Write-Host "  Stopping $($_.Name) (PID $($_.ProcessId))"
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    $stopped++
  }
}

if ($stopped -eq 0) {
  Write-Host "No Copy to RTL processes found."
} else {
  Write-Host "Stopped $stopped process(es)."
}