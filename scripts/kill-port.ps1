# Kill whatever process is LISTENing on a TCP port. Windows / PowerShell only.
#
# Used by `npm run kill-port` when a stray Vite dev server (or a crashed
# `npm run app:dev`) is holding port 5173 and blocking a restart.
#
#   npm run kill-port              # port 5173 (the Vite dev port)
#   npm run kill-port -- -Port 4173   # some other port

param([int]$Port = 5173)

$conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $conns) {
  Write-Host "Nothing is listening on port $Port."
  exit 0
}

$conns | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
  $procId = $_
  try {
    $p = Get-Process -Id $procId -ErrorAction Stop
    Stop-Process -Id $procId -Force
    Write-Host "Killed PID $procId ($($p.ProcessName)) on port $Port."
  } catch {
    Write-Host "Could not stop PID $procId - $($_.Exception.Message)"
  }
}
